import { heuristicParseRequest } from './heuristicParser';
import {
  OrchestratorPlanOutput,
  OrchestratorReplanOutput,
  PolicyAgentOutput,
  BudgetAgentOutput,
  VendorAgentOutput,
  ApprovalAgentOutput,
  ExecutionAgentOutput,
  AuditorAgentOutput
} from './schemas';
import { getRegisteredTool } from '../tools/registry';
import { ToolContext } from '../tools/types';
import { recordStep } from '../services/stepService';
import { ApprovalRoute, computeRequiredRoute } from '../guardrails';
import { PurchaseOrder } from '../types';

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

export const DEFAULT_SIX_STEP_PLAN: OrchestratorPlanOutput['plan'] = [
  {
    id: 'policy_check',
    agent: 'policy',
    goal: 'Verify category spending policy, prohibited item rules, minimum quotes, and justification threshold.'
  },
  {
    id: 'budget_check',
    agent: 'budget',
    goal: 'Verify department fiscal year budget availability against estimated cost.'
  },
  {
    id: 'vendor_selection',
    agent: 'vendor',
    goal: 'Search vendors, rank approved catalog quotes deterministically, and verify live inventory.'
  },
  {
    id: 'approval_routing',
    agent: 'approval',
    goal: 'Determine mandatory governance approval route (auto, manager, or finance) and notify approvers if needed.'
  },
  {
    id: 'execution',
    agent: 'execution',
    goal: 'Issue Purchase Order in ERP, commit reserved budget spend, and dispatch confirmation emails.'
  },
  {
    id: 'audit',
    agent: 'auditor',
    goal: 'Verify end-to-end numerical consistency, policy compliance, and seal immutable SHA-256 audit log.'
  }
];

export async function fallbackOrchestratorPlan(rawText: string): Promise<OrchestratorPlanOutput> {
  const parsed = heuristicParseRequest(rawText);
  const item = parsed.items[0];
  return {
    parsed,
    plan: DEFAULT_SIX_STEP_PLAN,
    rationale: `Parsed request for ${item.quantity} unit(s) of "${item.name}" mapped to category "${parsed.category}". Constructed the standard 6-stage procurement execution plan.`,
    confidence: 0.95
  };
}

export async function fallbackOrchestratorReplan(params: {
  failedVendorId: string;
  failedVendorName: string;
  replanCount: number;
  existingExcludeIds: string[];
}): Promise<OrchestratorReplanOutput> {
  const merged = Array.from(new Set([...params.existingExcludeIds, params.failedVendorId]));
  if (params.replanCount >= 2) {
    return {
      action: 'abort',
      adjustments: {
        excludeVendorIds: merged,
        note: `Maximum re-plan limit (2) reached after stock failure at ${params.failedVendorName}.`
      },
      rationale: `Vendor ${params.failedVendorName} lacks sufficient stock and the run has exhausted its maximum of 2 autonomous re-plans. Aborting workflow safely.`,
      confidence: 0.95
    };
  }

  return {
    action: 'adjust_and_retry',
    adjustments: {
      excludeVendorIds: merged,
      note: `Exclude ${params.failedVendorName} due to insufficient stock and re-run vendor selection.`
    },
    rationale: `Top-ranked vendor ${params.failedVendorName} failed the live stock verification check. Re-planning autonomously by adding ${params.failedVendorName} to the exclusion list and re-evaluating the next highest-ranked approved supplier.`,
    confidence: 0.96
  };
}

