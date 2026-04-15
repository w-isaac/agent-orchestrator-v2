/**
 * Spreadsheet Parser: Extracts per-sheet data with schema summaries.
 * Analyzes column names, inferred types, and row counts.
 */

import { hashContent } from './hashUtil';
import { countTokens } from './tokenCounter';

export interface SheetData {
  name: string;
  headers: string[];
  rows: string[][];
}

export interface ParsedSheet {
  unitIndex: number;
  title: string;
  content: string;
  summary: string;
  tokenCount: number;
  contentHash: string;
  metadata: Record<string, unknown>;
}

export interface ColumnSchema {
  name: string;
  inferredType: string;
  sampleValues: string[];
}

/**
 * Parse spreadsheet data (array of sheets) into discrete parsed units.
 */
export function parseSpreadsheetContent(sheets: SheetData[]): ParsedSheet[] {
  if (!sheets || sheets.length === 0) {
    return [];
  }

  return sheets.map((sheet, idx) => buildSheetUnit(idx, sheet));
}

/**
 * Parse CSV content into a single-sheet representation.
 */
export function parseCsvContent(csvText: string, sheetName: string = 'Sheet1'): SheetData {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { name: sheetName, headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);

  return { name: sheetName, headers, rows };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function inferColumnType(values: string[]): string {
  const nonEmpty = values.filter(v => v !== '' && v !== null && v !== undefined);
  if (nonEmpty.length === 0) return 'empty';

  const sampleSize = Math.min(nonEmpty.length, 20);
  const sample = nonEmpty.slice(0, sampleSize);

  let numericCount = 0;
  let dateCount = 0;
  let boolCount = 0;

  for (const val of sample) {
    if (!isNaN(Number(val)) && val.trim() !== '') {
      numericCount++;
    } else if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(val) || /^\d{2}[-/]\d{2}[-/]\d{4}/.test(val)) {
      dateCount++;
    } else if (/^(true|false|yes|no|0|1)$/i.test(val.trim())) {
      boolCount++;
    }
  }

  const threshold = sampleSize * 0.7;
  if (numericCount >= threshold) return 'numeric';
  if (dateCount >= threshold) return 'date';
  if (boolCount >= threshold) return 'boolean';
  return 'text';
}

function buildSchemaColumns(sheet: SheetData): ColumnSchema[] {
  return sheet.headers.map((header, colIdx) => {
    const columnValues = sheet.rows.map(row => row[colIdx] || '');
    const inferredType = inferColumnType(columnValues);
    const sampleValues = columnValues.filter(v => v).slice(0, 3);
    return { name: header, inferredType, sampleValues };
  });
}

function buildSheetUnit(unitIndex: number, sheet: SheetData): ParsedSheet {
  const schema = buildSchemaColumns(sheet);
  const rowCount = sheet.rows.length;

  const schemaDescription = schema
    .map(col => `${col.name} (${col.inferredType})`)
    .join(', ');

  const summary = `Sheet "${sheet.name}": ${rowCount} rows, ${schema.length} columns — ${schemaDescription}`;

  // Content includes a preview of the data
  const previewRows = sheet.rows.slice(0, 5);
  const contentLines = [
    `Sheet: ${sheet.name}`,
    `Columns: ${sheet.headers.join(', ')}`,
    `Row count: ${rowCount}`,
    '',
    'Schema:',
    ...schema.map(col => `  - ${col.name}: ${col.inferredType} (samples: ${col.sampleValues.join(', ')})`),
    '',
    'Preview (first 5 rows):',
    ...previewRows.map(row => row.join('\t')),
  ];
  const content = contentLines.join('\n');

  return {
    unitIndex,
    title: sheet.name,
    content,
    summary,
    tokenCount: countTokens(content),
    contentHash: hashContent(content),
    metadata: {
      type: 'spreadsheet_sheet',
      sheetName: sheet.name,
      rowCount,
      columnCount: schema.length,
      schema,
    },
  };
}
