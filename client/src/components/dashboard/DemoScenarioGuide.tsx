import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';

export const DemoScenarioGuide: React.FC = () => {
  const navigate = useNavigate();

  const scenarios = [
    {
      num: 1,
      title: 'Manager Escalation (Missing Justification Floor)',
      account: 'employee@procureflow.demo (Design) → manager@procureflow.demo approves',
      prompt: 'Order 20 ergonomic office chairs for the Design studio.',
      outcome:
        'OfficeMart India selected at ₹1,70,000 (beats WorkSpace ₹1,84,000). Spend > ₹1,00,000 without justification raises route floor to Manager → manager approves → PO issued.',
      badge: 'Manager Route'
    },
    {
      num: 2,
      title: 'Stock Shortage Re-plan + Finance Approval',
      account: 'employee@procureflow.demo (Design) → finance@procureflow.demo approves',
      prompt: '10 laptops for the new design team, around ₹12 lakh, needed in 3 weeks.',
      outcome:
        'TechNova Systems ranks #1 (₹9,80,000) but has only 4 in stock (< 10). Vendor Agent triggers needs_replan → Orchestrator excludes TechNova → Prime Infotech selected at ₹10,40,000 → Finance approves → PO issued.',
      badge: 'Autonomous Re-plan'
    },
    {
      num: 3,
      title: 'Zero-Touch Auto-Approval',
      account: 'eng.employee@procureflow.demo (Engineering)',
      prompt: 'Buy 5 annual project-management software licenses for Engineering.',
      outcome:
        'SoftSuite Reseller selected at ₹24,000 (≤ ₹25,000 auto-approve limit, low risk). Auto-approved with PO issued in about a minute or two.',
      badge: 'Auto-Approved'
    },
    {
      num: 4,
      title: 'Prohibited Category Policy Block',
      account: 'employee@procureflow.demo (Any employee)',
      prompt: 'Purchase 200 gift cards worth ₹500 each as employee rewards.',
      outcome:
        'Mapped to Prohibited Items. Blocked and rejected immediately by Policy Agent; ₹0 budget reserved; sealed by Auditor.',
      badge: 'Policy Blocked'
    },
    {
      num: 5,
      title: 'Insufficient Department Budget Rejection',
      account: 'mkt.employee@procureflow.demo (Marketing — ₹1,00,000 remaining)',
      prompt: 'I need 10 laptops for the marketing team.',
      outcome:
        'Minimum approved catalog estimate (₹9,50,000) exceeds Marketing available balance (₹1,00,000). Rejected by Budget Agent; nothing reserved.',
      badge: 'Budget Rejected'
    },
    {
      num: 6,
      title: 'Unapproved Vendor Exclusion Guardrail',
      account: 'Visible in Scenario 2 Vendor Comparison Table & /vendors',
      prompt: '10 laptops for the new design team, around ₹12 lakh, needed in 3 weeks.',
      outcome:
        'QuickDeals Traders (cheapest at ₹85,000/unit) appears in the considered vendor table explicitly excluded with reason "Vendor not approved".',
      badge: 'Vendor Guardrail'
    }
  ];

  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Demo Scenario Guide (All 6 Deterministic Scenarios)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Click &ldquo;Use this prompt&rdquo; on any scenario to pre-fill the New Request form.
          </p>
        </div>
        <button
          onClick={() => navigate('/requests/new')}
          className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 self-start sm:self-auto"
        >
          <span>Open New Request</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scenarios.map((sc) => (
          <div
            key={sc.num}
            className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-indigo-400 font-mono">
                  Scenario #{sc.num}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {sc.badge}
                </span>
              </div>
              <h4 className="text-xs font-bold text-white mb-1">{sc.title}</h4>
              <p className="text-[11px] font-mono text-amber-300/90 mb-2">{sc.account}</p>
              <p className="text-xs text-slate-200 italic bg-slate-950/70 p-2 rounded-lg border border-slate-800/80 mb-2">
                &ldquo;{sc.prompt}&rdquo;
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">{sc.outcome}</p>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(`/requests/new?prompt=${encodeURIComponent(sc.prompt)}`)
              }
              className="w-full py-1.5 px-3 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/30 text-indigo-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
            >
              <span>Use this prompt</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
