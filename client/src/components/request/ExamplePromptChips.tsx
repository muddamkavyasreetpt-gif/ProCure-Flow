import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

interface ExamplePromptChipsProps {
  onSelect: (text: string, urgency: 'low' | 'normal' | 'high', justification?: string) => void;
}

export const ExamplePromptChips: React.FC<ExamplePromptChipsProps> = ({ onSelect }) => {
  const examples = [
    {
      title: '1. Stock Shortage Re-plan & Finance Escalation',
      badge: 'Re-plan + Finance',
      text: 'I need 10 laptops for the new design team, budget around ₹12 lakh, needed in 3 weeks.',
      urgency: 'normal' as const,
      color: 'border-indigo-500/30 bg-indigo-500/5 hover:border-indigo-500/50 text-indigo-300'
    },
    {
      title: '2. Missing Justification Floor (Manager)',
      badge: 'Manager Approval',
      text: 'Order 20 ergonomic office chairs for the Design studio.',
      urgency: 'normal' as const,
      color: 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 text-amber-300'
    },
    {
      title: '3. Low-Risk SaaS Auto-Approval',
      badge: 'Auto-Approve (₹24k)',
      text: 'Buy 5 annual project-management software licenses for Engineering.',
      urgency: 'normal' as const,
      color: 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 text-emerald-300'
    },
    {
      title: '4. Prohibited Category Block',
      badge: 'Policy Block',
      text: 'Purchase 200 gift cards worth ₹500 each as employee rewards.',
      urgency: 'normal' as const,
      color: 'border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50 text-rose-300'
    }
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
        <span>Clickable Example Prompts (INR ₹)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {examples.map((ex) => (
          <button
            key={ex.title}
            type="button"
            onClick={() => onSelect(ex.text, ex.urgency)}
            className={`flex flex-col text-left p-3.5 rounded-xl border transition-all text-xs group ${ex.color}`}
          >
            <div className="flex items-center justify-between w-full mb-1.5 gap-2">
              <span className="font-semibold text-slate-200 truncate">{ex.title}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-slate-800/80 shrink-0">
                {ex.badge}
              </span>
            </div>
            <p className="text-slate-300 line-clamp-2 mb-2 font-normal">{ex.text}</p>
            <div className="flex items-center gap-1 text-[11px] font-medium text-indigo-400 group-hover:translate-x-0.5 transition-transform mt-auto">
              <span>Fill request form</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
