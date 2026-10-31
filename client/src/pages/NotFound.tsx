import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, ArrowLeft } from 'lucide-react';

export const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
      <div className="glass-panel p-12 rounded-3xl border border-slate-800 max-w-md w-full">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-4">
          <Bot className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2 font-mono">404</h1>
        <p className="text-sm text-slate-400 mb-6">The requested page or route could not be found.</p>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </button>
      </div>
    </div>
  );
};
