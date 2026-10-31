import React from 'react';
import { Award, CheckCircle, XCircle, ShieldAlert } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

export interface ConsideredVendorItem {
  vendorId: string;
  vendorName: string;
  unitPrice: number;
  total?: number;
  totalPrice?: number;
  leadTimeDays?: number;
  leadDays?: number;
  rating?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  score: number;
  stockOk?: boolean | null;
  inStock?: boolean;
  excludedReason?: string | null;
}

interface VendorComparisonTableProps {
  candidates: ConsideredVendorItem[];
  selectedVendorId?: string;
}

export const VendorComparisonTable: React.FC<VendorComparisonTableProps> = ({
  candidates,
  selectedVendorId
}) => {
  if (!candidates || candidates.length === 0) return null;

  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-800 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">
            Deterministic Vendor Evaluation Matrix (INR ₹)
          </h3>
          <p className="text-xs text-slate-400">
            Weighted score: Price (45%) + Delivery Speed (25%) + Rating (20%) + Risk Level (10%)
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold">
            <tr>
              <th className="py-2.5 px-3 rounded-l-lg">Supplier</th>
              <th className="py-2.5 px-3 text-right">Score</th>
              <th className="py-2.5 px-3 text-right">Unit Price</th>
              <th className="py-2.5 px-3 text-right">Total</th>
              <th className="py-2.5 px-3 text-center">Lead Time</th>
              <th className="py-2.5 px-3 text-center">Risk</th>
              <th className="py-2.5 px-3 text-center">Stock</th>
              <th className="py-2.5 px-3 text-center rounded-r-lg">Status / Exclusion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {candidates.map((cand) => {
              const isSelected = cand.vendorId === selectedVendorId;
              const isExcluded = Boolean(cand.excludedReason);
              const stockFailed = cand.stockOk === false || cand.inStock === false;
              const lead = cand.leadTimeDays ?? cand.leadDays ?? 0;
              const totalVal = cand.total ?? cand.totalPrice ?? cand.unitPrice;

              return (
                <tr
                  key={cand.vendorId}
                  className={
                    isSelected
                      ? 'bg-emerald-500/10 font-medium'
                      : isExcluded
                      ? 'bg-rose-950/15 text-slate-400'
                      : ''
                  }
                >
                  <td className="py-2.5 px-3">
                    <span className="font-semibold text-white">{cand.vendorName}</span>
                    {cand.rating !== undefined && (
                      <span className="block text-[10px] text-slate-500 font-mono">
                        Rating: {Number(cand.rating).toFixed(1)}/5
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-400">
                    {isExcluded ? '—' : Number(cand.score || 0).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono">
                    {formatCurrency(cand.unitPrice)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-200">
                    {formatCurrency(totalVal)}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono">{lead}d</td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                        cand.riskLevel === 'low'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : cand.riskLevel === 'medium'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {cand.riskLevel || 'low'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {cand.stockOk === true ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>OK</span>
                      </span>
                    ) : stockFailed ? (
                      <span className="inline-flex items-center gap-1 text-rose-400 font-mono text-[11px]">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Low stock</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 font-mono text-[11px]">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <Award className="w-3 h-3" />
                        <span>SELECTED</span>
                      </span>
                    ) : isExcluded ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        <ShieldAlert className="w-3 h-3" />
                        <span>{cand.excludedReason}</span>
                      </span>
                    ) : stockFailed ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        <span>Stock check failed</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-mono">Eligible</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
