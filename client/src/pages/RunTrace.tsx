import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRunStream } from '../hooks/useRunStream';
import { RunHeader } from '../components/trace/RunHeader';
import { PlanPanel } from '../components/trace/PlanPanel';
import { AgentTimeline } from '../components/trace/AgentTimeline';
import { ApprovalBanner } from '../components/trace/ApprovalBanner';
import { PurchaseOrderCard } from '../components/trace/PurchaseOrderCard';
import { VendorComparisonTable, ConsideredVendorItem } from '../components/trace/VendorComparisonTable';
import { RunSummaryCard } from '../components/trace/RunSummaryCard';
import { ImpactComparisonPanel } from '../components/trace/ImpactComparisonPanel';
import { Spinner } from '../components/shared/Spinner';
import {
  ArrowLeft,
  RefreshCw,
  AlertOctagon,
  Play,
  RotateCcw,
  Mail,
  Lightbulb,
  ArrowRight
} from 'lucide-react';
import { formatCurrency } from '../utils/format';

export const RunTrace: React.FC = () => {
  const { id: runId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { runDetail, steps, isStreaming, error, refresh } = useRunStream(runId);

  // Active Tab: 'trace' vs 'outbox'
  const [activeTab, setActiveTab] = useState<'trace' | 'outbox'>('trace');

  // Replay animation state (client-only 4x replay)
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayStepCount, setReplayStepCount] = useState<number | null>(null);

  const startReplay = () => {
    if (steps.length === 0) return;
    setIsReplaying(true);
    setReplayStepCount(1);

    let current = 1;
    const interval = setInterval(() => {
      current++;
      if (current > steps.length) {
        clearInterval(interval);
        setIsReplaying(false);
        setReplayStepCount(null);
      } else {
        setReplayStepCount(current);
      }
    }, 450); // 4x acceleration
  };

  if (!runDetail && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Spinner size="lg" className="mb-4" />
        <p className="text-sm text-slate-400">Connecting to live agent stream...</p>
      </div>
    );
  }

  if (error && !runDetail) {
    return (
      <div className="glass-panel p-8 rounded-2xl border border-rose-500/30 text-center">
        <p className="text-rose-400 text-sm mb-4">Error loading run: {error}</p>
        <button
          onClick={() => navigate('/requests')}
          className="px-4 py-2 bg-slate-800 text-white text-xs rounded-xl hover:bg-slate-700"
        >
          Return to Requests
        </button>
      </div>
    );
  }

  const { run, request, approvals, purchaseOrder, notifications } = runDetail!;
  const pendingApproval = approvals?.find((a) => (a.status || a.decision) === 'pending');

  // Extract considered vendors and selectedVendorId from steps or run state
  let consideredVendors: ConsideredVendorItem[] =
    (run.state?.consideredVendors as ConsideredVendorItem[]) || [];
  let selectedVendorId: string | undefined =
    purchaseOrder?.vendor_id || run.state?.selectedQuote?.vendorId;

  let auditorHeadline: string | null = null;
  let auditorAnomalies: Array<{ severity: 'info' | 'warning' | 'critical'; message: string }> = [];
  let budgetAlternative: any = null;
  let permittedCategories: string[] | null = null;
  let toolCallsCount = 0;

  for (const step of steps) {
    if (step.kind === 'tool_call') {
      toolCallsCount++;
    }
    if (step.output?.considered && Array.isArray(step.output.considered)) {
      consideredVendors = step.output.considered as ConsideredVendorItem[];
    } else if (step.output?.rankedVendors && Array.isArray(step.output.rankedVendors)) {
      consideredVendors = step.output.rankedVendors as ConsideredVendorItem[];
    }
    if (step.output?.selected?.vendorId) {
      selectedVendorId = String(step.output.selected.vendorId);
    }
    if (step.output?.suggestedAlternative) {
      budgetAlternative = step.output.suggestedAlternative;
    }
    if (step.output?.permittedCategories) {
      permittedCategories = step.output.permittedCategories;
    }
    if (step.agent === 'auditor' && step.kind === 'summary') {
      if (step.output?.headline) {
        auditorHeadline = String(step.output.headline);
      }
      if (Array.isArray(step.output?.anomalies)) {
        auditorAnomalies = step.output.anomalies;
      }
    }
  }

  const amountFallback = Number(
    run.state?.reservedAmount ??
      run.state?.selectedQuote?.total ??
      request?.estimated_total ??
      0
  );

  const displayedSteps =
    replayStepCount !== null ? steps.slice(0, replayStepCount) : steps;

  const handleRetryRun = () => {
    if (!request?.raw_text && !request?.request_text) return;
    navigate(
      `/requests/new?prompt=${encodeURIComponent(
        request.raw_text || request.request_text
      )}`
    );
  };

  const handleResubmitWithQuantity = (units: number, itemName: string) => {
    const text = `I need ${units} × ${itemName} for our department.`;
    navigate(`/requests/new?prompt=${encodeURIComponent(text)}`);
  };

  return (
    <div className="space-y-6 pb-16" aria-live="polite">
      {/* Back, Tab Switcher, and Replay Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={() => navigate('/requests')}
          className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Requests</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Outbox & Trace Tabs */}
          <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setActiveTab('trace')}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeTab === 'trace'
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Agent Trace
            </button>
            <button
              onClick={() => setActiveTab('outbox')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                activeTab === 'outbox'
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Outbox ({notifications?.length || 0})</span>
            </button>
          </div>

          {/* Replay 4x Button on completed/rejected runs */}
          {['completed', 'rejected'].includes(run.status) && (
            <button
              onClick={startReplay}
              disabled={isReplaying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-semibold text-indigo-300 transition-colors disabled:opacity-50"
              title="Animate agent steps in sequence (4x speed)"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isReplaying ? 'Replaying...' : 'Replay at 4x'}</span>
            </button>
          )}

          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 hover:bg-slate-900 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Hero Run Header */}
      <RunHeader run={run} request={request} />

      {/* Human-Readable Failed Run Error Reason Banner & Retry Run Button */}
      {run.status === 'failed' && (
        <div className="glass-panel p-5 rounded-2xl border border-rose-500/40 bg-rose-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Workflow Execution Terminated</h3>
              <p className="text-xs text-rose-300 mt-1">
                {run.summary || 'An unexpected operational failure occurred during agent execution.'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Any budget reserved during this run has been automatically released back to the department.
              </p>
            </div>
          </div>

          <button
            onClick={handleRetryRun}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/30 transition-all shrink-0 self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry Run</span>
          </button>
        </div>
      )}

      {/* Smart Alternatives on Rejection Card (Priority 1-D) */}
      {run.status === 'rejected' && (budgetAlternative || permittedCategories) && (
        <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-amber-950/15 space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Suggested Next Step</h3>
          </div>

          {budgetAlternative && budgetAlternative.maxAffordableQuantity > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
              <div>
                <p className="text-slate-200">
                  Your budget can support up to{' '}
                  <strong className="text-emerald-400 font-bold font-mono">
                    {budgetAlternative.maxAffordableQuantity} {budgetAlternative.itemName}(s)
                  </strong>{' '}
                  at {formatCurrency(budgetAlternative.cheapestUnitPrice)} each via{' '}
                  {budgetAlternative.cheapestVendorName}.
                </p>
              </div>

              <button
                onClick={() =>
                  handleResubmitWithQuantity(
                    budgetAlternative.maxAffordableQuantity,
                    budgetAlternative.itemName
                  )
                }
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shrink-0 shadow-sm"
              >
                <span>Resubmit with {budgetAlternative.maxAffordableQuantity} units</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {permittedCategories && permittedCategories.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
              <span className="text-slate-400 block mb-1">
                Policy allows requests in these approved categories:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {permittedCategories.map((c, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium text-[11px]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Human Escalation Action Banner (if active) */}
      {pendingApproval && (
        <ApprovalBanner
          approval={pendingApproval}
          amountFallback={amountFallback}
          requesterId={request?.requester_id}
          onDecided={refresh}
        />
      )}

      {/* Outbox View or Live Trace View */}
      {activeTab === 'outbox' ? (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Mail className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white">Automated Email Outbox</h3>
          </div>

          {!notifications || notifications.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              No outbound notifications generated for this run yet.
            </p>
          ) : (
            <div className="space-y-3">
              {notifications.map((notif: any) => (
                <div
                  key={notif.id}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-indigo-400">To:</span>
                      <strong className="text-slate-200">{notif.recipient_email}</strong>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        {notif.channel || 'email'}
                      </span>
                    </div>
                    <span className="text-slate-500 font-mono text-[11px]">
                      {notif.created_at ? new Date(notif.created_at).toLocaleTimeString() : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold mb-0.5">Subject:</span>
                    <p className="text-white font-medium">{notif.subject}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-slate-300 font-mono text-[11px] whitespace-pre-wrap">
                    {notif.body}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Two Column Grid */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Impact Comparison Panel (Priority 1-A) */}
            <ImpactComparisonPanel
              route={
                run.state?.requiredRole ||
                (purchaseOrder ? 'auto' : pendingApproval?.required_role || 'auto')
              }
              actualActiveMs={run.active_ms || 1200}
              stepsCount={steps.length}
              toolCallsCount={toolCallsCount}
              policyBudgetChecksCount={2}
            />

            {/* Reflective Summary Card */}
            <RunSummaryCard
              headline={auditorHeadline}
              summary={run.summary}
              anomalies={auditorAnomalies}
              timeSavedMinutes={run.time_saved_minutes}
              activeMs={run.active_ms}
            />

            {/* Generated Purchase Order with Savings & Print */}
            {purchaseOrder && (
              <PurchaseOrderCard po={purchaseOrder} consideredQuotes={consideredVendors} />
            )}

            {/* Vendor Evaluation Table */}
            {consideredVendors.length > 0 && (
              <VendorComparisonTable
                candidates={consideredVendors}
                selectedVendorId={selectedVendorId}
              />
            )}

            {/* Live Streaming Timeline (supports Replay) */}
            <AgentTimeline steps={displayedSteps} isStreaming={isStreaming && !isReplaying} />
          </div>

          <div>
            {/* Execution Plan Checklist */}
            <PlanPanel plan={run.plan} steps={steps} completedStepCount={steps.length} />
          </div>
        </div>
      )}
    </div>
  );
};
