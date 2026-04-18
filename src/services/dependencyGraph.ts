export interface DependencyEdge {
  story_id: string;
  depends_on_story_id: string;
}

/**
 * Detect a cycle in the dependency graph when `proposed` edges replace all
 * existing edges outgoing from `storyId`.
 * Returns the cycle path (starting and ending with storyId) if detected,
 * otherwise null.
 */
export function detectCycle(
  existingEdges: DependencyEdge[],
  storyId: string,
  proposedDependsOn: string[],
): string[] | null {
  const adj = new Map<string, Set<string>>();
  for (const edge of existingEdges) {
    if (edge.story_id === storyId) continue;
    if (!adj.has(edge.story_id)) adj.set(edge.story_id, new Set());
    adj.get(edge.story_id)!.add(edge.depends_on_story_id);
  }
  const outgoing = new Set<string>();
  for (const dep of proposedDependsOn) {
    if (dep === storyId) return [storyId, storyId];
    outgoing.add(dep);
  }
  adj.set(storyId, outgoing);

  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): string[] | null {
    if (stack.has(node)) {
      const idx = path.indexOf(node);
      return path.slice(idx).concat(node);
    }
    if (visited.has(node)) return null;
    visited.add(node);
    stack.add(node);
    path.push(node);
    const neighbors = adj.get(node);
    if (neighbors) {
      for (const next of neighbors) {
        const cycle = dfs(next);
        if (cycle) return cycle;
      }
    }
    stack.delete(node);
    path.pop();
    return null;
  }

  return dfs(storyId);
}
