/**
 * Server-side token estimation for adapter routing threshold checks.
 * Uses a fast heuristic (chars/4) — accurate enough for the 100K routing threshold.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
