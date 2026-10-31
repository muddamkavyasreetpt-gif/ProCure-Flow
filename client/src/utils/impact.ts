export interface ManualEstimate {
  handoffs: number;
  toolsCount: number;
  waitDays: number;
  label: string;
}

export const MANUAL_PROCESS_ASSUMPTIONS: Record<'auto' | 'manager' | 'finance', ManualEstimate> = {
  auto: {
    handoffs: 5,
    toolsCount: 4,
    waitDays: 1,
    label: 'Auto route (~1 day wait)'
  },
  manager: {
    handoffs: 6,
    toolsCount: 4,
    waitDays: 2,
    label: 'Manager route (~2 days wait)'
  },
  finance: {
    handoffs: 7,
    toolsCount: 4,
    waitDays: 3,
    label: 'Finance route (~3 days wait)'
  }
};

export function computeManualEstimate(route: 'auto' | 'manager' | 'finance' = 'auto'): ManualEstimate {
  return MANUAL_PROCESS_ASSUMPTIONS[route] || MANUAL_PROCESS_ASSUMPTIONS.auto;
}