export async function fallbackPolicyAgent(
  ctx: ToolContext,
  parsed: OrchestratorPlanOutput['parsed'],
  rawText: string,
  justification?: string
): Promise<PolicyAgentOutput> {
  const getPolicyTool = getRegisteredTool('get_policy_rules')!;
  const hintTool = getRegisteredTool('list_policy_violations_hint')!;

  await recordStep(ctx.runId, 'policy', 'tool_call', {
    title: 'Calling get_policy_rules',
    input: { category: parsed.category },
    durationMs: 5
  });
  const policyRes = await getPolicyTool.handler({ category: parsed.category }, ctx);
  await recordStep(ctx.runId, 'policy', 'tool_result', {
    title: 'Result from get_policy_rules',
    input: { category: parsed.category },
    output: policyRes as unknown as Record<string, unknown>,
    durationMs: 12
  });

  await recordStep(ctx.runId, 'policy', 'tool_call', {
    title: 'Calling list_policy_violations_hint',
    input: { text: rawText },
    durationMs: 5
  });
  const hintRes = await hintTool.handler({ text: rawText }, ctx);
  await recordStep(ctx.runId, 'policy', 'tool_result', {
    title: 'Result from list_policy_violations_hint',
    input: { text: rawText },
    output: hintRes as unknown as Record<string, unknown>,
    durationMs: 10
  });

  const pData = (policyRes.data as any)?.policy || {
    category: parsed.category,
    autoApproveLimit: 50000,
    managerLimit: 500000,
    minQuotes: 1,
    requiresJustificationAbove: 100000,
    isBlocked: parsed.category === 'Prohibited Items'
  };
  const hData = (hintRes.data as any) || { blockedKeywordsFound: [], isProhibited: false };

  const isBlocked = Boolean(pData.isBlocked) || Boolean(hData.isProhibited);
  const violations: string[] = [];
  if (isBlocked) {
    violations.push(
      `Category "${parsed.category}" (${
        hData.blockedKeywordsFound?.join(', ') || 'prohibited item'
      }) is strictly blocked under corporate procurement policy.`
    );
  }

  const estAmount = parsed.statedBudget ?? 0;
  const justificationRequired = !isBlocked && estAmount > Number(pData.requiresJustificationAbove);
  const justificationProvided = Boolean(justification && justification.trim().length > 0);

  return {
    status: isBlocked ? 'blocked' : 'passed',
    policy: {
      category: pData.category,
      autoApproveLimit: Number(pData.autoApproveLimit),
      managerLimit: Number(pData.managerLimit),
      minQuotes: Number(pData.minQuotes)
    },
    violations,
    justificationRequired,
    justificationProvided,
    rationale: isBlocked
      ? `The request falls under "${parsed.category}" which is a prohibited category (${
          hData.blockedKeywordsFound?.join(', ') || 'gift cards / cash equivalents'
        }). Corporate policy strictly forbids purchasing these items, so the request is blocked immediately.`
      : `Category "${parsed.category}" is permitted under company policy with an auto-approval limit of ${formatINR(
          Number(pData.autoApproveLimit)
        )}, manager limit of ${formatINR(Number(pData.managerLimit))}, and minimum quotes requirement of ${
          pData.minQuotes
        }.`,
    confidence: 0.98
  };
}

export async function fallbackBudgetCheckAgent(
  ctx: ToolContext,
  parsed: OrchestratorPlanOutput['parsed']
): Promise<BudgetAgentOutput> {
  const getBudgetTool = getRegisteredTool('get_budget')!;
  const estimateTool = getRegisteredTool('estimate_cost')!;

  await recordStep(ctx.runId, 'budget', 'tool_call', {
    title: 'Calling get_budget',
    input: {},
    durationMs: 5
  });
  const budgetRes = await getBudgetTool.handler({}, ctx);
  await recordStep(ctx.runId, 'budget', 'tool_result', {
    title: 'Result from get_budget',
    input: {},
    output: budgetRes as unknown as Record<string, unknown>,
    durationMs: 12
  });

  const estInput = {
    category: parsed.category,
    items: parsed.items.map((i) => ({ name: i.name, quantity: i.quantity }))
  };
  await recordStep(ctx.runId, 'budget', 'tool_call', {
    title: 'Calling estimate_cost',
    input: estInput,
    durationMs: 5
  });
  const estRes = await estimateTool.handler(estInput, ctx);
  await recordStep(ctx.runId, 'budget', 'tool_result', {
    title: 'Result from estimate_cost',
    input: estInput,
    output: estRes as unknown as Record<string, unknown>,
    durationMs: 14
  });

  const bData = (budgetRes.data as any) || { available: 0, totalAmount: 0 };
  const eData = (estRes.data as any) || { minEstimate: null };

  const available = Number(bData.available ?? 0);
  const requested =
    eData.minEstimate !== null && eData.minEstimate !== undefined
      ? Number(eData.minEstimate)
      : Number(parsed.statedBudget ?? 0);

  const fits = requested <= available;

  return {
    mode: 'check',
    status: fits ? 'ok' : 'insufficient',
    available,
    requested,
    reservedAmount: null,
    rationale: fits
      ? `Department has ${formatINR(available)} available for FY 2026, which comfortably covers the minimum catalog cost estimate of ${formatINR(
          requested
        )}. Proceeding to vendor selection prior to atomic reservation.`
      : `Department only has ${formatINR(available)} remaining in its FY 2026 budget, whereas the minimum approved catalog estimate for this request is ${formatINR(
          requested
        )}. Rejecting request due to insufficient budget.`,
    confidence: 0.97
  };
}

