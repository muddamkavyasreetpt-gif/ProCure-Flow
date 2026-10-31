import React from 'react';
import { StepCard } from './StepCard';
import { AgentStep } from '../../types';
import { Spinner } from '../shared/Spinner';

interface AgentTimelineProps {
  steps: AgentStep[];
  isStreaming?: boolean;
}

export const AgentTimeline: React.FC<AgentTimelineProps> = ({ steps, isStreaming }) => {
  return (
    <div className="space-y-4 relative">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">Live Execution Sequence</h3>
        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-indigo-400">
            <Spinner size="sm" />
            <span>Agent Active</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {steps.map((step, idx) => (
          <div key={step.id || idx} className="relative">
            <StepCard step={step} />
          </div>
        ))}
      </div>
    </div>
  );
};
