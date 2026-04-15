/**
 * Parses import/require statements from code content.
 * Returns list of import paths (unresolved).
 */

// ES module: import X from 'path', import { X } from 'path', import 'path'
const ES_IMPORT_RE = /^\s*import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/gm;

// CommonJS: require('path'), require("path")
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

// Re-export: export { X } from 'path', export * from 'path'
const REEXPORT_RE = /^\s*export\s+(?:(?:[\w*{}\s,]+)\s+from\s+)['"]([^'"]+)['"]/gm;

export function parseImports(content: string): string[] {
  const imports = new Set<string>();

  // Strip block comments and single-line comments to avoid false positives
  const stripped = stripComments(content);

  for (const re of [ES_IMPORT_RE, REQUIRE_RE, REEXPORT_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(stripped)) !== null) {
      imports.add(match[1]);
    }
  }

  return Array.from(imports);
}

function stripComments(code: string): string {
  // Remove block comments
  let result = code.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments (but not URLs like https://)
  result = result.replace(/(?<![:'"])\/\/.*$/gm, '');
  return result;
}

/**
 * Resolve an import path against known artifact paths.
 * Tries exact match, then common extensions.
 */
const EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', ''];
const INDEX_FILES = ['/index.js', '/index.ts', '/index.jsx', '/index.tsx'];

export function resolveImportPath(
  importPath: string,
  artifactPaths: string[],
  currentFilePath?: string,
): string | null {
  // If it's a bare module (no . or / prefix), skip resolution
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null;
  }

  // Resolve relative path against current file
  let basePath = importPath;
  if (currentFilePath && importPath.startsWith('.')) {
    const dir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
    basePath = normalizePath(dir + '/' + importPath);
  }

  const pathSet = new Set(artifactPaths);

  // Try exact match
  if (pathSet.has(basePath)) return basePath;

  // Try with extensions
  for (const ext of EXTENSIONS) {
    const candidate = basePath + ext;
    if (pathSet.has(candidate)) return candidate;
  }

  // Try index files (directory import)
  for (const idx of INDEX_FILES) {
    const candidate = basePath + idx;
    if (pathSet.has(candidate)) return candidate;
  }

  return null;
}

function normalizePath(p: string): string {
  const parts = p.split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      stack.pop();
    } else if (part !== '.' && part !== '') {
      stack.push(part);
    }
  }
  return '/' + stack.join('/');
}
