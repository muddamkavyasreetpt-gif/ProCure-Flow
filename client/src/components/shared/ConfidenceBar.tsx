import React from 'react';

interface ConfidenceBarProps {
  score: number; // 0 to 1 or 0 to 100
  label?: string;
  showPercent?: boolean;
}

export const ConfidenceBar: React.FC<ConfidenceBarProps> = ({
  score,
  label,
  showPercent = true
}) => {
  const normalized = score > 1 ? score : Math.round(score * 100);

  const getColor = () => {
    if (normalized >= 85) return 'bg-emerald-500';
    if (normalized >= 60) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs mb-1">
        {label && <span className="text-slate-400 font-medium">{label}</span>}
        {showPercent && <span className="text-slate-300 font-mono font-semibold">{normalized}%</span>}
      </div>
      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getColor()}`}
          style={{ width: `${normalized}%` }}
        />
      </div>
    </div>
  );
};
