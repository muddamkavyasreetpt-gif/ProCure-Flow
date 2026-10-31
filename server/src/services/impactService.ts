import { ApprovalRoute } from '../guardrails';

export interface ManualEstimate {
  handoffs: number;
  toolsCount: number;
  waitDays: number;
  label: string;
}

export const MANUAL_PROCESS_ASSUMPTIONS: Record<ApprovalRoute, ManualEstimate> = {
  auto: {
    handoffs: 5,
    toolsCount: 4,
    waitDays: 1,
    label: 'Auto Route (~1 day wait)'
  },
  manager: {
    handoffs: 6,
    toolsCount: 4,
    waitDays: 2,
    label: 'Manager Route (~2 days wait)'
  },
  finance: {
    handoffs: 7,
    toolsCount: 4,
    waitDays: 3,
    label: 'Finance Route (~3 days wait)'
  }
};

export function computeManualEstimate(route: ApprovalRoute = 'auto'): ManualEstimate {
  return MANUAL_PROCESS_ASSUMPTIONS[route] || MANUAL_PROCESS_ASSUMPTIONS.auto;
}
