import React from 'react';
import { UserCheck, Briefcase, IndianRupee, Cpu, Megaphone } from 'lucide-react';

interface DemoCredentialButtonsProps {
  onSelect: (email: string, pass: string) => void;
}

export const DemoCredentialButtons: React.FC<DemoCredentialButtonsProps> = ({ onSelect }) => {
  const demoAccounts = [
    {
      label: 'Employee (Design)',
      email: 'employee@procureflow.demo',
      password: 'Demo@1234',
      icon: UserCheck,
      color: 'hover:border-indigo-500/50 hover:bg-indigo-500/10'
    },
    {
      label: 'Manager (Design)',
      email: 'manager@procureflow.demo',
      password: 'Demo@1234',
      icon: Briefcase,
      color: 'hover:border-amber-500/50 hover:bg-amber-500/10'
    },
    {
      label: 'Finance (Operations)',
      email: 'finance@procureflow.demo',
      password: 'Demo@1234',
      icon: IndianRupee,
      color: 'hover:border-emerald-500/50 hover:bg-emerald-500/10'
    },
    {
      label: 'Employee (Engineering)',
      email: 'eng.employee@procureflow.demo',
      password: 'Demo@1234',
      icon: Cpu,
      color: 'hover:border-cyan-500/50 hover:bg-cyan-500/10'
    },
    {
      label: 'Employee (Marketing)',
      email: 'mkt.employee@procureflow.demo',
      password: 'Demo@1234',
      icon: Megaphone,
      color: 'hover:border-rose-500/50 hover:bg-rose-500/10 col-span-2'
    }
  ];

  return (
    <div className="mt-6">
      <div className="relative mb-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-800" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-slate-900 px-2 text-slate-400">Quick 1-Click Demo Logins</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {demoAccounts.map((acc) => (
          <button
            key={acc.email}
            type="button"
            onClick={() => onSelect(acc.email, acc.password)}
            className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 text-xs text-slate-300 transition-all ${acc.color}`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <acc.icon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="truncate font-medium">{acc.label}</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500 truncate hidden sm:inline">
              {acc.email.split('@')[0]}@
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