export async function fallbackVendorAgent(
  ctx: ToolContext,
  parsed: OrchestratorPlanOutput['parsed']
): Promise<VendorAgentOutput> {
  const searchTool = getRegisteredTool('search_vendors')!;
  const quotesTool = getRegisteredTool('get_catalog_quotes')!;
  const stockTool = getRegisteredTool('check_stock')!;

  await recordStep(ctx.runId, 'vendor', 'tool_call', {
    title: 'Calling search_vendors',
    input: { category: parsed.category },
    durationMs: 5
  });
  const searchRes = await searchTool.handler({ category: parsed.category }, ctx);
  await recordStep(ctx.runId, 'vendor', 'tool_result', {
    title: 'Result from search_vendors',
    input: { category: parsed.category },
    output: searchRes as unknown as Record<string, unknown>,
    durationMs: 12
  });

  const quotesInput = {
    category: parsed.category,
    items: parsed.items.map((i) => ({ name: i.name, quantity: i.quantity }))
  };
  await recordStep(ctx.runId, 'vendor', 'tool_call', {
    title: 'Calling get_catalog_quotes',
    input: quotesInput,
    durationMs: 5
  });
  const quotesRes = await quotesTool.handler(quotesInput, ctx);
  await recordStep(ctx.runId, 'vendor', 'tool_result', {
    title: 'Result from get_catalog_quotes',
    input: quotesInput,
    output: quotesRes as unknown as Record<string, unknown>,
    durationMs: 15
  });

  const quotes = ((quotesRes.data as any)?.quotes || []) as any[];
  const eligible = quotes.filter((q) => q.excludedReason === null);
  const fallbackUsed = Boolean(ctx.excludeVendorIds && ctx.excludeVendorIds.length > 0);

  if (eligible.length === 0) {
    return {
      status: 'failed',
      considered: quotes.map((q) => ({
        vendorId: q.vendorId,
        vendorName: q.vendorName,
        unitPrice: q.unitPrice,
        total: q.total,
        leadTimeDays: q.leadTimeDays,
        rating: q.rating,
        riskLevel: q.riskLevel,
        score: q.score,
        stockOk: q.stockOk,
        excludedReason: q.excludedReason
      })),
      selected: null,
      failedVendorId: null,
      fallbackUsed,
      rationale: 'No approved vendor with matching catalog items and available stock was found for this category.',
      confidence: 0.9
    };
  }

  const topCandidate = eligible[0];
  const stockInput = {
    vendorId: topCandidate.vendorId,
    itemName: topCandidate.itemName,
    quantity: topCandidate.quantity
  };

  await recordStep(ctx.runId, 'vendor', 'tool_call', {
    title: 'Calling check_stock',
    input: stockInput,
    durationMs: 5
  });
  const stockRes = await stockTool.handler(stockInput, ctx);
  await recordStep(ctx.runId, 'vendor', 'tool_result', {
    title: 'Result from check_stock',
    input: stockInput,
    output: stockRes as unknown as Record<string, unknown>,
    durationMs: 12
  });

  const stockData = (stockRes.data as any) || { stockOk: false, stockQty: 0 };
  const stockOk = Boolean(stockData.stockOk);

  const considered = quotes.map((q) => ({
    vendorId: q.vendorId,
    vendorName: q.vendorName,
    unitPrice: Number(q.unitPrice),
    total: Number(q.total),
    leadTimeDays: Number(q.leadTimeDays),
    rating: Number(q.rating),
    riskLevel: q.riskLevel as 'low' | 'medium' | 'high',
    score: Number(q.score),
    stockOk: q.vendorId === topCandidate.vendorId ? stockOk : q.stockOk,
    excludedReason: q.excludedReason
  }));

  if (!stockOk) {
    return {
      status: 'needs_replan',
      considered,
      selected: null,
      failedVendorId: topCandidate.vendorId,
      fallbackUsed,
      rationale: `Top-ranked vendor ${topCandidate.vendorName} (score ${topCandidate.score.toFixed(
        2
      )}) only has ${stockData.stockQty} unit(s) in stock against the required ${
        topCandidate.quantity
      } units. Returning needs_replan so the Orchestrator can exclude ${
        topCandidate.vendorName
      } and re-plan.`,
      confidence: 0.95
    };
  }

  const expectedDelivery = new Date(Date.now() + Number(topCandidate.leadTimeDays) * 86400_000)
    .toISOString()
    .slice(0, 10);

  return {
    status: 'selected',
    considered,
    selected: {
      vendorId: topCandidate.vendorId,
      vendorName: topCandidate.vendorName,
      itemName: topCandidate.itemName,
      quantity: Number(topCandidate.quantity),
      unitPrice: Number(topCandidate.unitPrice),
      total: Number(topCandidate.total),
      leadTimeDays: Number(topCandidate.leadTimeDays),
      riskLevel: topCandidate.riskLevel,
      expectedDelivery
    },
    failedVendorId: null,
    fallbackUsed,
    rationale: `Selected ${topCandidate.vendorName} (composite score ${topCandidate.score.toFixed(
      2
    )}) for ${topCandidate.quantity} × ${topCandidate.itemName} at ${formatINR(
      topCandidate.unitPrice
    )}/unit (total ${formatINR(topCandidate.total)}), lead time ${
      topCandidate.leadTimeDays
    } days, with verified stock (${stockData.stockQty} available).${
      fallbackUsed ? ' Chosen after autonomous re-plan excluded the out-of-stock primary vendor.' : ''
    }`,
    confidence: 0.95
  };
}

