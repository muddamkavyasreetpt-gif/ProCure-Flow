import crypto from 'crypto';
import { supabase, rpcAppendAuditLog, rpcReserveBudget, rpcReleaseBudget } from '../db/supabase';
import { env } from '../config/env';
import { RunContext, PurchaseOrder } from '../types';
import { ToolContext } from '../tools/types';
import { recordStep } from '../services/stepService';
import { emitRunEvent } from '../events/runEvents';
import { runAgentTurn } from '../llm/runAgentTurn';
import {
  ORCHESTRATOR_PLAN_PROMPT,
  ORCHESTRATOR_REPLAN_PROMPT,
  POLICY_AGENT_PROMPT,
  BUDGET_AGENT_PROMPT,
  VENDOR_AGENT_PROMPT,
  APPROVAL_AGENT_PROMPT,
  EXECUTION_AGENT_PROMPT,
  AUDITOR_AGENT_PROMPT,
  sanitizeAndWrapUserRequest
} from './prompts';
import {
  OrchestratorPlanSchema,
  OrchestratorReplanSchema,
  PolicyAgentOutputSchema,
  BudgetAgentOutputSchema,
  VendorAgentOutputSchema,
  ApprovalAgentOutputSchema,
  ExecutionAgentOutputSchema,
  AuditorAgentOutputSchema,
  OrchestratorPlanOutput,
  VendorAgentOutput,
  AuditorAgentOutput
} from './schemas';
import {
  DEFAULT_SIX_STEP_PLAN,
  fallbackOrchestratorPlan,
  fallbackOrchestratorReplan,
  fallbackPolicyAgent,
  fallbackBudgetCheckAgent,
  fallbackVendorAgent,
  fallbackApprovalAgent,
  fallbackExecutionAgent,
  fallbackAuditorAgent,
  formatINR
} from './fallbacks';
import { heuristicParseRequest, VALID_CATEGORIES } from './heuristicParser';
import {
  isBlocked,
  assertBudgetAvailable,
  recomputeTotal,
  computeRequiredRoute,
  computeMaxAffordableQuantity,
  matchCatalogItems,
  maxRoute,
  ApprovalRoute
} from '../guardrails';
import { getRegisteredTool, getAgentTools } from '../tools/registry';
import { createPurchaseOrderForRun } from '../tools/erpTools';

const EXPECTED_PLAN_IDS = [
  'policy_check',
  'budget_check',
  'vendor_selection',
  'approval_routing',
  'execution',
  'audit'
];

function ensureValidPlan(plan: OrchestratorPlanOutput['plan']): OrchestratorPlanOutput['plan'] {
  if (!Array.isArray(plan) || plan.length !== EXPECTED_PLAN_IDS.length) {
    return DEFAULT_SIX_STEP_PLAN;
  }
  for (let i = 0; i < EXPECTED_PLAN_IDS.length; i++) {
    if (plan[i]?.id !== EXPECTED_PLAN_IDS[i]) {
      return DEFAULT_SIX_STEP_PLAN;
    }
  }
  return plan;
}

