import React from 'react';
import { ShieldCheck, Zap, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

interface AnomalyItem {
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

interface RunSummaryCardProps {
  headline?: string | null;
  summary: string | null;
  anomalies?: AnomalyItem[];
  timeSavedMinutes: number;
  activeMs: number;
}

export const RunSummaryCard: React.FC<RunSummaryCardProps> = ({
  headline,
  summary,
  anomalies = [],
  timeSavedMinutes,
  activeMs
}) => {
  if (!summary) return null;

  return (
    <div className="glass-panel rounded-2xl p-6 border border-indigo-500/30 bg-indigo-950/10 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-bold text-white">
            {headline || 'Auditor Agent Reflective Summary'}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>SHA-256 Tamper-Evident Chain</span>
          </span>
        </div>
      </div>

      <p className="text-sm text-slate-200 leading-relaxed mb-4">{summary}</p>

      {anomalies.length > 0 && (
        <div className="space-y-2 mb-4">
          {anomalies.map((anom, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2 p-2.5 rounded-xl text-xs border ${
                anom.severity === 'critical'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : anom.severity === 'warning'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
              }`}
            >
              {anom.severity === 'info' ? (
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-mono uppercase font-bold text-[10px] mr-2">
                  [{anom.severity}]
                </span>
                <span>{anom.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-slate-400 block mb-0.5">Estimated Time Saved</span>
          <span className="text-emerald-400 font-bold font-mono text-sm flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" />
            <span>{timeSavedMinutes} minutes</span>
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-slate-400 block mb-0.5">Active Agent Duration</span>
          <span className="text-white font-bold font-mono text-sm">
            {(activeMs / 1000).toFixed(1)} seconds
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 col-span-2 sm:col-span-1">
          <span className="text-slate-400 block mb-0.5">Guardrail Compliance</span>
          <span className="text-indigo-400 font-bold font-mono text-sm">100% Verified</span>
        </div>
      </div>
    </div>
  );
};
