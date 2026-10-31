import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGetRequests } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PurchaseRequest } from '../types';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Spinner } from '../components/shared/Spinner';
import { EmptyState } from '../components/shared/EmptyState';
import { formatCurrency, formatDate } from '../utils/format';
import { PlusCircle, Search, ArrowRight } from 'lucide-react';

export const Requests: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    apiGetRequests()
      .then((reqs) => {
        setRequests(reqs || []);
      })
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = requests.filter((r) => {
    const text = (r.raw_text || r.request_text || '').toLowerCase();
    return (
      text.includes(searchTerm.toLowerCase()) ||
      r.status.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Purchase Requests</h1>
          <p className="text-xs text-slate-400 mt-1">
            Role-scoped history of procurement requests and autonomous agent executions (INR ₹).
          </p>
        </div>

        {user?.role !== 'finance' && (
          <button
            onClick={() => navigate('/requests/new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all self-start sm:self-auto"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Request</span>
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter requests by keyword or status..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No Requests Found"
          description={
            searchTerm
              ? 'No requests matched your search filter.'
              : "You haven't submitted any procurement requests yet."
          }
          action={
            user?.role !== 'finance'
              ? {
                  label: 'Create First Request',
                  onClick: () => navigate('/requests/new')
                }
              : undefined
          }
        />
      ) : (
        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Request Description</th>
                <th className="py-3 px-4 text-right">Est. Total</th>
                <th className="py-3 px-4 text-center">Urgency</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Submitted</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filtered.map((req) => {
                const runId = req.run_id || req.latestRun?.id;
                return (
                  <tr key={req.id} className="hover:bg-slate-900/50 transition-colors">
                    <td className="py-3.5 px-4 max-w-md font-medium text-white">
                      <p className="line-clamp-2">{req.raw_text || req.request_text}</p>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                      {req.estimated_total ? formatCurrency(req.estimated_total) : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="capitalize font-mono text-[11px] text-slate-400">
                        {req.urgency}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <StatusBadge status={req.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-400">
                      {formatDate(req.created_at)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {runId ? (
                        <button
                          onClick={() => navigate(`/runs/${runId}`)}
                          className="inline-flex items-center gap-1 font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          <span>Live Trace</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