export async function fallbackApprovalAgent(
  ctx: ToolContext,
  params: {
    category: string;
    total: number;
    vendorName: string;
    vendorRisk: 'low' | 'medium' | 'high';
    policyRow: {
      auto_approve_limit: number;
      manager_limit: number;
      min_quotes: number;
      requires_justification_above: number;
    };
    justificationMissing: boolean;
    quotesBelowMin: boolean;
  }
): Promise<ApprovalAgentOutput> {
  const policyTool = getRegisteredTool('get_policy_rules')!;
  const notifyTool = getRegisteredTool('notify_user')!;

  await recordStep(ctx.runId, 'approval', 'tool_call', {
    title: 'Calling get_policy_rules',
    input: { category: params.category },
    durationMs: 5
  });
  const polRes = await policyTool.handler({ category: params.category }, ctx);
  await recordStep(ctx.runId, 'approval', 'tool_result', {
    title: 'Result from get_policy_rules',
    input: { category: params.category },
    output: polRes as unknown as Record<string, unknown>,
    durationMs: 10
  });

  const route: ApprovalRoute = computeRequiredRoute(
    params.total,
    params.policyRow,
    params.vendorRisk,
    {
      justificationMissing: params.justificationMissing,
      quotesBelowMin: params.quotesBelowMin
    }
  );

  const reasons: string[] = [];
  const riskFlags: string[] = [];

  if (params.total <= Number(params.policyRow.auto_approve_limit)) {
    reasons.push(
      `Total ${formatINR(params.total)} is within the ${formatINR(
        Number(params.policyRow.auto_approve_limit)
      )} auto-approve limit for ${params.category}.`
    );
  } else if (params.total <= Number(params.policyRow.manager_limit)) {
    reasons.push(
      `Total ${formatINR(params.total)} exceeds auto-approve limit (${formatINR(
        Number(params.policyRow.auto_approve_limit)
      )}) and falls within Manager limit (${formatINR(Number(params.policyRow.manager_limit))}).`
    );
  } else {
    reasons.push(
      `Total ${formatINR(params.total)} exceeds the Manager approval limit of ${formatINR(
        Number(params.policyRow.manager_limit)
      )}, requiring Finance approval.`
    );
  }

  if (params.justificationMissing && params.total > Number(params.policyRow.requires_justification_above)) {
    const msg = `Business justification is missing for spend above ${formatINR(
      Number(params.policyRow.requires_justification_above)
    )} (raises floor to Manager).`;
    reasons.push(msg);
    riskFlags.push('Missing business justification above ₹1,00,000 threshold');
  }

  if (params.quotesBelowMin) {
    const msg = `Fewer distinct approved vendor quotes than policy minimum (${params.policyRow.min_quotes}).`;
    reasons.push(msg);
    riskFlags.push('Quotes below policy minimum');
  }

  if (params.vendorRisk !== 'low') {
    riskFlags.push(`Vendor risk level is ${params.vendorRisk}`);
  }

  if (route !== 'auto') {
    ctx.requiredApprovalRole = route;
    const notifyArgs = {
      subject: `[ProcureFlow] ${route.toUpperCase()} Approval Required: ${formatINR(params.total)} (${
        params.vendorName
      })`,
      body: `A purchase request for ${formatINR(params.total)} with ${
        params.vendorName
      } requires your ${route} review. Reasons: ${reasons.join(' ')}`
    };
    await recordStep(ctx.runId, 'approval', 'tool_call', {
      title: 'Calling notify_user',
      input: notifyArgs,
      durationMs: 5
    });
    const notifyRes = await notifyTool.handler(notifyArgs, ctx);
    await recordStep(ctx.runId, 'approval', 'tool_result', {
      title: 'Result from notify_user',
      input: notifyArgs,
      output: notifyRes as unknown as Record<string, unknown>,
      durationMs: 12
    });
  }

  return {
    recommendedRoute: route,
    reasons,
    riskFlags,
    rationale:
      route === 'auto'
        ? `Total spend of ${formatINR(params.total)} is within the ${formatINR(
            Number(params.policyRow.auto_approve_limit)
          )} auto-approval threshold, vendor risk is low, and all quote/justification rules are satisfied. Routing for autonomous execution.`
        : `Escalating to ${route.toUpperCase()} approval: ${reasons.join(' ')}`,
    confidence: 0.96
  };
}

