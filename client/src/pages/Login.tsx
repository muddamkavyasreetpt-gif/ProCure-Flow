import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DemoCredentialButtons } from '../components/auth/DemoCredentialButtons';
import { Bot, ArrowRight, ShieldCheck } from 'lucide-react';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Login failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDemo = (selectedEmail: string, selectedPass: string) => {
    setEmail(selectedEmail);
    setPassword(selectedPass);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 selection:bg-indigo-500 selection:text-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-xl shadow-indigo-500/20 text-white mx-auto mb-4">
            <Bot className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">ProcureFlow</h1>
          <p className="text-xs text-slate-400 mt-1">Autonomous Multi-Agent Procurement System</p>
        </div>

        <div className="glass-panel p-8 rounded-3xl border border-slate-800 shadow-2xl">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-800/80">
            <h2 className="text-sm font-bold text-white">Sign In to Platform</h2>
            <span className="flex items-center gap-1 text-[11px] text-indigo-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Role-Based JWT</span>
            </span>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Corporate Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="employee@procureflow.demo"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
            >
              <span>{isLoading ? 'Signing In...' : 'Sign In'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <DemoCredentialButtons onSelect={handleSelectDemo} />

          <div className="mt-6 pt-4 border-t border-slate-800/80 text-center text-xs text-slate-400">
            <span>Need an employee account? </span>
            <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-medium">
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
