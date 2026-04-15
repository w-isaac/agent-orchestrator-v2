export { selectAgent, recordOutcome } from './routingEngine';
export type { RoutingDecision, RoutingCandidate } from './routingEngine';
export { updateStats, refreshRollingWindows } from './performanceTracker';
export { selectAdapter } from './adapterRouter';
export type { AdapterRoutingResult } from './adapterRouter';
export { estimateTokens } from './tokenCounter';
