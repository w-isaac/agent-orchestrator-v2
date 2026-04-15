/**
 * Ingestion Pipeline: Orchestrates section-based parsing for PDFs,
 * spreadsheets, and design files. Creates parsed_units and links
 * them to the context graph.
 */

import { parsePdfContent, ParsedSection } from './pdfParser';
import { parseSpreadsheetContent, parseCsvContent, SheetData, ParsedSheet } from './spreadsheetParser';
import { parseDesignComponents, extractSvgComponents, extractFigmaComponents, ParsedComponent, DesignComponent } from './designFileParser';
import { FileType } from './fileTypeDetector';

export interface ParsedUnit {
  unitIndex: number;
  unitType: 'pdf_section' | 'spreadsheet_sheet' | 'design_component';
  title: string;
  content: string;
  summary: string;
  tokenCount: number;
  contentHash: string;
  metadata: Record<string, unknown>;
}

export interface IngestionResult {
  fileId: string;
  fileName: string;
  fileType: FileType;
  units: ParsedUnit[];
  errors: IngestionError[];
  unitCounts: {
    total: number;
    successful: number;
    failed: number;
  };
}

export interface IngestionError {
  unitIndex: number;
  title: string;
  error: string;
}

interface PdfIngestionInput {
  fileType: 'pdf';
  content: string;
}

interface SpreadsheetIngestionInput {
  fileType: 'spreadsheet';
  content: string;
  sheets?: SheetData[];
}

interface DesignIngestionInput {
  fileType: 'design';
  content: string;
  components?: DesignComponent[];
}

export type IngestionInput = PdfIngestionInput | SpreadsheetIngestionInput | DesignIngestionInput;

/**
 * Run the ingestion pipeline for a structured file.
 * Each unit is parsed independently — individual failures are isolated.
 */
export function runIngestionPipeline(
  fileId: string,
  fileName: string,
  input: IngestionInput,
): IngestionResult {
  const units: ParsedUnit[] = [];
  const errors: IngestionError[] = [];

  let rawUnits: Array<{ unitIndex: number; title: string; content: string; summary: string; tokenCount: number; contentHash: string; metadata: Record<string, unknown> }> = [];

  try {
    switch (input.fileType) {
      case 'pdf':
        rawUnits = parsePdfSections(input.content, fileName);
        break;
      case 'spreadsheet':
        rawUnits = parseSpreadsheetSheets(input);
        break;
      case 'design':
        rawUnits = parseDesignParts(input);
        break;
    }
  } catch (err) {
    errors.push({
      unitIndex: -1,
      title: fileName,
      error: `File-level parse error: ${(err as Error).message}`,
    });
  }

  // Process each raw unit independently
  for (const raw of rawUnits) {
    try {
      const unitType = getUnitType(input.fileType);
      units.push({
        unitIndex: raw.unitIndex,
        unitType,
        title: raw.title,
        content: raw.content,
        summary: raw.summary,
        tokenCount: raw.tokenCount,
        contentHash: raw.contentHash,
        metadata: raw.metadata,
      });
    } catch (err) {
      errors.push({
        unitIndex: raw.unitIndex,
        title: raw.title,
        error: (err as Error).message,
      });
    }
  }

  return {
    fileId,
    fileName,
    fileType: input.fileType,
    units,
    errors,
    unitCounts: {
      total: rawUnits.length,
      successful: units.length,
      failed: errors.length,
    },
  };
}

function getUnitType(fileType: FileType): 'pdf_section' | 'spreadsheet_sheet' | 'design_component' {
  switch (fileType) {
    case 'pdf': return 'pdf_section';
    case 'spreadsheet': return 'spreadsheet_sheet';
    case 'design': return 'design_component';
    default: throw new Error(`Unsupported file type for unit extraction: ${fileType}`);
  }
}

function parsePdfSections(content: string, fileName: string): ParsedSection[] {
  return parsePdfContent(content, fileName);
}

function parseSpreadsheetSheets(input: SpreadsheetIngestionInput): ParsedSheet[] {
  if (input.sheets && input.sheets.length > 0) {
    return parseSpreadsheetContent(input.sheets);
  }
  // Fall back to CSV parsing
  const sheet = parseCsvContent(input.content);
  return parseSpreadsheetContent([sheet]);
}

function parseDesignParts(input: DesignIngestionInput): ParsedComponent[] {
  if (input.components && input.components.length > 0) {
    return parseDesignComponents(input.components);
  }

  // Try to detect format from content
  const content = input.content.trim();

  // Try JSON (Figma format)
  if (content.startsWith('{')) {
    try {
      const data = JSON.parse(content);
      const components = extractFigmaComponents(data);
      return parseDesignComponents(components);
    } catch {
      // Not valid JSON, continue
    }
  }

  // Try SVG
  if (content.includes('<svg') || content.includes('<SVG')) {
    const components = extractSvgComponents(content);
    return parseDesignComponents(components);
  }

  return [];
}
