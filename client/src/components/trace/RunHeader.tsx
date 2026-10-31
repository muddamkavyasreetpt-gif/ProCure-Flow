import React from 'react';
import { StatusBadge } from '../shared/StatusBadge';
import { Clock, Zap, RefreshCw, Calendar } from 'lucide-react';
import { formatDate, formatDuration } from '../../utils/format';
import { AgentRun, PurchaseRequest } from '../../types';

interface RunHeaderProps {
  run: AgentRun;
  request?: PurchaseRequest;
}

export const RunHeader: React.FC<RunHeaderProps> = ({ run, request }) => {
  const replanCount = run.replan_count ?? run.replans ?? 0;

  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-800 mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-white tracking-tight">Live Agent Run Trace</h1>
            <StatusBadge status={run.status} size="lg" />
            {replanCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <RefreshCw className="w-3 h-3" />
                <span>Recovered automatically ({replanCount} Re-plan)</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-mono">RUN ID: {run.id}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              Active:{' '}
              <strong className="text-slate-200">{formatDuration(run.active_ms || 100)}</strong>
            </span>
          </div>

          {run.time_saved_minutes > 0 && (
            <div className="flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 text-emerald-400 font-semibold">
              <Zap className="w-3.5 h-3.5" />
              <span>Saved ~{run.time_saved_minutes}m</span>
            </div>
          )}

          <div className="hidden lg:flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{formatDate(run.started_at || run.created_at)}</span>
          </div>
        </div>
      </div>

      {request && (
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-sm">
          <span className="text-xs uppercase tracking-wider font-semibold text-indigo-400 block mb-1">
            Employee Procurement Request
          </span>
          <p className="text-slate-200 italic font-medium">
            &ldquo;{request.raw_text || request.request_text}&rdquo;
          </p>
          {request.justification && (
            <p className="text-xs text-slate-400 mt-1">
              <strong className="text-slate-300">Justification:</strong> {request.justification}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
