import React, { useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { Approval } from '../../types';
import { apiDecideApproval } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/format';

interface ApprovalBannerProps {
  approval: Approval;
  amountFallback?: number;
  requesterId?: string;
  onDecided?: () => void;
}

export const ApprovalBanner: React.FC<ApprovalBannerProps> = ({
  approval,
  amountFallback = 0,
  requesterId,
  onDecided
}) => {
  const { user } = useAuth();
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusVal = approval.status || approval.decision;
  if (statusVal !== 'pending') return null;

  const displayAmount = approval.amount || amountFallback || 0;
  const isSelfRequest = Boolean(user && requesterId && user.id === requesterId);
  const canDecide =
    Boolean(user) &&
    !isSelfRequest &&
    (user!.role === 'finance' ||
      (user!.role === 'manager' && approval.required_role === 'manager'));

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    if (!comment.trim()) {
      setError('Please provide a decision rationale / comment before proceeding.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await apiDecideApproval(approval.id, decision, comment.trim());
      onDecided?.();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Action failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-200 mb-6 shadow-xl shadow-amber-500/5">
      <div className="flex items-start gap-4 mb-4">
        <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-base font-bold text-white">
              Waiting for {approval.required_role?.toUpperCase()} Approval
            </h3>
            {displayAmount > 0 && (
              <span className="text-xs font-mono font-bold bg-amber-500/20 px-2 py-0.5 rounded text-amber-300">
                Reserved Amount: {formatCurrency(displayAmount)}
              </span>
            )}
          </div>
          <p className="text-xs text-amber-200/90 leading-relaxed">{approval.reason}</p>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {canDecide ? (
        <div className="space-y-3">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Enter justification or reason for approval / rejection (1–500 chars)..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-amber-500/30 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
          />

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleDecision('rejected')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reject &amp; Release Budget</span>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleDecision('approved')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Approve &amp; Issue PO</span>
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-amber-300/80 font-mono bg-slate-950/60 p-3 rounded-xl border border-amber-500/20">
          {isSelfRequest
            ? 'Self-approval is blocked by governance rules. Please sign in as a different Manager or Finance user to decide this approval.'
            : `Sign in as a ${approval.required_role?.toUpperCase()} user (${approval.required_role}@procureflow.demo) to approve or reject this request.`}
        </p>
      )}
    </div>
  );
};