export class AgentOrchestrator {
  async execute(context: RunContext): Promise<void> {
    const startTime = Date.now();
    let reservedAmount = 0;

    const checkTimeout = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed > env.RUN_TIMEOUT_MS) {
        throw new Error(`Run exceeded active timeout of ${env.RUN_TIMEOUT_MS}ms`);
      }
    };

    const toolCtx: ToolContext = {
      runId: context.runId,
      requestId: context.requestId,
      departmentId: context.departmentId,
      requesterId: context.requesterId,
      requesterEmail: context.requesterEmail,
      excludeVendorIds: [],
      allowedQuoteVendorIds: new Set<string>()
    };

    try {
      emitRunEvent(context.runId, 'status', { status: 'running' });

      // =========================================================================
      // 1. ORCHESTRATOR: PLAN
      // =========================================================================
      const planStart = Date.now();
      const userPromptBlock = `${sanitizeAndWrapUserRequest(context.rawText)}\nUrgency: ${
        context.urgency
      }\nJustification: ${context.justification || 'None provided'}`;

      const orchTools = getAgentTools('orchestrator');
      const planTurn = await runAgentTurn({
        agentName: 'orchestrator',
        systemInstruction: ORCHESTRATOR_PLAN_PROMPT,
        userPayload: userPromptBlock,
        toolDeclarations: orchTools.declarations,
        toolExecutors: orchTools.executors,
        ctx: toolCtx,
        schema: OrchestratorPlanSchema,
        fallbackFn: () => fallbackOrchestratorPlan(context.rawText)
      });

      const heuristic = heuristicParseRequest(context.rawText);
      let parsed = planTurn.data.parsed;

      // Guardrail: verify valid category & prohibit bypass of prohibited keywords
      if (
        !VALID_CATEGORIES.includes(parsed.category as any) ||
        heuristic.category === 'Prohibited Items'
      ) {
        parsed = heuristic;
      }
      if (!parsed.items || parsed.items.length === 0) {
        parsed.items = heuristic.items;
      }
      if (parsed.neededByDays === null && heuristic.neededByDays !== null) {
        parsed.neededByDays = heuristic.neededByDays;
      }
      if (parsed.statedBudget === null && heuristic.statedBudget !== null) {
        parsed.statedBudget = heuristic.statedBudget;
      }

      const plan = ensureValidPlan(planTurn.data.plan);
      toolCtx.neededByDays = parsed.neededByDays;
      context.parsed = parsed;
      context.plan = plan;

      const extraItems =
        parsed.items.length > 1
          ? parsed.items.slice(1).map((i: { name: string; quantity: number }) => `${i.quantity}x ${i.name}`)
          : [];

      await supabase
        .from('purchase_requests')
        .update({
          parsed,
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', context.requestId);

      await supabase
        .from('agent_runs')
        .update({
          plan,
          status: 'running'
        })
        .eq('id', context.runId);

      await recordStep(context.runId, 'orchestrator', 'plan', {
        title: `Execution Plan (${parsed.category})`,
        input: { rawText: context.rawText, urgency: context.urgency, justification: context.justification },
        output: {
          parsed,
          plan,
          fallback: planTurn.fallback,
          fallbackReason: planTurn.fallbackReason
        },
        rationale: planTurn.data.rationale,
        confidence: planTurn.data.confidence,
        durationMs: Date.now() - planStart
      });

      await rpcAppendAuditLog({
        runId: context.runId,
        actorType: 'agent',
        actor: 'orchestrator',
        action: 'PLAN_CREATED',
        entityType: 'agent_run',
        entityId: context.runId,
        details: {
          category: parsed.category,
          items: parsed.items,
          statedBudget: parsed.statedBudget,
          neededByDays: parsed.neededByDays
        }
      });

      checkTimeout();

      // =========================================================================
      // 2. POLICY AGENT
      // =========================================================================
      const policyStart = Date.now();
      const polTools = getAgentTools('policy');
      const policyTurn = await runAgentTurn({
        agentName: 'policy',
        systemInstruction: POLICY_AGENT_PROMPT,
        userPayload: JSON.stringify({
          parsed,
          urgency: context.urgency,
          justification: context.justification || null,
          rawRequest: sanitizeAndWrapUserRequest(context.rawText)
        }),
        toolDeclarations: polTools.declarations,
        toolExecutors: polTools.executors,
        ctx: toolCtx,
        schema: PolicyAgentOutputSchema,
        fallbackFn: () =>
          fallbackPolicyAgent(toolCtx, parsed, context.rawText, context.justification)
      });

      // Deterministic guardrail check on policy row and prohibited hints
      const { data: policyRowData } = await supabase
        .from('policies')
        .select('*')
        .eq('category', parsed.category)
        .maybeSingle();

      const hintTool = getRegisteredTool('list_policy_violations_hint')!;
      const hintCheck = await hintTool.handler({ text: context.rawText }, toolCtx);
      const hintProhibited = Boolean((hintCheck.data as any)?.isProhibited);

      const effectiveCategory = hintProhibited ? 'Prohibited Items' : parsed.category;
      const policyRow = policyRowData || {
        category: effectiveCategory,
        auto_approve_limit: 50000,
        manager_limit: 500000,
        min_quotes: 1,
        requires_justification_above: 100000,
        is_blocked: effectiveCategory === 'Prohibited Items'
      };

      const policyBlocked = isBlocked(policyRow) || hintProhibited;
      const policyOut = policyTurn.data;
      policyOut.status = policyBlocked ? 'blocked' : 'passed';
      policyOut.policy = {
        category: policyRow.category,
        autoApproveLimit: Number(policyRow.auto_approve_limit),
        managerLimit: Number(policyRow.manager_limit),
        minQuotes: Number(policyRow.min_quotes)
      };

      if (policyBlocked && policyOut.violations.length === 0) {
        policyOut.violations = [
          `Category "${policyRow.category}" is blocked under corporate procurement policy.`
        ];
      }

      const justificationProvided = Boolean(
        context.justification && context.justification.trim().length > 0
      );
      policyOut.justificationProvided = justificationProvided;

      await recordStep(context.runId, 'policy', 'decision', {
        title:
          policyOut.status === 'blocked'
            ? `Policy Blocked: ${policyRow.category}`
            : `Policy Verified: ${policyRow.category}`,
        input: { category: parsed.category, justificationProvided },
        output: {
          ...policyOut,
          fallback: policyTurn.fallback,
          fallbackReason: policyTurn.fallbackReason
        },
        rationale: policyOut.rationale,
        confidence: policyOut.confidence,
        durationMs: Date.now() - policyStart
      });

      await rpcAppendAuditLog({
        runId: context.runId,
        actorType: 'agent',
        actor: 'policy',
        action: policyBlocked ? 'POLICY_BLOCKED' : 'POLICY_PASSED',
        entityType: 'purchase_request',
        entityId: context.requestId,
        details: {
          category: policyRow.category,
          status: policyOut.status,
          violations: policyOut.violations
        }
      });

      if (policyBlocked) {
        // Collect permitted categories for smart alternatives on policy block
        const { data: allPolicies } = await supabase.from('policies').select('category, is_blocked');
        const permittedCategories = (allPolicies || [])
          .filter((p: any) => !p.is_blocked && p.category !== 'Prohibited Items')
          .map((p: any) => p.category);

        policyOut.permittedCategories = permittedCategories;

        const blockReason =
          policyOut.violations.join(' ') ||
          `Request blocked by Policy Agent: ${policyRow.category} is prohibited. Permitted categories: ${permittedCategories.join(', ')}.`;
        const auditorOut = await this.runAuditorStep(toolCtx, {
          outcome: 'blocked',
          reason: blockReason,
          extraItems
        });

        const activeMs = Date.now() - startTime;
        await supabase
          .from('agent_runs')
          .update({
            status: 'rejected',
            final_decision: 'rejected',
            summary: auditorOut.summary,
            active_ms: activeMs,
            time_saved_minutes: 0,
            finished_at: new Date().toISOString()
          })
          .eq('id', context.runId);

        await supabase
          .from('purchase_requests')
          .update({
            status: 'rejected',
            updated_at: new Date().toISOString()
          })
          .eq('id', context.requestId);

        await rpcAppendAuditLog({
          runId: context.runId,
          actorType: 'agent',
          actor: 'orchestrator',
          action: 'RUN_REJECTED_POLICY',
          entityType: 'agent_run',
          entityId: context.runId,
          details: { reason: blockReason, activeMs }
        });

        emitRunEvent(context.runId, 'status', { status: 'rejected', summary: auditorOut.summary });
        emitRunEvent(context.runId, 'done', { status: 'rejected' });
        return;
      }

      checkTimeout();

      // =========================================================================
      // 3. BUDGET AGENT — MODE: CHECK
      // =========================================================================
      const budgetStart = Date.now();
      const bTools = getAgentTools('budget');
      const budgetTurn = await runAgentTurn({
        agentName: 'budget',
        systemInstruction: BUDGET_AGENT_PROMPT,
        userPayload: JSON.stringify({
          parsed,
          departmentId: context.departmentId
        }),
        toolDeclarations: bTools.declarations,
        toolExecutors: bTools.executors,
        ctx: toolCtx,
        schema: BudgetAgentOutputSchema,
        fallbackFn: () => fallbackBudgetCheckAgent(toolCtx, parsed)
      });

      // Deterministic guardrail check on department budget vs minimum catalog estimate
      const { data: budgetRow } = await supabase
        .from('budgets')
        .select('*')
        .eq('department_id', context.departmentId)
        .eq('fiscal_year', 2026)
        .single();

      const estimateTool = getRegisteredTool('estimate_cost')!;
      const estRes = await estimateTool.handler(
        {
          category: parsed.category,
          items: parsed.items.map((i: { name: string; quantity: number }) => ({
            name: i.name,
            quantity: i.quantity
          }))
        },
        toolCtx
      );
      const minEstimate = (estRes.data as any)?.minEstimate;
      const requiredEstimate =
        minEstimate !== null && minEstimate !== undefined
          ? Number(minEstimate)
          : Number(parsed.statedBudget ?? 0);

      const budgetCheck = budgetRow
        ? assertBudgetAvailable(budgetRow, requiredEstimate)
        : { ok: false, available: 0, reason: 'Department budget not found' };

      const budgetOut = budgetTurn.data;
      budgetOut.mode = 'check';
      budgetOut.available = budgetCheck.available;
      budgetOut.requested = requiredEstimate;
      budgetOut.status = budgetCheck.ok ? 'ok' : 'insufficient';
      budgetOut.reservedAmount = null;

      if (!budgetCheck.ok) {
        budgetOut.rationale = `Department only has ${formatINR(
          budgetCheck.available
        )} available in its FY 2026 budget, whereas the minimum approved catalog estimate for this request is ${formatINR(
          requiredEstimate
        )}. Request rejected due to insufficient budget.`;
      }

      await recordStep(context.runId, 'budget', 'decision', {
        title: budgetCheck.ok
          ? `Budget Check Passed (${formatINR(budgetCheck.available)} available)`
          : `Budget Insufficient (${formatINR(budgetCheck.available)} available vs ${formatINR(
              requiredEstimate
            )} needed)`,
        input: { departmentId: context.departmentId, estimatedMinimum: requiredEstimate },
        output: {
          ...budgetOut,
          fallback: budgetTurn.fallback,
          fallbackReason: budgetTurn.fallbackReason
        },
        rationale: budgetOut.rationale,
        confidence: budgetOut.confidence,
        durationMs: Date.now() - budgetStart
      });

      await rpcAppendAuditLog({
        runId: context.runId,
        actorType: 'agent',
        actor: 'budget',
        action: budgetCheck.ok ? 'BUDGET_CHECK_OK' : 'BUDGET_INSUFFICIENT',
        entityType: 'purchase_request',
        entityId: context.requestId,
        details: {
          available: budgetCheck.available,
          requested: requiredEstimate,
          status: budgetOut.status
        }
      });

      if (!budgetCheck.ok) {
        // Deterministically compute maximum affordable quantity at cheapest approved vendor
        const primaryItem = parsed.items[0];
        const { data: vCatalog } = await supabase
          .from('vendor_catalog')
          .select('*')
          .eq('category', parsed.category);
        const { data: appVendors } = await supabase
          .from('vendors')
          .select('*')
          .eq('approved', true);
        const appSet = new Set((appVendors || []).map((v: any) => v.id));
        const matched = primaryItem
          ? matchCatalogItems(vCatalog || [], parsed.category, primaryItem.name).filter((c) =>
              appSet.has(c.vendor_id)
            )
          : [];
        const cheapestItem = matched.sort((a, b) => Number(a.unit_price) - Number(b.unit_price))[0];
        const cheapestUnitPrice = cheapestItem ? Number(cheapestItem.unit_price) : 0;
        const maxAffordableQty = computeMaxAffordableQuantity(
          budgetCheck.available,
          cheapestUnitPrice
        );

        budgetOut.suggestedAlternative = {
          maxAffordableQuantity: maxAffordableQty,
          cheapestUnitPrice,
          cheapestVendorName: cheapestItem
            ? appVendors?.find((v: any) => v.id === cheapestItem.vendor_id)?.name || 'Approved Vendor'
            : null,
          itemName: primaryItem?.name || 'unit'
        };

        const rejectReason = budgetOut.rationale;
        const auditorOut = await this.runAuditorStep(toolCtx, {
          outcome: 'rejected',
          reason: rejectReason,
          extraItems
        });

        const activeMs = Date.now() - startTime;
        await supabase
          .from('agent_runs')
          .update({
            status: 'rejected',
            final_decision: 'rejected',
            summary: auditorOut.summary,
            active_ms: activeMs,
            time_saved_minutes: 0,
            finished_at: new Date().toISOString()
          })
          .eq('id', context.runId);

        await supabase
          .from('purchase_requests')
          .update({
            status: 'rejected',
            estimated_total: requiredEstimate,
            updated_at: new Date().toISOString()
          })
          .eq('id', context.requestId);

        await rpcAppendAuditLog({
          runId: context.runId,
          actorType: 'agent',
          actor: 'orchestrator',
          action: 'RUN_REJECTED_BUDGET',
          entityType: 'agent_run',
          entityId: context.runId,
          details: {
            available: budgetCheck.available,
            requested: requiredEstimate,
            activeMs
          }
        });

        emitRunEvent(context.runId, 'status', { status: 'rejected', summary: auditorOut.summary });
        emitRunEvent(context.runId, 'done', { status: 'rejected' });
        return;
      }

      checkTimeout();

      // =========================================================================
      // 4. VENDOR AGENT (WITH AUTONOMOUS RE-PLANNING ON STOCK SHORTAGE)
      // =========================================================================
      let replanCount = 0;
      let finalVendorOut: VendorAgentOutput | null = null;
      const quotesTool = getRegisteredTool('get_catalog_quotes')!;
      const stockTool = getRegisteredTool('check_stock')!;
      const vTools = getAgentTools('vendor');

      while (true) {
        const vendorStart = Date.now();
        const vendorTurn = await runAgentTurn({
          agentName: 'vendor',
          systemInstruction: VENDOR_AGENT_PROMPT,
          userPayload: JSON.stringify({
            category: parsed.category,
            items: parsed.items,
            neededByDays: parsed.neededByDays,
            excludeVendorIds: toolCtx.excludeVendorIds || []
          }),
          toolDeclarations: vTools.declarations,
          toolExecutors: vTools.executors,
          ctx: toolCtx,
          schema: VendorAgentOutputSchema,
          fallbackFn: () => fallbackVendorAgent(toolCtx, parsed)
        });

        // Deterministic verification of ranking, exclusions, and top-candidate stock
        const quotesRes = await quotesTool.handler(
          {
            category: parsed.category,
            items: parsed.items.map((i: { name: string; quantity: number }) => ({
              name: i.name,
              quantity: i.quantity
            }))
          },
          toolCtx
        );
        const deterministicQuotes = ((quotesRes.data as any)?.quotes || []) as any[];
        const eligibleQuotes = deterministicQuotes.filter((q) => q.excludedReason === null);
        const fallbackUsedFlag = Boolean(
          toolCtx.excludeVendorIds && toolCtx.excludeVendorIds.length > 0
        );

        const vendorOut = vendorTurn.data;
        vendorOut.fallbackUsed = fallbackUsedFlag;

        if (eligibleQuotes.length === 0) {
          vendorOut.status = 'failed';
          vendorOut.selected = null;
          vendorOut.considered = deterministicQuotes.map((q) => ({
            vendorId: q.vendorId,
            vendorName: q.vendorName,
            unitPrice: Number(q.unitPrice),
            total: Number(q.total),
            leadTimeDays: Number(q.leadTimeDays),
            rating: Number(q.rating),
            riskLevel: q.riskLevel,
            score: Number(q.score),
            stockOk: q.stockOk,
            excludedReason: q.excludedReason
          }));
        } else {
          const topQuote = eligibleQuotes[0];
          const stockRes = await stockTool.handler(
            {
              vendorId: topQuote.vendorId,
              itemName: topQuote.itemName,
              quantity: topQuote.quantity
            },
            toolCtx
          );
          const stockData = (stockRes.data as any) || { stockOk: false, stockQty: 0 };
          const topStockOk = Boolean(stockData.stockOk);

          vendorOut.considered = deterministicQuotes.map((q) => ({
            vendorId: q.vendorId,
            vendorName: q.vendorName,
            unitPrice: Number(q.unitPrice),
            total: Number(q.total),
            leadTimeDays: Number(q.leadTimeDays),
            rating: Number(q.rating),
            riskLevel: q.riskLevel,
            score: Number(q.score),
            stockOk: q.vendorId === topQuote.vendorId ? topStockOk : q.stockOk,
            excludedReason: q.excludedReason
          }));

          if (!topStockOk) {
            vendorOut.status = 'needs_replan';
            vendorOut.selected = null;
            vendorOut.failedVendorId = topQuote.vendorId;
            vendorOut.rationale = `Top-ranked vendor ${topQuote.vendorName} (score ${Number(
              topQuote.score
            ).toFixed(2)}) only has ${stockData.stockQty} unit(s) in stock against ${
              topQuote.quantity
            } required. Returning needs_replan so the Orchestrator can exclude ${
              topQuote.vendorName
            } and re-plan.`;
          } else {
            const verifiedTotal = recomputeTotal(
              Number(topQuote.unitPrice),
              Number(topQuote.quantity)
            );
            const expectedDelivery = new Date(
              Date.now() + Number(topQuote.leadTimeDays) * 86400_000
            )
              .toISOString()
              .slice(0, 10);

            const llmPickedDifferent =
              vendorOut.selected && vendorOut.selected.vendorId !== topQuote.vendorId;

            vendorOut.status = 'selected';
            vendorOut.failedVendorId = null;
            vendorOut.selected = {
              vendorId: topQuote.vendorId,
              vendorName: topQuote.vendorName,
              itemName: topQuote.itemName,
              quantity: Number(topQuote.quantity),
              unitPrice: Number(topQuote.unitPrice),
              total: verifiedTotal,
              leadTimeDays: Number(topQuote.leadTimeDays),
              riskLevel: topQuote.riskLevel,
              expectedDelivery
            };

            if (llmPickedDifferent) {
              vendorOut.rationale += ` [Guardrail note: Enforced top-ranked vendor ${topQuote.vendorName} with verified stock.]`;
            }
          }
        }

        await recordStep(context.runId, 'vendor', 'decision', {
          title:
            vendorOut.status === 'selected'
              ? `Vendor Selected: ${vendorOut.selected?.vendorName} (${formatINR(
                  vendorOut.selected?.total || 0
                )})`
              : vendorOut.status === 'needs_replan'
              ? 'Stock Shortage Detected — Requesting Re-plan'
              : 'Vendor Selection Failed',
          input: {
            category: parsed.category,
            excludeVendorIds: toolCtx.excludeVendorIds || []
          },
          output: {
            ...vendorOut,
            fallback: vendorTurn.fallback,
            fallbackReason: vendorTurn.fallbackReason
          },
          rationale: vendorOut.rationale,
          confidence: vendorOut.confidence,
          durationMs: Date.now() - vendorStart
        });

        if (vendorOut.status === 'selected' && vendorOut.selected) {
          finalVendorOut = vendorOut;
          await rpcAppendAuditLog({
            runId: context.runId,
            actorType: 'agent',
            actor: 'vendor',
            action: 'VENDOR_SELECTED',
            entityType: 'vendor',
            entityId: vendorOut.selected.vendorId,
            details: {
              vendorName: vendorOut.selected.vendorName,
              unitPrice: vendorOut.selected.unitPrice,
              quantity: vendorOut.selected.quantity,
              total: vendorOut.selected.total,
              fallbackUsed: vendorOut.fallbackUsed
            }
          });
          break;
        }

        if (vendorOut.status === 'needs_replan' && vendorOut.failedVendorId) {
          const failedVendorId = vendorOut.failedVendorId;
          const failedVendorName =
            vendorOut.considered.find((c) => c.vendorId === failedVendorId)?.vendorName ||
            failedVendorId;

          const replanStart = Date.now();
          const replanTurn = await runAgentTurn({
            agentName: 'orchestrator',
            systemInstruction: ORCHESTRATOR_REPLAN_PROMPT,
            userPayload: JSON.stringify({
              originalPlan: plan,
              failedStep: vendorOut,
              replanCount
            }),
            toolDeclarations: orchTools.declarations,
            toolExecutors: orchTools.executors,
            ctx: toolCtx,
            schema: OrchestratorReplanSchema,
            fallbackFn: () =>
              fallbackOrchestratorReplan({
                failedVendorId,
                failedVendorName,
                replanCount,
                existingExcludeIds: toolCtx.excludeVendorIds || []
              })
          });

          const mergedExcludes = Array.from(
            new Set([...(toolCtx.excludeVendorIds || []), failedVendorId])
          );
          const replanOut = replanTurn.data;
          replanOut.adjustments.excludeVendorIds = mergedExcludes;

          if (replanCount >= 2) {
            replanOut.action = 'abort';
          }

          replanCount += 1;
          toolCtx.excludeVendorIds = mergedExcludes;

          await supabase
            .from('agent_runs')
            .update({ replan_count: replanCount })
            .eq('id', context.runId);

          await recordStep(context.runId, 'orchestrator', 'replan', {
            title: `Autonomous Re-plan #${replanCount}: Excluded ${failedVendorName} (Insufficient Stock)`,
            input: {
              failedVendorId,
              failedVendorName,
              replanCount
            },
            output: {
              ...replanOut,
              replanCount,
              fallback: replanTurn.fallback,
              fallbackReason: replanTurn.fallbackReason
            },
            rationale: replanOut.rationale,
            confidence: replanOut.confidence,
            durationMs: Date.now() - replanStart
          });

          await rpcAppendAuditLog({
            runId: context.runId,
            actorType: 'agent',
            actor: 'orchestrator',
            action: 'ORCHESTRATOR_REPLAN',
            entityType: 'agent_run',
            entityId: context.runId,
            details: {
              replanCount,
              action: replanOut.action,
              excludeVendorIds: mergedExcludes
            }
          });

          if (replanOut.action === 'abort') {
            const abortReason = `All eligible vendors exhausted after ${replanCount} re-plan(s): ${replanOut.rationale}`;
            const auditorOut = await this.runAuditorStep(toolCtx, {
              outcome: 'rejected',
              reason: abortReason,
              replanCount,
              extraItems
            });

            const activeMs = Date.now() - startTime;
            await supabase
              .from('agent_runs')
              .update({
                status: 'rejected',
                final_decision: 'rejected',
                summary: auditorOut.summary,
                active_ms: activeMs,
                finished_at: new Date().toISOString()
              })
              .eq('id', context.runId);

            await supabase
              .from('purchase_requests')
              .update({
                status: 'rejected',
                updated_at: new Date().toISOString()
              })
              .eq('id', context.requestId);

            emitRunEvent(context.runId, 'status', {
              status: 'rejected',
              summary: auditorOut.summary
            });
            emitRunEvent(context.runId, 'done', { status: 'rejected' });
            return;
          }

          checkTimeout();
          continue;
        }

        // Vendor failed with no candidates
        const failReason =
          vendorOut.rationale || 'No eligible vendor with matching catalog items found.';
        const auditorOut = await this.runAuditorStep(toolCtx, {
          outcome: 'rejected',
          reason: failReason,
          replanCount,
          extraItems
        });

        const activeMs = Date.now() - startTime;
        await supabase
          .from('agent_runs')
          .update({
            status: 'rejected',
            final_decision: 'rejected',
            summary: auditorOut.summary,
            active_ms: activeMs,
            finished_at: new Date().toISOString()
          })
          .eq('id', context.runId);

        await supabase
          .from('purchase_requests')
          .update({
            status: 'rejected',
            updated_at: new Date().toISOString()
          })
          .eq('id', context.requestId);

        emitRunEvent(context.runId, 'status', { status: 'rejected', summary: auditorOut.summary });
        emitRunEvent(context.runId, 'done', { status: 'rejected' });
        return;
      }

      const selectedQuote = finalVendorOut!.selected!;
      const consideredVendors = finalVendorOut!.considered;

      await supabase
        .from('purchase_requests')
        .update({
          estimated_total: selectedQuote.total,
          updated_at: new Date().toISOString()
        })
        .eq('id', context.requestId);

      // =========================================================================
      // 5. BUDGET AGENT — MODE: RESERVE (DETERMINISTIC RPC, NO LLM TURN)
      // =========================================================================
      const reserveStart = Date.now();
      await recordStep(context.runId, 'budget', 'tool_call', {
        title: 'Calling reserve_budget (atomic RPC)',
        input: {
          departmentId: context.departmentId,
          fiscalYear: 2026,
          amount: selectedQuote.total
        },
        durationMs: 4
      });

      const reservedOk = await rpcReserveBudget(context.departmentId, selectedQuote.total, 2026);

      const { data: updatedBudgetRow } = await supabase
        .from('budgets')
        .select('*')
        .eq('department_id', context.departmentId)
        .eq('fiscal_year', 2026)
        .single();

      const remainingAfterReserve = updatedBudgetRow
        ? Number(updatedBudgetRow.total_amount) -
          Number(updatedBudgetRow.reserved_amount) -
          Number(updatedBudgetRow.spent_amount)
        : 0;

      await recordStep(context.runId, 'budget', 'tool_result', {
        title: 'Result from reserve_budget',
        input: { amount: selectedQuote.total },
        output: {
          reserved: reservedOk,
          reservedAmount: reservedOk ? selectedQuote.total : null,
          availableAfterReserve: remainingAfterReserve
        },
        durationMs: 10
      });

      const reserveDecisionOut = {
        mode: 'reserve' as const,
        status: reservedOk ? ('ok' as const) : ('insufficient' as const),
        available: remainingAfterReserve,
        requested: selectedQuote.total,
        reservedAmount: reservedOk ? selectedQuote.total : null,
        rationale: reservedOk
          ? `Atomically reserved ${formatINR(
              selectedQuote.total
            )} from the FY 2026 department budget for ${selectedQuote.vendorName}. Remaining unreserved balance: ${formatINR(
              remainingAfterReserve
            )}.`
          : `Atomic budget reservation refused: reserved + spent + ${formatINR(
              selectedQuote.total
            )} would exceed the department budget.`,
        confidence: 1
      };

      await recordStep(context.runId, 'budget', 'decision', {
        title: reservedOk
          ? `Reserved ${formatINR(selectedQuote.total)} in Department Budget`
          : 'Atomic Budget Reservation Refused',
        input: { amount: selectedQuote.total },
        output: {
          ...reserveDecisionOut,
          fallback: false
        },
        rationale: reserveDecisionOut.rationale,
        confidence: 1,
        durationMs: Date.now() - reserveStart
      });

      await rpcAppendAuditLog({
        runId: context.runId,
        actorType: 'agent',
        actor: 'budget',
        action: reservedOk ? 'BUDGET_RESERVED' : 'BUDGET_RESERVE_REFUSED',
        entityType: 'budget',
        entityId: context.departmentId,
        details: {
          amount: selectedQuote.total,
          reservedOk,
          remainingAfterReserve
        }
      });

      if (!reservedOk) {
        const auditorOut = await this.runAuditorStep(toolCtx, {
          outcome: 'rejected',
          reason: reserveDecisionOut.rationale,
          replanCount,
          extraItems
        });

        const activeMs = Date.now() - startTime;
        await supabase
          .from('agent_runs')
          .update({
            status: 'rejected',
            final_decision: 'rejected',
            summary: auditorOut.summary,
            active_ms: activeMs,
            finished_at: new Date().toISOString()
          })
          .eq('id', context.runId);

        await supabase
          .from('purchase_requests')
          .update({
            status: 'rejected',
            updated_at: new Date().toISOString()
          })
          .eq('id', context.requestId);

        emitRunEvent(context.runId, 'status', { status: 'rejected', summary: auditorOut.summary });
        emitRunEvent(context.runId, 'done', { status: 'rejected' });
        return;
      }

      reservedAmount = selectedQuote.total;

      // Persist reservedAmount in state immediately so recovery/release always knows exact amount
      await supabase
        .from('agent_runs')
        .update({
          state: {
            parsed,
            selectedQuote,
            consideredVendors,
            reservedAmount,
            replanCount,
            extraItems
          }
        })
        .eq('id', context.runId);

      checkTimeout();

      // =========================================================================
      // 6. APPROVAL AGENT
      // =========================================================================
      const approvalStart = Date.now();
      const justificationMissing =
        selectedQuote.total > Number(policyRow.requires_justification_above) &&
        !justificationProvided;

      const distinctApprovedQuotes = consideredVendors.filter(
        (c) => c.excludedReason !== 'Vendor not approved'
      ).length;
      const quotesBelowMin = distinctApprovedQuotes < Number(policyRow.min_quotes);

      const guardrailRoute: ApprovalRoute = computeRequiredRoute(
        selectedQuote.total,
        policyRow,
        selectedQuote.riskLevel,
        {
          justificationMissing,
          quotesBelowMin
        }
      );

      toolCtx.requiredApprovalRole = guardrailRoute === 'auto' ? 'manager' : guardrailRoute;
      const appTools = getAgentTools('approval');

      const approvalTurn = await runAgentTurn({
        agentName: 'approval',
        systemInstruction: APPROVAL_AGENT_PROMPT,
        userPayload: JSON.stringify({
          category: parsed.category,
          selectedVendor: selectedQuote,
          total: selectedQuote.total,
          policyLimits: {
            autoApproveLimit: Number(policyRow.auto_approve_limit),
            managerLimit: Number(policyRow.manager_limit),
            minQuotes: Number(policyRow.min_quotes),
            requiresJustificationAbove: Number(policyRow.requires_justification_above)
          },
          justificationMissing,
          quotesBelowMin,
          mandatoryMinimumRoute: guardrailRoute
        }),
        toolDeclarations: appTools.declarations,
        toolExecutors: appTools.executors,
        ctx: toolCtx,
        schema: ApprovalAgentOutputSchema,
        fallbackFn: () =>
          fallbackApprovalAgent(toolCtx, {
            category: parsed.category,
            total: selectedQuote.total,
            vendorName: selectedQuote.vendorName,
            vendorRisk: selectedQuote.riskLevel,
            policyRow,
            justificationMissing,
            quotesBelowMin
          })
      });

      const approvalOut = approvalTurn.data;
      const finalRoute = maxRoute(guardrailRoute, approvalOut.recommendedRoute);
      approvalOut.recommendedRoute = finalRoute;

      if (
        justificationMissing &&
        !approvalOut.riskFlags.some((f: string) => f.toLowerCase().includes('justification'))
      ) {
        approvalOut.riskFlags.push('Missing business justification above ₹1,00,000 threshold');
      }

      await recordStep(context.runId, 'approval', 'decision', {
        title:
          finalRoute === 'auto'
            ? `Approval Route: Auto-Approved (${formatINR(selectedQuote.total)})`
            : `Approval Route: Escalated to ${finalRoute.toUpperCase()} (${formatINR(
                selectedQuote.total
              )})`,
        input: {
          total: selectedQuote.total,
          vendorRisk: selectedQuote.riskLevel,
          justificationMissing,
          quotesBelowMin
        },
        output: {
          ...approvalOut,
          guardrailRoute,
          finalRoute,
          justificationMissing,
          quotesBelowMin,
          fallback: approvalTurn.fallback,
          fallbackReason: approvalTurn.fallbackReason
        },
        rationale: approvalOut.rationale,
        confidence: approvalOut.confidence,
        durationMs: Date.now() - approvalStart
      });

      await rpcAppendAuditLog({
        runId: context.runId,
        actorType: 'agent',
        actor: 'approval',
        action: 'APPROVAL_ROUTED',
        entityType: 'agent_run',
        entityId: context.runId,
        details: {
          guardrailRoute,
          finalRoute,
          total: selectedQuote.total,
          reasons: approvalOut.reasons,
          riskFlags: approvalOut.riskFlags
        }
      });

      if (finalRoute !== 'auto') {
        const approvalId = crypto.randomUUID();
        const reasonText =
          approvalOut.reasons.length > 0
            ? approvalOut.reasons.join(' ')
            : approvalOut.rationale;

        await supabase.from('approvals').insert({
          id: approvalId,
          run_id: context.runId,
          request_id: context.requestId,
          required_role: finalRoute,
          reason: reasonText,
          status: 'pending',
          created_at: new Date().toISOString()
        });

        const activeMsSoFar = Date.now() - startTime;
        const persistedState = {
          parsed,
          selectedQuote,
          consideredVendors,
          reservedAmount,
          replanCount,
          justificationMissing,
          quotesBelowMin,
          approvalId,
          requiredRole: finalRoute,
          activeMsSoFar,
          extraItems
        };

        await supabase
          .from('agent_runs')
          .update({
            status: 'awaiting_approval',
            active_ms: activeMsSoFar,
            state: persistedState,
            summary: `Awaiting ${finalRoute.toUpperCase()} approval for ${formatINR(
              selectedQuote.total
            )} with ${selectedQuote.vendorName}: ${reasonText}`
          })
          .eq('id', context.runId);

        await supabase
          .from('purchase_requests')
          .update({
            status: 'awaiting_approval',
            estimated_total: selectedQuote.total,
            updated_at: new Date().toISOString()
          })
          .eq('id', context.requestId);

        await rpcAppendAuditLog({
          runId: context.runId,
          actorType: 'agent',
          actor: 'approval',
          action: 'APPROVAL_REQUESTED',
          entityType: 'approval',
          entityId: approvalId,
          details: {
            requiredRole: finalRoute,
            amount: selectedQuote.total,
            vendorName: selectedQuote.vendorName,
            reason: reasonText
          }
        });

        emitRunEvent(context.runId, 'status', {
          status: 'awaiting_approval',
          approvalId,
          requiredRole: finalRoute
        });
        emitRunEvent(context.runId, 'done', { status: 'awaiting_approval' });
        return;
      }

      // =========================================================================
      // 7 & 8. AUTO-APPROVED: EXECUTION AGENT & AUDITOR AGENT
      // =========================================================================
      await this.completeExecutionAndAudit({
        toolCtx,
        selectedQuote,
        reservedAmount,
        replanCount,
        justificationMissing,
        extraItems,
        priorActiveMs: Date.now() - startTime,
        wasEscalated: false
      });
    } catch (err: any) {
      console.error(`Orchestrator error on run ${context.runId}:`, err);
      const activeMs = Date.now() - startTime;

      if (reservedAmount > 0) {
        await rpcReleaseBudget(context.departmentId, reservedAmount, 2026).catch(() => false);
      }

      await recordStep(context.runId, 'system', 'error', {
        title: 'Unrecoverable Workflow Error',
        output: { error: err.message || 'Unknown error', releasedBudget: reservedAmount },
        rationale: `Workflow terminated due to an unexpected error: ${err.message}. Any reserved budget (${formatINR(
          reservedAmount
        )}) has been released.`
      }).catch(() => undefined);

      await supabase
        .from('agent_runs')
        .update({
          status: 'failed',
          final_decision: 'failed',
          active_ms: activeMs,
          summary: `Workflow failed: ${err.message}`,
          finished_at: new Date().toISOString()
        })
        .eq('id', context.runId);

      await supabase
        .from('purchase_requests')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', context.requestId);

      await rpcAppendAuditLog({
        runId: context.runId,
        actorType: 'system',
        actor: 'orchestrator',
        action: 'RUN_FAILED',
        entityType: 'agent_run',
        entityId: context.runId,
        details: { error: err.message, releasedBudget: reservedAmount }
      }).catch(() => null);

      emitRunEvent(context.runId, 'error', { error: err.message });
      emitRunEvent(context.runId, 'status', { status: 'failed' });
      emitRunEvent(context.runId, 'done', { status: 'failed' });
    }
  }

  async resumeAfterApproval(params: {
    runId: string;
    approvalId: string;
    decision: 'approved' | 'rejected';
    comment: string;
    decidedById: string;
    decidedByEmail: string;
  }): Promise<void> {
    const resumeStart = Date.now();
    const { runId, approvalId, decision, comment, decidedByEmail } = params;

    const { data: run } = await supabase.from('agent_runs').select('*').eq('id', runId).single();
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    const { data: req } = await supabase
      .from('purchase_requests')
      .select('*')
      .eq('id', run.request_id)
      .single();
    if (!req) {
      throw new Error(`Request ${run.request_id} not found`);
    }

    const { data: requester } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.requester_id)
      .maybeSingle();

    const state = (run.state || {}) as Record<string, any>;
    const selectedQuote = state.selectedQuote;
    const reservedAmount = Number(state.reservedAmount ?? req.estimated_total ?? 0);
    const replanCount = Number(state.replanCount ?? run.replan_count ?? 0);
    const justificationMissing = Boolean(state.justificationMissing);
    const extraItems = (state.extraItems || []) as string[];
    const priorActiveMs = Number(state.activeMsSoFar ?? run.active_ms ?? 300);

    const toolCtx: ToolContext = {
      runId,
      requestId: req.id,
      departmentId: req.department_id,
      requesterId: req.requester_id,
      requesterEmail: requester?.email || 'employee@procureflow.demo'
    };

    try {
      await supabase.from('agent_runs').update({ status: 'running' }).eq('id', runId);
      emitRunEvent(runId, 'status', { status: 'running' });

      if (decision === 'rejected') {
        if (reservedAmount > 0) {
          await recordStep(runId, 'budget', 'tool_call', {
            title: 'Calling release_budget (atomic RPC)',
            input: { departmentId: req.department_id, fiscalYear: 2026, amount: reservedAmount },
            durationMs: 5
          });

          const released = await rpcReleaseBudget(req.department_id, reservedAmount, 2026);

          await recordStep(runId, 'budget', 'tool_result', {
            title: 'Result from release_budget',
            input: { amount: reservedAmount },
            output: { released, releasedAmount: reservedAmount },
            durationMs: 10
          });

          await recordStep(runId, 'budget', 'decision', {
            title: `Released Reserved Budget (${formatINR(reservedAmount)})`,
            input: { amount: reservedAmount },
            output: {
              mode: 'reserve',
              status: 'ok',
              releasedAmount: reservedAmount,
              fallback: false
            },
            rationale: `Released ${formatINR(
              reservedAmount
            )} back to the department's available FY 2026 budget following human rejection.`,
            confidence: 1,
            durationMs: 12
          });

          await rpcAppendAuditLog({
            runId,
            actorType: 'agent',
            actor: 'budget',
            action: 'BUDGET_RELEASED',
            entityType: 'budget',
            entityId: req.department_id,
            details: { releasedAmount: reservedAmount, approvalId }
          });
        }

        const rejectReason = `Request rejected by ${decidedByEmail}: "${comment}". Reserved budget of ${formatINR(
          reservedAmount
        )} has been released.`;
        const auditorOut = await this.runAuditorStep(toolCtx, {
          outcome: 'rejected',
          reason: rejectReason,
          replanCount,
          justificationMissing,
          extraItems
        });

        const totalActiveMs = priorActiveMs + (Date.now() - resumeStart);
        await supabase
          .from('agent_runs')
          .update({
            status: 'rejected',
            final_decision: 'rejected',
            summary: auditorOut.summary,
            active_ms: totalActiveMs,
            time_saved_minutes: 0,
            finished_at: new Date().toISOString()
          })
          .eq('id', runId);

        await supabase
          .from('purchase_requests')
          .update({
            status: 'rejected',
            updated_at: new Date().toISOString()
          })
          .eq('id', req.id);

        await rpcAppendAuditLog({
          runId,
          actorType: 'agent',
          actor: 'orchestrator',
          action: 'RUN_REJECTED_BY_APPROVER',
          entityType: 'agent_run',
          entityId: runId,
          details: { approvalId, decidedByEmail, comment, totalActiveMs }
        });

        emitRunEvent(runId, 'status', { status: 'rejected', summary: auditorOut.summary });
        emitRunEvent(runId, 'done', { status: 'rejected' });
        return;
      }

      // Approved -> proceed to Execution & Auditor
      await this.completeExecutionAndAudit({
        toolCtx,
        selectedQuote,
        reservedAmount,
        replanCount,
        justificationMissing,
        extraItems,
        priorActiveMs: priorActiveMs + (Date.now() - resumeStart),
        wasEscalated: true
      });
    } catch (err: any) {
      console.error(`Error resuming run ${runId}:`, err);
      if (reservedAmount > 0) {
        await rpcReleaseBudget(req.department_id, reservedAmount, 2026).catch(() => false);
      }

      await supabase
        .from('agent_runs')
        .update({
          status: 'failed',
          final_decision: 'failed',
          summary: `Resume error: ${err.message}`,
          finished_at: new Date().toISOString()
        })
        .eq('id', runId);

      await supabase
        .from('purchase_requests')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', req.id);

      emitRunEvent(runId, 'error', { error: err.message });
      emitRunEvent(runId, 'status', { status: 'failed' });
      emitRunEvent(runId, 'done', { status: 'failed' });
    }
  }

  private async completeExecutionAndAudit(params: {
    toolCtx: ToolContext;
    selectedQuote: {
      vendorId: string;
      vendorName: string;
      itemName: string;
      quantity: number;
      unitPrice: number;
      total: number;
      leadTimeDays: number;
      riskLevel: 'low' | 'medium' | 'high';
      expectedDelivery: string;
    };
    reservedAmount: number;
    replanCount: number;
    justificationMissing: boolean;
    extraItems: string[];
    priorActiveMs: number;
    wasEscalated: boolean;
  }): Promise<void> {
    const execPhaseStart = Date.now();
    const {
      toolCtx,
      selectedQuote,
      replanCount,
      justificationMissing,
      extraItems,
      priorActiveMs,
      wasEscalated
    } = params;

    // Fetch vendor contact email for allowlist enforcement
    const { data: vendorRow } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', selectedQuote.vendorId)
      .maybeSingle();

    const vendorEmail = vendorRow?.contact_email || 'orders@vendor.example';
    toolCtx.selectedVendorEmail = vendorEmail;

    // Deterministic PO creation & budget spend commit BEFORE the Execution Agent turn
    const po = await createPurchaseOrderForRun({
      runId: toolCtx.runId,
      requestId: toolCtx.requestId,
      departmentId: toolCtx.departmentId,
      vendorId: selectedQuote.vendorId,
      vendorName: selectedQuote.vendorName,
      itemName: selectedQuote.itemName,
      quantity: selectedQuote.quantity,
      unitPrice: selectedQuote.unitPrice,
      leadTimeDays: selectedQuote.leadTimeDays,
      expectedDelivery: selectedQuote.expectedDelivery
    });

    await rpcAppendAuditLog({
      runId: toolCtx.runId,
      actorType: 'system',
      actor: 'execution',
      action: 'PO_CREATED_AND_BUDGET_COMMITTED',
      entityType: 'purchase_order',
      entityId: po.id,
      details: {
        poNumber: po.po_number,
        vendorId: po.vendor_id,
        vendorName: selectedQuote.vendorName,
        totalAmount: po.total_amount,
        expectedDelivery: po.expected_delivery
      }
    });

    const execTools = getAgentTools('execution');
    const execTurn = await runAgentTurn({
      agentName: 'execution',
      systemInstruction: EXECUTION_AGENT_PROMPT,
      userPayload: JSON.stringify({
        purchaseOrder: po,
        vendorName: selectedQuote.vendorName,
        vendorEmail,
        requesterEmail: toolCtx.requesterEmail
      }),
      toolDeclarations: execTools.declarations,
      toolExecutors: execTools.executors,
      ctx: toolCtx,
      schema: ExecutionAgentOutputSchema,
      fallbackFn: () =>
        fallbackExecutionAgent(toolCtx, po, selectedQuote.vendorName, vendorEmail)
    });

    const execOut = execTurn.data;
    // Guardrail: verify poNumber equals generated PO number
    execOut.poNumber = po.po_number;
    execOut.status = 'completed';

    await recordStep(toolCtx.runId, 'execution', 'decision', {
      title: `Purchase Order ${po.po_number} Issued (${formatINR(po.total_amount)})`,
      input: {
        poNumber: po.po_number,
        vendorName: selectedQuote.vendorName,
        totalAmount: po.total_amount
      },
      output: {
        ...execOut,
        purchaseOrder: po,
        fallback: execTurn.fallback,
        fallbackReason: execTurn.fallbackReason
      },
      rationale: execOut.rationale,
      confidence: execOut.confidence,
      durationMs: Date.now() - execPhaseStart
    });

    // Run Auditor Agent
    const auditorOut = await this.runAuditorStep(toolCtx, {
      outcome: 'completed',
      po,
      vendorName: selectedQuote.vendorName,
      replanCount,
      justificationMissing,
      extraItems
    });

    const totalActiveMs = priorActiveMs + (Date.now() - execPhaseStart);
    const baselineMinutes = wasEscalated ? 60 : 90;
    const timeSavedMinutes = Math.max(0, baselineMinutes - Math.ceil(totalActiveMs / 60000));

    await supabase
      .from('agent_runs')
      .update({
        status: 'completed',
        final_decision: 'approved',
        summary: auditorOut.summary,
        active_ms: totalActiveMs,
        time_saved_minutes: timeSavedMinutes,
        finished_at: new Date().toISOString()
      })
      .eq('id', toolCtx.runId);

    await supabase
      .from('purchase_requests')
      .update({
        status: 'completed',
        estimated_total: po.total_amount,
        updated_at: new Date().toISOString()
      })
      .eq('id', toolCtx.requestId);

    await rpcAppendAuditLog({
      runId: toolCtx.runId,
      actorType: 'agent',
      actor: 'auditor',
      action: 'RUN_COMPLETED',
      entityType: 'agent_run',
      entityId: toolCtx.runId,
      details: {
        poNumber: po.po_number,
        vendorName: selectedQuote.vendorName,
        totalAmount: po.total_amount,
        activeMs: totalActiveMs,
        timeSavedMinutes,
        compliant: auditorOut.compliant
      }
    });

    emitRunEvent(toolCtx.runId, 'status', {
      status: 'completed',
      poNumber: po.po_number,
      summary: auditorOut.summary
    });
    emitRunEvent(toolCtx.runId, 'done', { status: 'completed' });
  }

  private async runAuditorStep(
    toolCtx: ToolContext,
    params: {
      outcome: 'completed' | 'rejected' | 'blocked';
      reason?: string;
      po?: PurchaseOrder | null;
      vendorName?: string;
      replanCount?: number;
      justificationMissing?: boolean;
      extraItems?: string[];
    }
  ): Promise<AuditorAgentOutput> {
    const auditStart = Date.now();
    const audTools = getAgentTools('auditor');
    const auditorTurn = await runAgentTurn({
      agentName: 'auditor',
      systemInstruction: AUDITOR_AGENT_PROMPT,
      userPayload: JSON.stringify({
        outcome: params.outcome,
        reason: params.reason || null,
        purchaseOrder: params.po || null,
        vendorName: params.vendorName || null,
        replanCount: params.replanCount || 0,
        justificationMissing: Boolean(params.justificationMissing),
        extraItems: params.extraItems || []
      }),
      toolDeclarations: audTools.declarations,
      toolExecutors: audTools.executors,
      ctx: toolCtx,
      schema: AuditorAgentOutputSchema,
      fallbackFn: () => fallbackAuditorAgent(toolCtx, params)
    });

    const auditorOut = auditorTurn.data;

    await recordStep(toolCtx.runId, 'auditor', 'summary', {
      title: auditorOut.headline,
      input: {
        outcome: params.outcome,
        poNumber: params.po?.po_number || null
      },
      output: {
        ...auditorOut,
        fallback: auditorTurn.fallback,
        fallbackReason: auditorTurn.fallbackReason
      },
      rationale: auditorOut.rationale,
      confidence: auditorOut.confidence,
      durationMs: Date.now() - auditStart
    });

    return auditorOut;
  }
}

