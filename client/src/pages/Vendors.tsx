import React, { useState, useEffect } from 'react';
import { apiGetVendors } from '../api/client';
import { Vendor } from '../types';
import { Spinner } from '../components/shared/Spinner';
import { formatCurrency } from '../utils/format';
import { Building2, ShieldAlert, CheckCircle2, XCircle, Star, Package } from 'lucide-react';

export const Vendors: React.FC = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiGetVendors()
      .then((data) => setVendors(data || []))
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-semibold mb-2">
          <Building2 className="w-3.5 h-3.5" />
          <span>Supplier &amp; Catalog Directory</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Vendors &amp; Catalog (INR ₹)</h1>
        <p className="text-xs text-slate-400 mt-1">
          Approved and unapproved suppliers evaluated deterministically by price (45%), delivery
          speed (25%), rating (20%), and risk level (10%). Unapproved vendors are automatically
          excluded with reason &ldquo;Vendor not approved&rdquo;.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {vendors.map((v) => (
            <div
              key={v.id}
              className={`glass-panel p-6 rounded-2xl border transition-all flex flex-col justify-between ${
                !v.approved
                  ? 'border-rose-500/40 bg-rose-950/10'
                  : 'border-slate-800 hover:border-indigo-500/40'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span>{v.name}</span>
                    </h3>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(v.categories || []).map((cat) => (
                        <span
                          key={cat}
                          className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>

                  {v.approved ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>Approved</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 rounded-full shrink-0">
                      <ShieldAlert className="w-3 h-3 text-rose-400" />
                      <span>Vendor not approved</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block mb-0.5">Rating</span>
                    <span className="font-mono font-bold text-amber-400 flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      {Number(v.rating).toFixed(1)} / 5.0
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block mb-0.5">Risk Level</span>
                    <span
                      className={`font-mono font-bold uppercase ${
                        v.risk_level === 'low'
                          ? 'text-emerald-400'
                          : v.risk_level === 'medium'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {v.risk_level}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block mb-0.5">Payment Terms</span>
                    <span className="font-mono font-bold text-white">{v.payment_terms}</span>
                  </div>
                </div>

                {/* Catalog Items */}
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    <Package className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Catalog Items ({(v.catalog || []).length})</span>
                  </div>
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 overflow-hidden">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-slate-900/90 text-slate-400">
                        <tr>
                          <th className="py-1.5 px-3">Item</th>
                          <th className="py-1.5 px-3 text-right">Unit Price</th>
                          <th className="py-1.5 px-3 text-right">Stock</th>
                          <th className="py-1.5 px-3 text-right">Lead Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {(v.catalog || []).map((item) => (
                          <tr key={item.id}>
                            <td className="py-2 px-3">
                              <span className="font-medium text-white block">{item.item_name}</span>
                              {item.spec && (
                                <span className="text-[10px] text-slate-500">{item.spec}</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-indigo-300">
                              {formatCurrency(item.unit_price)}
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-mono ${
                                item.stock_qty <= 5 ? 'text-amber-400 font-bold' : 'text-slate-300'
                              }`}
                            >
                              {item.stock_qty} units
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-400">
                              {item.lead_time_days}d
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-mono text-[11px]">{v.contact_email}</span>
                {v.approved ? (
                  <span className="flex items-center gap-1 font-medium text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Eligible for Award</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-medium text-rose-400">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Excluded: Vendor not approved</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
