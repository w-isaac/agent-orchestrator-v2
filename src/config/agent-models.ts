export interface AgentCost {
  model: string;
  pricePerInputToken: number;
  pricePerOutputToken: number;
}

// Price per token in USD (approximations based on public pricing)
export const AGENT_COSTS: Record<string, AgentCost> = {
  claude_code: {
    model: 'claude-sonnet-4-20250514',
    pricePerInputToken: 0.000003,
    pricePerOutputToken: 0.000015,
  },
  po: {
    model: 'claude-sonnet-4-20250514',
    pricePerInputToken: 0.000003,
    pricePerOutputToken: 0.000015,
  },
  design: {
    model: 'claude-sonnet-4-20250514',
    pricePerInputToken: 0.000003,
    pricePerOutputToken: 0.000015,
  },
  architect: {
    model: 'claude-sonnet-4-20250514',
    pricePerInputToken: 0.000003,
    pricePerOutputToken: 0.000015,
  },
  engineering: {
    model: 'claude-sonnet-4-20250514',
    pricePerInputToken: 0.000003,
    pricePerOutputToken: 0.000015,
  },
  qa: {
    model: 'claude-sonnet-4-20250514',
    pricePerInputToken: 0.000003,
    pricePerOutputToken: 0.000015,
  },
};

/**
 * Estimate cost in USD for a given agent role and token counts.
 */
export function estimateCost(
  agentRole: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const cost = AGENT_COSTS[agentRole] || AGENT_COSTS.claude_code;
  return cost.pricePerInputToken * inputTokens + cost.pricePerOutputToken * outputTokens;
}
