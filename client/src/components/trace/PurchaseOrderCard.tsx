import React from 'react';
import { FileCheck, Building2, Calendar, Printer, TrendingDown } from 'lucide-react';
import { PurchaseOrder } from '../../types';
import { formatCurrency } from '../../utils/format';
import { computeQuoteSavings, QuoteCandidate } from '../../utils/savings';

export const PurchaseOrderCard: React.FC<{
  po: PurchaseOrder;
  consideredQuotes?: QuoteCandidate[];
}> = ({ po, consideredQuotes = [] }) => {
  const totalAmount = po.total_amount ?? po.total ?? 0;
  const savings = computeQuoteSavings(totalAmount, consideredQuotes);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="glass-panel rounded-2xl p-6 border border-emerald-500/30 bg-emerald-950/10 mb-6 printable-po">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-400 font-bold block mb-1">
            Formal ERP Purchase Order Issued
          </span>
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-emerald-400" />
              <span>{po.po_number}</span>
            </h3>
            <span className="text-xs px-2 py-0.5 rounded font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
              {po.status || 'issued'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-slate-400" />
            <strong className="text-slate-200">{po.vendor_name || 'Approved Supplier'}</strong>
          </div>
          {po.expected_delivery && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>Delivery by {po.expected_delivery}</span>
            </div>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 hover:text-white transition-all text-xs font-medium no-print shadow-sm"
            title="Print or Save PDF"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-400" />
            <span>Download PO (PDF)</span>
          </button>
        </div>
      </div>

      {/* Line items table */}
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold">
            <tr>
              <th className="py-2.5 px-4 rounded-l-lg">Item Description</th>
              <th className="py-2.5 px-4 text-center">Qty</th>
              <th className="py-2.5 px-4 text-right">Unit Price (INR)</th>
              <th className="py-2.5 px-4 text-right rounded-r-lg">Total (INR)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {(po.line_items || []).map((item, idx) => (
              <tr key={idx}>
                <td className="py-2.5 px-4 font-medium text-white">
                  {item.item_name || item.description}
                </td>
                <td className="py-2.5 px-4 text-center font-mono">{item.quantity}</td>
                <td className="py-2.5 px-4 text-right font-mono">
                  {formatCurrency(item.unit_price)}
                </td>
                <td className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-400">
                  {formatCurrency(item.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PO Total & Estimated Savings */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs pt-3 border-t border-slate-800">
        <div>
          {savings.savingsVsHighest > 0 ? (
            <div className="flex items-center gap-2 text-emerald-400 font-medium">
              <TrendingDown className="w-4 h-4" />
              <span>
                Estimated Savings: <strong>{formatCurrency(savings.savingsVsHighest)}</strong> vs highest quote ({formatCurrency(savings.highestApprovedTotal)})
                {savings.savingsVsNextBest > 0 && (
                  <span className="text-slate-400 text-[11px] ml-1">
                    ({formatCurrency(savings.savingsVsNextBest)} vs next-best vendor)
                  </span>
                )}
              </span>
            </div>
          ) : (
            <span className="text-slate-500 text-[11px]">Best catalog pricing secured</span>
          )}
        </div>

        <div className="flex justify-between sm:justify-end gap-3 text-sm font-bold text-white">
          <span>Committed Total (INR):</span>
          <span className="font-mono text-emerald-400">{formatCurrency(totalAmount)}</span>
        </div>
      </div>
    </div>
  );
};
