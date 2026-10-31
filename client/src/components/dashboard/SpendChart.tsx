import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';
import { formatCurrency } from '../../utils/format';

interface SpendChartProps {
  departments: Array<{
    name: string;
    budgetTotal: number;
    reservedAmount: number;
    spentAmount?: number;
    available: number;
  }>;
}

export const SpendChart: React.FC<SpendChartProps> = ({ departments }) => {
  const data = (departments || []).map((d) => ({
    name: d.name,
    Total: Number(d.budgetTotal || 0),
    Spent: Number(d.spentAmount || 0) + Number(d.reservedAmount || 0),
    Available: Number(d.available || 0)
  }));

  const formatYAxis = (v: number) => {
    if (v >= 100000) {
      return `₹${(v / 100000).toFixed(0)}L`;
    }
    if (v >= 1000) {
      return `₹${(v / 1000).toFixed(0)}k`;
    }
    return `₹${v}`;
  };

  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-800 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-white mb-1">
        Department Budget Allocation (FY 2026, INR ₹)
      </h3>
      <p className="text-xs text-slate-400 mb-4">
        Total allocation vs spent &amp; reserved funds across departments
      </p>

      <div className="flex-1 min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <XAxis
              dataKey="name"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatYAxis}
            />
            <Tooltip
              formatter={(val: number) => [formatCurrency(val), '']}
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#1e293b',
                borderRadius: '0.75rem',
                fontSize: '12px'
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
            <Bar dataKey="Total" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Spent" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Available" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
