/**
 * Resolves parent directory artifact from an artifact's file path.
 */

export function getParentPath(filePath: string): string | null {
  if (!filePath || filePath === '/') return null;

  // Normalize: remove trailing slash
  const normalized = filePath.replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash <= 0) return null; // root-level artifact

  return normalized.substring(0, lastSlash);
}

/**
 * Find a parent directory artifact ID from known artifact paths.
 */
export function resolveParentArtifact(
  filePath: string,
  artifactPathMap: Map<string, string>, // path -> artifactId
): { parentPath: string; parentId: string } | null {
  const parentPath = getParentPath(filePath);
  if (!parentPath) return null;

  const parentId = artifactPathMap.get(parentPath);
  if (parentId) {
    return { parentPath, parentId };
  }

  return null;
}
