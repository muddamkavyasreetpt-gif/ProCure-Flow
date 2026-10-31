import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGetAnalytics, apiGetRequests } from '../api/client';
import { PurchaseRequest } from '../types';
import { DemoScenarioGuide } from '../components/dashboard/DemoScenarioGuide';
import { OutcomeDonut } from '../components/dashboard/OutcomeDonut';
import { SpendChart } from '../components/dashboard/SpendChart';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Spinner } from '../components/shared/Spinner';
import { formatCurrency, formatDate } from '../utils/format';
import { ImpactComparisonPanel } from '../components/trace/ImpactComparisonPanel';
import {
  FileText,
  CheckCircle2,
  Clock,
  Zap,
  PlusCircle,
  ArrowRight,
  TrendingDown
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [analytics, setAnalytics] = useState<any>(null);
  const [recentRequests, setRecentRequests] = useState<PurchaseRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiGetAnalytics(), apiGetRequests()])
      .then(([analyticsData, requestsData]) => {
        setAnalytics(analyticsData);
        setRecentRequests((requestsData || []).slice(0, 6));
      })
      .catch((err) => console.error('Dashboard load error:', err))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  const metrics = analytics?.metrics || {
    totalRequests: 0,
    completedRuns: 0,
    awaitingApproval: 0,
    totalTimeSavedMinutes: 0,
    totalSpendCommitted: 0,
    totalEstimatedSavings: 0
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Welcome back, {user?.fullName?.split(' ')[0] || 'User'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            ProcureFlow 7-agent procurement pipeline is active. All monetary values in INR (₹).
          </p>
        </div>

        {user?.role !== 'finance' && (
          <button
            onClick={() => navigate('/requests/new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all active:scale-95 self-start sm:self-auto"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Procurement Request</span>
          </button>
        )}
      </div>

      {/* Hero Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Total Requests</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-white">{metrics.totalRequests}</p>
          <span className="text-[11px] text-slate-500">
            Committed PO Spend: {formatCurrency(metrics.totalSpendCommitted || 0)}
          </span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Completed</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-400">{metrics.completedRuns}</p>
          <span className="text-[11px] text-slate-500">PO generated &amp; committed</span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Awaiting Approval</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-amber-400">{metrics.awaitingApproval}</p>
          <span className="text-[11px] text-slate-500">Pending manager / finance</span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Estimated Savings</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-indigo-400">
            {formatCurrency(metrics.totalEstimatedSavings || 0)}
          </p>
          <span className="text-[11px] text-slate-500">vs highest catalog quotes</span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Time Saved</span>
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-teal-400">
            {metrics.totalTimeSavedMinutes >= 60
              ? `${(metrics.totalTimeSavedMinutes / 60).toFixed(1)} hrs`
              : `${metrics.totalTimeSavedMinutes} mins`}
          </p>
          <span className="text-[11px] text-slate-500">vs 90m manual baseline</span>
        </div>
      </div>

      {/* Aggregate Impact Panel (Priority 1-A) */}
      <ImpactComparisonPanel
        route="manager"
        actualActiveMs={metrics.completedRuns * 1500 + metrics.awaitingApproval * 1200}
        stepsCount={metrics.totalRequests * 6}
        toolCallsCount={metrics.totalRequests * 5}
        policyBudgetChecksCount={metrics.totalRequests * 2}
        title="Aggregate Organization Impact (Manual vs ProcureFlow)"
        isAggregate={true}
        totalRuns={metrics.totalRequests}
      />

      {/* Interactive Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SpendChart departments={analytics?.departments || []} />
        </div>
        <div>
          <OutcomeDonut distribution={analytics?.statusDistribution || {}} />
        </div>
      </div>

      {/* Evaluator Scenario Tour */}
      <DemoScenarioGuide />

      {/* Recent Requests Stream */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Recent Requests</h3>
          <button
            onClick={() => navigate('/requests')}
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentRequests.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            No procurement requests recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-2.5 px-4 rounded-l-lg">Request Intent</th>
                  <th className="py-2.5 px-4 text-right">Est. Total</th>
                  <th className="py-2.5 px-4 text-center">Urgency</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                  <th className="py-2.5 px-4 text-right">Created</th>
                  <th className="py-2.5 px-4 text-right rounded-r-lg">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {recentRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-4 max-w-xs truncate font-medium text-white">
                      {req.raw_text || req.request_text}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                      {req.estimated_total ? formatCurrency(req.estimated_total) : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="capitalize font-mono text-[11px] text-slate-400">
                        {req.urgency}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <StatusBadge status={req.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400">
                      {formatDate(req.created_at)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() =>
                          navigate(req.run_id ? `/runs/${req.run_id}` : `/requests`)
                        }
                        className="text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        Inspect Trace
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
