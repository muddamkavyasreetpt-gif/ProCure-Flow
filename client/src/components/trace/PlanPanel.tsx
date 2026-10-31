import React from 'react';
import { CheckCircle2, Circle, RefreshCw, XCircle, ListOrdered } from 'lucide-react';
import { AgentStep, PlanStep } from '../../types';

interface PlanPanelProps {
  plan: Array<PlanStep | string> | null;
  steps?: AgentStep[];
  completedStepCount?: number;
}

const DEFAULT_PLAN: PlanStep[] = [
  {
    id: 'policy_check',
    agent: 'policy',
    goal: 'Verify category spending policy, prohibited item rules, minimum quotes, and justification threshold.'
  },
  {
    id: 'budget_check',
    agent: 'budget',
    goal: 'Verify department fiscal year budget availability and reserve funds.'
  },
  {
    id: 'vendor_selection',
    agent: 'vendor',
    goal: 'Search vendors, rank approved catalog quotes deterministically, and verify live inventory.'
  },
  {
    id: 'approval_routing',
    agent: 'approval',
    goal: 'Determine mandatory governance approval route (auto, manager, or finance).'
  },
  {
    id: 'execution',
    agent: 'execution',
    goal: 'Issue Purchase Order in ERP, commit reserved budget spend, and dispatch confirmation emails.'
  },
  {
    id: 'audit',
    agent: 'auditor',
    goal: 'Verify end-to-end numerical consistency, policy compliance, and seal tamper-evident SHA-256 audit log.'
  }
];

export const PlanPanel: React.FC<PlanPanelProps> = ({ plan, steps = [], completedStepCount = 0 }) => {
  const normalizedPlan: PlanStep[] =
    plan && plan.length > 0
      ? plan.map((item, idx) =>
          typeof item === 'string'
            ? { id: `step_${idx}`, agent: 'orchestrator', goal: item }
            : item
        )
      : DEFAULT_PLAN;

  const getStepState = (pStep: PlanStep, idx: number) => {
    if (steps.length > 0) {
      const agentSteps = steps.filter((s) => s.agent === pStep.agent);
      const hasDecision = agentSteps.some(
        (s) => s.kind === 'decision' || s.kind === 'summary'
      );
      const hasReplan =
        pStep.agent === 'vendor' && steps.some((s) => s.kind === 'replan');

      if (hasDecision) {
        const lastDecision = agentSteps[agentSteps.length - 1];
        if (
          lastDecision?.output?.status === 'blocked' ||
          lastDecision?.output?.status === 'insufficient' ||
          lastDecision?.output?.status === 'failed'
        ) {
          return 'failed';
        }
        return hasReplan ? 'replanned' : 'done';
      }
      if (agentSteps.length > 0) {
        return 'running';
      }
      return 'pending';
    }
    return idx < completedStepCount ? 'done' : 'pending';
  };

  return (
    <div className="glass-panel rounded-2xl p-5 border border-slate-800 mb-6">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
        <ListOrdered className="w-4 h-4 text-indigo-400" />
        <span>Orchestrator Execution Plan</span>
      </h3>

      <div className="space-y-2.5">
        {normalizedPlan.map((pStep, idx) => {
          const state = getStepState(pStep, idx);
          return (
            <div
              key={pStep.id || idx}
              className={`flex items-start gap-3 p-3 rounded-xl text-xs transition-colors border ${
                state === 'done'
                  ? 'bg-emerald-950/15 text-slate-200 border-emerald-500/20'
                  : state === 'replanned'
                  ? 'bg-amber-950/15 text-amber-200 border-amber-500/30'
                  : state === 'failed'
                  ? 'bg-rose-950/15 text-rose-200 border-rose-500/30'
                  : state === 'running'
                  ? 'bg-indigo-950/20 text-indigo-200 border-indigo-500/30'
                  : 'text-slate-400 border-slate-800/60 bg-slate-900/30'
              }`}
            >
              {state === 'done' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              )}
              {state === 'replanned' && (
                <RefreshCw className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              {state === 'failed' && (
                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              {(state === 'pending' || state === 'running') && (
                <Circle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    state === 'running' ? 'text-indigo-400 animate-pulse' : 'text-slate-600'
                  }`}
                />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-indigo-400 font-semibold">
                    {idx + 1}. {pStep.agent}
                  </span>
                  {state === 'replanned' && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      Re-planned
                    </span>
                  )}
                </div>
                <p className="leading-snug text-slate-300">{pStep.goal}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
