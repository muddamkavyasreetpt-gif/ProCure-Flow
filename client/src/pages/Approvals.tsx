import React, { useState, useEffect } from 'react';
import { apiGetApprovals, apiDecideApproval } from '../api/client';
import { Approval } from '../types';
import { DecisionModal } from '../components/approvals/DecisionModal';
import { Spinner } from '../components/shared/Spinner';
import { EmptyState } from '../components/shared/EmptyState';
import { formatCurrency, formatDate } from '../utils/format';
import { CheckSquare, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Approvals: React.FC = () => {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const navigate = useNavigate();

  const loadApprovals = () => {
    setIsLoading(true);
    apiGetApprovals()
      .then((data) => setApprovals(data || []))
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadApprovals();
  }, []);

  const handleDecisionConfirm = async (
    approvalId: string,
    decision: 'approved' | 'rejected',
    comment: string
  ) => {
    await apiDecideApproval(approvalId, decision, comment);
    loadApprovals();
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold mb-2">
          <CheckSquare className="w-3.5 h-3.5" />
          <span>Governance Queue</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Approval Queue</h1>
        <p className="text-xs text-slate-400 mt-1">
          Purchases escalated by deterministic guardrails (spend threshold, vendor risk, or missing
          justification above ₹1,00,000).
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      ) : approvals.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="All Caught Up!"
          description="There are currently no pending approvals requiring human review."
        />
      ) : (
        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Required Role</th>
                <th className="py-3 px-4">Request &amp; Vendor Preview</th>
                <th className="py-3 px-4 text-right">Amount (INR)</th>
                <th className="py-3 px-4">Escalation Rationale</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Created</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {approvals.map((app) => {
                const statusVal = app.status || app.decision;
                return (
                  <tr key={app.id} className="hover:bg-slate-900/50 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-amber-400 uppercase font-mono text-[11px] bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        {app.required_role}
                      </span>
                      {app.department_name && (
                        <span className="block text-[10px] text-slate-500 mt-1">
                          {app.department_name}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="font-medium text-white line-clamp-2">
                        {app.request?.raw_text || app.request?.request_text || 'Purchase Request'}
                      </p>
                      {app.vendorPreview && (
                        <p className="text-[11px] text-indigo-300 font-mono mt-0.5">
                          {app.vendorPreview.vendorName} — {app.vendorPreview.quantity} ×{' '}
                          {app.vendorPreview.itemName}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-white whitespace-nowrap">
                      {formatCurrency(app.amount)}
                    </td>
                    <td className="py-3.5 px-4 max-w-sm">
                      <p className="line-clamp-2 text-slate-300">{app.reason}</p>
                      {app.comment && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          <strong>Reviewer note:</strong> {app.comment}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                          statusVal === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : statusVal === 'rejected'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {statusVal}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-400 whitespace-nowrap">
                      {formatDate(app.created_at)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {statusVal === 'pending' && (
                          <button
                            onClick={() => {
                              setSelectedApproval(app);
                              setIsModalOpen(true);
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-all shadow-sm"
                          >
                            Review
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/runs/${app.run_id}`)}
                          className="text-slate-400 hover:text-indigo-400 text-xs flex items-center gap-1 font-medium"
                        >
                          <span>Trace</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <DecisionModal
        approval={selectedApproval}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleDecisionConfirm}
      />
    </div>
  );
};
