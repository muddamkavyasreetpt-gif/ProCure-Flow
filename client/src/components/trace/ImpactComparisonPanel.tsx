import React from 'react';
import { computeManualEstimate } from '../../utils/impact';
import { formatDuration } from '../../utils/format';
import { Clock, Users, Wrench, ShieldCheck, Zap, ArrowRight } from 'lucide-react';

interface ImpactComparisonPanelProps {
  route?: 'auto' | 'manager' | 'finance';
  actualActiveMs?: number;
  stepsCount?: number;
  toolCallsCount?: number;
  policyBudgetChecksCount?: number;
  title?: string;
  isAggregate?: boolean;
  totalRuns?: number;
}

export const ImpactComparisonPanel: React.FC<ImpactComparisonPanelProps> = ({
  route = 'auto',
  actualActiveMs = 1200,
  stepsCount = 6,
  toolCallsCount = 5,
  policyBudgetChecksCount = 2,
  title = 'Manual vs ProcureFlow Impact',
  isAggregate = false,
  totalRuns = 1
}) => {
  const manual = computeManualEstimate(route);
  const multiplier = isAggregate ? Math.max(1, totalRuns) : 1;

  const totalHandoffs = manual.handoffs * multiplier;
  const totalWaitDays = manual.waitDays * multiplier;
  const totalTools = manual.toolsCount;

  return (
    <div className="glass-panel p-6 rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-slate-900/90 via-slate-950 to-indigo-950/20">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>
            <p className="text-[11px] text-slate-400">
              Comparing legacy manual enterprise procurement against ProcureFlow multi-agent automation
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Side: Typical Manual Process */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
              Typical Manual Process
            </span>
            <span className="text-[10px] text-slate-500 font-mono italic">
              (assumption estimate)
            </span>
          </div>

          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Users className="w-3.5 h-3.5" />
                Handoffs & Approvers:
              </span>
              <strong className="text-slate-200">{totalHandoffs} handoffs</strong>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Wrench className="w-3.5 h-3.5" />
                Tools / Portals:
              </span>
              <strong className="text-slate-200">{totalTools} tools (ERP, Email, Sheets, Chat)</strong>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                Turnaround Time:
              </span>
              <strong className="text-rose-300">~{totalWaitDays} day{totalWaitDays > 1 ? 's' : ''} wait</strong>
            </div>
          </div>
        </div>

        {/* Right Side: ProcureFlow Live Actuals */}
        <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
              ProcureFlow Actuals
            </span>
            <span className="text-[10px] text-emerald-400 font-mono font-semibold">
              Deterministic Multi-Agent
            </span>
          </div>

          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                Agent Active Execution:
              </span>
              <strong className="text-indigo-300 font-mono">
                {formatDuration(actualActiveMs)}
              </strong>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
              <span className="flex items-center gap-1.5 text-slate-400">
                <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                Agent Steps & Tool Calls:
              </span>
              <strong className="text-slate-200">
                {stepsCount} steps, {toolCallsCount} tool calls
              </strong>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="flex items-center gap-1.5 text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Policy & Budget Verifications:
              </span>
              <strong className="text-emerald-400">
                {policyBudgetChecksCount} automated check{policyBudgetChecksCount > 1 ? 's' : ''} (Passed)
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