export const orchestrator = new AgentOrchestrator();

export async function recoverStaleRunsOnBoot(): Promise<void> {
  try {
    const { data: staleRuns } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('status', 'running');

    if (!staleRuns || staleRuns.length === 0) return;

    for (const run of staleRuns) {
      const state = (run.state || {}) as Record<string, any>;
      const reservedAmount = Number(state.reservedAmount || 0);

      const { data: req } = await supabase
        .from('purchase_requests')
        .select('*')
        .eq('id', run.request_id)
        .maybeSingle();

      if (reservedAmount > 0 && req?.department_id) {
        await rpcReleaseBudget(req.department_id, reservedAmount, 2026).catch(() => false);
      }

      await supabase
        .from('agent_runs')
        .update({
          status: 'failed',
          final_decision: 'failed',
          summary: 'Run interrupted by server restart; reserved budget released.',
          finished_at: new Date().toISOString()
        })
        .eq('id', run.id);

      if (req) {
        await supabase
          .from('purchase_requests')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', req.id);
      }

      await rpcAppendAuditLog({
        runId: run.id,
        actorType: 'system',
        actor: 'system',
        action: 'BOOT_RECOVERY_FAILED_RUN',
        entityType: 'agent_run',
        entityId: run.id,
        details: { releasedBudget: reservedAmount }
      }).catch(() => null);
    }
  } catch (err) {
    console.warn('Boot recovery sweep skipped or encountered error:', err);
  }
}
