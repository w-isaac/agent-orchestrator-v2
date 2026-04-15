import * as path from 'path';

export type FileType = 'markdown' | 'typescript' | 'python' | 'javascript' | 'pdf' | 'spreadsheet' | 'design';

const EXTENSION_MAP: Record<string, FileType> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.pdf': 'pdf',
  '.xlsx': 'spreadsheet',
  '.xls': 'spreadsheet',
  '.csv': 'spreadsheet',
  '.fig': 'design',
  '.sketch': 'design',
  '.svg': 'design',
};

const VALID_TYPES = new Set<string>(['markdown', 'typescript', 'python', 'javascript', 'pdf', 'spreadsheet', 'design']);

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
  return fileType !== 'markdown' && fileType !== 'pdf' && fileType !== 'spreadsheet' && fileType !== 'design';
}

export function isStructuredType(fileType: FileType): boolean {
  return fileType === 'pdf' || fileType === 'spreadsheet' || fileType === 'design';
}