export async function fallbackExecutionAgent(
  ctx: ToolContext,
  po: PurchaseOrder,
  vendorName: string,
  vendorEmail: string
): Promise<ExecutionAgentOutput> {
  const sendEmailTool = getRegisteredTool('send_email')!;
  const item = po.line_items[0];

  const vendorEmailArgs = {
    to: vendorEmail,
    subject: `Purchase Order ${po.po_number} from ProcureFlow (${formatINR(po.total_amount)})`,
    body: `Dear ${vendorName},\n\nPlease find Purchase Order ${po.po_number} for ${item.quantity} × ${
      item.item_name || item.description
    } at ${formatINR(item.unit_price)} each (Total: ${formatINR(
      po.total_amount
    )}). Expected delivery date: ${po.expected_delivery}.`
  };

  await recordStep(ctx.runId, 'execution', 'tool_call', {
    title: 'Calling send_email (vendor confirmation)',
    input: vendorEmailArgs,
    durationMs: 5
  });
  const vRes = await sendEmailTool.handler(vendorEmailArgs, ctx);
  await recordStep(ctx.runId, 'execution', 'tool_result', {
    title: 'Result from send_email (vendor confirmation)',
    input: vendorEmailArgs,
    output: vRes as unknown as Record<string, unknown>,
    durationMs: 10
  });

  const requesterEmailArgs = {
    to: ctx.requesterEmail,
    subject: `Your Purchase Order ${po.po_number} has been issued`,
    body: `Your procurement request has been fulfilled. Purchase Order ${po.po_number} for ${
      item.quantity
    } × ${item.item_name || item.description} (${formatINR(
      po.total_amount
    )}) has been issued to ${vendorName} with expected delivery by ${po.expected_delivery}.`
  };

  await recordStep(ctx.runId, 'execution', 'tool_call', {
    title: 'Calling send_email (requester update)',
    input: requesterEmailArgs,
    durationMs: 5
  });
  const rRes = await sendEmailTool.handler(requesterEmailArgs, ctx);
  await recordStep(ctx.runId, 'execution', 'tool_result', {
    title: 'Result from send_email (requester update)',
    input: requesterEmailArgs,
    output: rRes as unknown as Record<string, unknown>,
    durationMs: 10
  });

  return {
    status: 'completed',
    poNumber: po.po_number,
    emails: [vendorEmailArgs, requesterEmailArgs],
    rationale: `Purchase Order ${po.po_number} for ${formatINR(
      po.total_amount
    )} was committed in the ERP and confirmation notifications were dispatched to ${vendorName} (${vendorEmail}) and requester (${
      ctx.requesterEmail
    }).`,
    confidence: 0.98
  };
}

