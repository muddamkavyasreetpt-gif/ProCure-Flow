import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

interface OutcomeDonutProps {
  distribution: Record<string, number>;
}

export const OutcomeDonut: React.FC<OutcomeDonutProps> = ({ distribution }) => {
  const data = [
    { name: 'Completed', value: distribution['completed'] || 0, color: '#10b981' },
    { name: 'Awaiting Approval', value: distribution['awaiting_approval'] || 0, color: '#f59e0b' },
    { name: 'Processing', value: distribution['processing'] || distribution['running'] || 0, color: '#6366f1' },
    { name: 'Rejected', value: distribution['rejected'] || 0, color: '#f43f5e' },
    { name: 'Failed', value: distribution['failed'] || 0, color: '#ef4444' }
  ].filter((d) => d.value > 0);

  const displayData = data.length > 0 ? data : [{ name: 'No Requests Yet', value: 1, color: '#334155' }];

  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-800 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-white mb-1">Resolution Breakdown</h3>
      <p className="text-xs text-slate-400 mb-4">Autonomous vs escalated outcomes</p>

      <div className="flex-1 min-h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={displayData}
              innerRadius={55}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
            >
              {displayData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#1e293b',
                borderRadius: '0.75rem',
                fontSize: '12px'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 mt-2 text-xs">
        {displayData.map((item) => (
          <div key={item.name} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-slate-300 font-medium">{item.name}</span>
            <span className="text-slate-500 font-mono">({item.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
};
