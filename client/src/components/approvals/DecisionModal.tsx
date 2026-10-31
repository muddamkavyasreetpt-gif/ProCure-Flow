import React, { useState } from 'react';
import { X, CheckCircle, XCircle, Bot, ShieldAlert, TrendingDown } from 'lucide-react';
import { Approval } from '../../types';
import { formatCurrency } from '../../utils/format';

interface DecisionModalProps {
  approval: Approval | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (approvalId: string, decision: 'approved' | 'rejected', comment: string) => Promise<void>;
}

export const DecisionModal: React.FC<DecisionModalProps> = ({
  approval,
  isOpen,
  onClose,
  onConfirm
}) => {
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !approval) return null;

  const quickChips = [
    'Within budget and meets corporate policy',
    'Approved as requested for business operations',
    'Need further business justification before proceeding',
    'Exceeds departmental need — please revise quantity'
  ];

  const handleChipClick = (chipText: string) => {
    setComment(chipText);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      setError('A comment or justification is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(approval.id, decision, comment.trim());
      setComment('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Action failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confidenceScore = approval.vendorPreview?.confidence ?? 0.95;
  const isLowConfidence = confidenceScore < 0.5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">Review Procurement Approval</h3>
            {isLowConfidence && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <ShieldAlert className="w-3 h-3" />
                <span>Low Confidence</span>
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Agent Brief at the top */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/30 via-slate-900 to-slate-950 border border-indigo-500/20 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-indigo-300 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
              <Bot className="w-3.5 h-3.5 text-indigo-400" />
              Agent Executive Brief
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              Confidence: {(confidenceScore * 100).toFixed(0)}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/60">
            <div>
              <span className="text-slate-400 text-[11px] block">Total Amount:</span>
              <strong className="text-white font-mono text-sm">{formatCurrency(approval.amount)}</strong>
            </div>
            <div>
              <span className="text-slate-400 text-[11px] block">Vendor Selected:</span>
              <strong className="text-slate-200">
                {approval.vendorPreview?.vendorName || 'Ranked Supplier'}
              </strong>
            </div>
          </div>

          {approval.savings && approval.savings.savingsVsHighest > 0 && (
            <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] pt-1 border-t border-slate-800/60">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>
                Estimated Savings: <strong>{formatCurrency(approval.savings.savingsVsHighest)}</strong> vs highest quote
              </span>
            </div>
          )}

          <div className="pt-1">
            <span className="text-slate-400 text-[11px] block">Escalation Trigger:</span>
            <p className="text-slate-300 italic text-[11px]">{approval.reason}</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Select Decision
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDecision('approved')}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all ${
                  decision === 'approved'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-800 bg-slate-900 text-slate-400'
                }`}
              >
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>Approve Request</span>
              </button>

              <button
                type="button"
                onClick={() => setDecision('rejected')}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all ${
                  decision === 'rejected'
                    ? 'border-rose-500/50 bg-rose-500/10 text-rose-300'
                    : 'border-slate-800 bg-slate-900 text-slate-400'
                }`}
              >
                <XCircle className="w-4 h-4 text-rose-400" />
                <span>Reject Request</span>
              </button>
            </div>
          </div>

          {/* Quick Comment Chips */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Quick Comment Chips
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {quickChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 transition-colors text-left"
                >
                  {chip}
                </button>
              ))}
            </div>

            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g., Approved based on Q4 hardware budget allocation..."
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 text-xs font-semibold text-white rounded-xl transition-all ${
                decision === 'approved'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-rose-600 hover:bg-rose-500'
              } disabled:opacity-50`}
            >
              {isSubmitting ? 'Submitting...' : 'Confirm Decision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
