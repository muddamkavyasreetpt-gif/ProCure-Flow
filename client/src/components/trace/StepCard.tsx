import React from 'react';
import {
  Bot,
  Wrench,
  CheckCircle,
  FileText,
  AlertTriangle,
  RefreshCw,
  Clock,
  Sparkles,
  UserCheck,
  Cpu,
  ShieldAlert
} from 'lucide-react';
import { AgentStep } from '../../types';
import { ConfidenceBar } from '../shared/ConfidenceBar';
import { formatCurrency, formatDuration } from '../../utils/format';

export const StepCard: React.FC<{ step: AgentStep }> = ({ step }) => {
  const getKindConfig = () => {
    switch (step.kind) {
      case 'plan':
        return {
          icon: Bot,
          color: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
          label: 'Execution Plan'
        };
      case 'tool_call':
        return {
          icon: Wrench,
          color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
          label: 'Tool Call'
        };
      case 'tool_result':
        return {
          icon: CheckCircle,
          color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
          label: 'Tool Result'
        };
      case 'decision':
        return {
          icon: Sparkles,
          color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
          label: 'Agent Decision'
        };
      case 'replan':
        return {
          icon: RefreshCw,
          color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
          label: 'Autonomous Re-plan'
        };
      case 'human':
        return {
          icon: UserCheck,
          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
          label: 'Human Decision'
        };
      case 'error':
        return {
          icon: AlertTriangle,
          color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
          label: 'Error'
        };
      case 'summary':
        return {
          icon: FileText,
          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
          label: 'Auditor Reflection'
        };
      default:
        return {
          icon: Bot,
          color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
          label: 'Agent Step'
        };
    }
  };

  const config = getKindConfig();
  const Icon = config.icon;
  const isFallback = Boolean(step.output?.fallback);
  const isReplan = step.kind === 'replan';
  const selectedObj = step.output?.selected;

  return (
    <div
      className={`glass-panel rounded-2xl p-5 border transition-all ${
        isReplan
          ? 'border-amber-500/40 bg-amber-950/10'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl border ${config.color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-white uppercase tracking-wide">
                {step.agent}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium border ${config.color}`}
              >
                {config.label}
              </span>
              {isReplan && (
                <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Recovered automatically
                </span>
              )}
              {isFallback && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700">
                  <Cpu className="w-3 h-3 text-indigo-400" />
                  <span>Deterministic fallback</span>
                </span>
              )}
              {step.confidence !== null && step.confidence !== undefined && step.confidence < 0.5 && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  <ShieldAlert className="w-3 h-3 text-rose-400" />
                  <span>Low confidence</span>
                </span>
              )}
            </div>
            <span className="text-xs text-slate-300 font-medium block mt-0.5">
              {step.title || `Step #${step.seq ?? step.step_index ?? 1}`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          {step.confidence !== null && step.confidence !== undefined && (
            <div className="w-24 hidden sm:block">
              <ConfidenceBar score={step.confidence} label="Confidence" />
            </div>
          )}
          <div className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>{formatDuration(step.duration_ms ?? 15)}</span>
          </div>
        </div>
      </div>

      {step.rationale && (
        <p className="text-xs text-slate-200 leading-relaxed mb-3 bg-slate-900/50 p-3 rounded-xl border border-slate-800/70">
          {step.rationale}
        </p>
      )}

      {selectedObj && selectedObj.vendorName && (
        <div className="mb-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs flex items-center justify-between">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">
              Selected Supplier
            </span>
            <span className="text-white font-bold text-sm">{selectedObj.vendorName}</span>
            <span className="text-slate-400 block text-[11px]">
              {selectedObj.quantity} × {selectedObj.itemName} ({selectedObj.leadTimeDays}d lead time)
            </span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">
              Verified Total (INR)
            </span>
            <span className="text-emerald-400 font-mono font-bold text-sm">
              {formatCurrency(selectedObj.total)}
            </span>
            <span className="text-slate-400 block text-[11px] font-mono">
              {formatCurrency(selectedObj.unitPrice)} / unit
            </span>
          </div>
        </div>
      )}

      {(step.input || step.output) && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-[11px] font-mono text-indigo-400 hover:text-indigo-300 select-none">
            View Structured Step Payload (JSON)
          </summary>
          <pre className="mt-2 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 font-mono overflow-x-auto">
            {JSON.stringify({ input: step.input, output: step.output }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
};
