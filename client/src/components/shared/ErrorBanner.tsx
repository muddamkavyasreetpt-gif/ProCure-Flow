import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onDismiss }) => {
  if (!message) return null;

  return (
    <div className="flex items-center justify-between p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm mb-4">
      <div className="flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-rose-400 hover:text-rose-200 transition-colors p-1"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
