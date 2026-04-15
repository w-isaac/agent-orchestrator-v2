import * as path from 'path';

export type FileType = 'markdown' | 'typescript' | 'python' | 'javascript';

const EXTENSION_MAP: Record<string, FileType> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
};

const VALID_TYPES = new Set<string>(['markdown', 'typescript', 'python', 'javascript']);

export function detectFileType(fileName: string, override?: string): FileType {
  if (override && VALID_TYPES.has(override)) {
    return override as FileType;
  }
  const ext = path.extname(fileName).toLowerCase();
  const detected = EXTENSION_MAP[ext];
  if (!detected) {
    throw new Error(`Unsupported file extension: ${ext}`);
  }
  return detected;
}

export function isCodeType(fileType: FileType): boolean {
  return fileType !== 'markdown';
}
