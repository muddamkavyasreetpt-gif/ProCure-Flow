import React, { useState, useEffect } from 'react';
import { apiGetAuditLogs } from '../api/client';
import { AuditLog } from '../types';
import { Spinner } from '../components/shared/Spinner';
import { formatDate } from '../utils/format';
import { ShieldCheck, CheckCircle2, AlertTriangle, Search, Hash } from 'lucide-react';

export const Audit: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [chainValid, setChainValid] = useState<boolean>(true);
  const [brokenAt, setBrokenAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    apiGetAuditLogs()
      .then((data: any) => {
        setLogs(data.logs || []);
        setChainValid(data.chainValid !== false);
        setBrokenAt(data.brokenAt ?? null);
      })
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = logs.filter((log) => {
    const q = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.entity_type.toLowerCase().includes(q) ||
      (log.actor || '').toLowerCase().includes(q) ||
      (log.hash || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Tamper-Evident Ledger</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Cryptographic Audit Trail
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Append-only ledger written exclusively via PostgreSQL{' '}
            <code className="text-indigo-300">append_audit_log</code> RPC and verified live via{' '}
            <code className="text-indigo-300">verify_audit_chain()</code>.
          </p>
        </div>

        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold font-mono self-start sm:self-auto ${
            chainValid
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          {chainValid ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Chain Integrity: VERIFIED VALID</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>TAMPER DETECTED (Row #{brokenAt})</span>
            </>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search audit trail by action, actor, entity, or SHA-256 hash..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Details</th>
                <th className="py-3 px-4 text-right font-mono">SHA-256 Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-900/50 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-500">#{log.id}</td>
                  <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-300">
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 mr-1.5">
                      {log.actor_type}
                    </span>
                    {log.actor}
                  </td>
                  <td className="py-3 px-4 font-semibold text-white">
                    <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-indigo-300 font-mono text-[11px]">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 capitalize text-slate-300">{log.entity_type}</td>
                  <td className="py-3 px-4 max-w-xs truncate text-slate-400 font-mono text-[11px]">
                    {JSON.stringify(log.details)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-400 text-[11px]">
                    <span
                      title={`Prev: ${log.prev_hash || 'GENESIS'}\nHash: ${log.hash}`}
                      className="cursor-help flex items-center justify-end gap-1"
                    >
                      <Hash className="w-3 h-3 text-emerald-500" />
                      <span>
                        {log.hash ? `${log.hash.slice(0, 8)}...${log.hash.slice(-8)}` : '—'}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
