/**
 * Token counter using a simple whitespace/punctuation approximation.
 * Uses ~0.75 words per token ratio (common for cl100k_base).
 * For production, swap in gpt-tokenizer when installed.
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  // Approximate cl100k_base: split on whitespace and punctuation boundaries
  const tokens = text.match(/\S+/g);
  if (!tokens) return 0;
  // Rough approximation: ~1.3 tokens per whitespace-delimited word
  return Math.ceil(tokens.length * 1.3);
}
