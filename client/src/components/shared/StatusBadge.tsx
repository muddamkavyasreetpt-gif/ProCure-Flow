import React from 'react';
import { CheckCircle2, Clock, XCircle, AlertTriangle, PlayCircle } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const getBadgeConfig = () => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'approved':
        return {
          bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          icon: <CheckCircle2 className="w-3.5 h-3.5" />,
          label: 'Completed'
        };
      case 'awaiting_approval':
        return {
          bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
          icon: <AlertTriangle className="w-3.5 h-3.5" />,
          label: 'Awaiting Approval'
        };
      case 'running':
      case 'processing':
        return {
          bg: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
          icon: <PlayCircle className="w-3.5 h-3.5 animate-spin" />,
          label: 'Processing'
        };
      case 'rejected':
      case 'failed':
        return {
          bg: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
          icon: <XCircle className="w-3.5 h-3.5" />,
          label: status === 'rejected' ? 'Rejected' : 'Failed'
        };
      default:
        return {
          bg: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
          icon: <Clock className="w-3.5 h-3.5" />,
          label: status || 'Pending'
        };
    }
  };

  const config = getBadgeConfig();
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${config.bg} ${sizeClasses}`}>
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
};
