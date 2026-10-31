import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { LogOut, Sparkles } from 'lucide-react';

export const Topbar: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-8 flex items-center justify-between shrink-0 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium">
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span>7 Specialized Agents Active</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <div className="text-xs font-medium text-slate-300">{user?.email}</div>
          <div className="text-[10px] text-slate-400 capitalize">{user?.role} Mode</div>
        </div>

        <button
          onClick={logout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-rose-500/30 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 text-xs font-medium transition-all"
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </header>
  );
};
