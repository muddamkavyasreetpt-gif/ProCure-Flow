import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  action
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center glass-panel rounded-2xl border border-slate-800">
      <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 shadow-lg shadow-indigo-500/5">
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-lg font-semibold text-slate-200 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 max-w-sm mb-6">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-indigo-600/25 active:scale-95"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
