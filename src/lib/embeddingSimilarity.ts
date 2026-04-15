/**
 * Cosine similarity computation for embedding vectors.
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

export interface EmbeddingCandidate {
  artifactId: string;
  similarity: number;
}

/**
 * Find artifacts whose embeddings exceed the similarity threshold.
 */
export function findSimilarArtifacts(
  sourceEmbedding: number[],
  candidates: Array<{ artifactId: string; embedding: number[] }>,
  threshold: number = 0.7,
): EmbeddingCandidate[] {
  const results: EmbeddingCandidate[] = [];

  for (const candidate of candidates) {
    const similarity = cosineSimilarity(sourceEmbedding, candidate.embedding);
    if (similarity > threshold) {
      results.push({
        artifactId: candidate.artifactId,
        similarity: Math.round(similarity * 100) / 100,
      });
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity);
}