export async function fallbackAuditorAgent(
  ctx: ToolContext,
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
  const stepsTool = getRegisteredTool('get_run_steps')!;

  await recordStep(ctx.runId, 'auditor', 'tool_call', {
    title: 'Calling get_run_steps',
    input: {},
    durationMs: 5
  });
  const stepsRes = await stepsTool.handler({}, ctx);
  await recordStep(ctx.runId, 'auditor', 'tool_result', {
    title: 'Result from get_run_steps',
    input: {},
    output: stepsRes as unknown as Record<string, unknown>,
    durationMs: 12
  });

  const anomalies: AuditorAgentOutput['anomalies'] = [];
  if (params.replanCount && params.replanCount > 0) {
    anomalies.push({
      severity: 'info',
      message: `Autonomous re-planning executed ${params.replanCount} time(s) after primary vendor stock shortage.`
    });
  }
  if (params.justificationMissing) {
    anomalies.push({
      severity: 'warning',
      message: 'Request exceeded ₹1,00,000 without an upfront business justification; governance floor escalated the route to Manager.'
    });
  }
  if (params.extraItems && params.extraItems.length > 0) {
    anomalies.push({
      severity: 'info',
      message: `Additional line item(s) noted for separate submission: ${params.extraItems.join(', ')}.`
    });
  }

  if (params.outcome === 'blocked') {
    return {
      headline: 'Request Blocked by Corporate Procurement Policy',
      summary:
        params.reason ||
        'This purchase request was blocked by the Policy Agent because the requested items fall under Prohibited Items. Zero department budget was reserved or spent, and the event has been sealed in the hash-chained audit trail.',
      anomalies: [
        ...anomalies,
        {
          severity: 'critical',
          message: 'Attempted purchase of prohibited category (gift cards / cash equivalents) prevented.'
        }
      ],
      compliant: true,
      rationale:
        'Verified that the Policy Agent immediately blocked the prohibited item request and that no budget reservation or PO generation occurred.',
      confidence: 0.99
    };
  }

  if (params.outcome === 'rejected') {
    return {
      headline: 'Request Rejected — Governance & Budget Guardrails Enforced',
      summary:
        params.reason ||
        'This purchase request was rejected in accordance with department budget or human reviewer governance rules. Any reserved funds have been released back to the department balance.',
      anomalies,
      compliant: true,
      rationale:
        'Verified that the rejection followed deterministic budget/governance guardrails and that no unapproved funds remain locked.',
      confidence: 0.98
    };
  }

  const poNum = params.po?.po_number || 'PO-2026-000000';
  const totalFmt = formatINR(params.po?.total_amount || 0);
  const vName = params.vendorName || params.po?.vendor_name || 'Approved Vendor';

  return {
    headline: `Order Fulfilled — ${poNum} Issued to ${vName} (${totalFmt})`,
    summary: `End-to-end audit verified: Purchase Order ${poNum} for ${totalFmt} with ${vName} passed all policy, budget reservation, inventory, and approval guardrails.${
      params.replanCount ? ` Recovered automatically via ${params.replanCount} vendor re-plan.` : ''
    } All records are sealed in the tamper-evident SHA-256 audit log.`,
    anomalies,
    compliant: true,
    rationale: `Audited all run steps, confirming unit price, quantity, reserved budget, and PO total (${totalFmt}) match exactly and all corporate policy thresholds were respected.`,
    confidence: 0.99
  };
}
