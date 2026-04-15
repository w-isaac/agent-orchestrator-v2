/**
 * PDF Parser: Extracts logical sections from PDF content.
 * Uses heading-based splitting with page-break fallback.
 */

import { hashContent } from './hashUtil';
import { countTokens } from './tokenCounter';

export interface ParsedSection {
  unitIndex: number;
  title: string;
  content: string;
  summary: string;
  tokenCount: number;
  contentHash: string;
  metadata: Record<string, unknown>;
}

// Heading patterns: markdown-style headers, ALL CAPS lines, numbered sections
const HEADING_PATTERNS = [
  /^#{1,6}\s+(.+)$/m,                    // Markdown headers
  /^([A-Z][A-Z\s]{4,})$/m,               // ALL CAPS lines (min 5 chars)
  /^(\d+\.[\d.]*\s+.+)$/m,               // Numbered sections (1. or 1.2.3)
  /^(Chapter\s+\d+[:.]\s*.*)$/im,        // Chapter headers
  /^(Section\s+\d+[:.]\s*.*)$/im,        // Section headers
];

const PAGE_BREAK = /\f|---PAGE\s*BREAK---|={3,}|_{3,}/;

/**
 * Parse PDF text content into logical sections.
 * Falls back to page-break splitting if no headings are detected.
 */
export function parsePdfContent(text: string, fileName: string): ParsedSection[] {
  if (!text || !text.trim()) {
    return [];
  }

  const lines = text.split('\n');
  const sections = splitByHeadings(lines);

  // Fallback: if no headings found, split by page breaks
  if (sections.length <= 1) {
    const pageSections = splitByPageBreaks(text);
    if (pageSections.length > 1) {
      return pageSections.map((section, idx) => buildSection(idx, section.title, section.content));
    }
  }

  // If still just one section, return the whole document as a single section
  if (sections.length === 0) {
    return [buildSection(0, fileName, text)];
  }

  return sections.map((section, idx) => buildSection(idx, section.title, section.content));
}

function splitByHeadings(lines: string[]): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string; startLine: number }> = [];
  let currentTitle = '';
  let currentLines: string[] = [];
  let headingFound = false;

  for (const line of lines) {
    let isHeading = false;
    let headingText = '';

    for (const pattern of HEADING_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        isHeading = true;
        headingText = match[1].trim();
        break;
      }
    }

    if (isHeading) {
      headingFound = true;
      // Save previous section if it has content
      if (currentLines.length > 0) {
        const content = currentLines.join('\n').trim();
        if (content) {
          sections.push({ title: currentTitle || 'Untitled', content, startLine: 0 });
        }
      }
      currentTitle = headingText;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // If no headings were found, return empty to trigger fallback
  if (!headingFound) {
    return [];
  }

  // Save last section
  if (currentLines.length > 0) {
    const content = currentLines.join('\n').trim();
    if (content) {
      sections.push({ title: currentTitle || 'Untitled', content, startLine: 0 });
    }
  }

  return sections;
}

function splitByPageBreaks(text: string): Array<{ title: string; content: string }> {
  const pages = text.split(PAGE_BREAK).map(p => p.trim()).filter(Boolean);
  return pages.map((page, idx) => ({
    title: `Page ${idx + 1}`,
    content: page,
  }));
}

function buildSection(unitIndex: number, title: string, content: string): ParsedSection {
  const tokenCount = countTokens(content);
  const summary = generateSummary(content, title);
  return {
    unitIndex,
    title,
    content,
    summary,
    tokenCount,
    contentHash: hashContent(content),
    metadata: { type: 'pdf_section', title },
  };
}

function generateSummary(content: string, title: string): string {
  // Take first ~200 chars as a summary approximation
  const firstChunk = content.slice(0, 200).trim();
  const ellipsis = content.length > 200 ? '...' : '';
  return `${title}: ${firstChunk}${ellipsis}`;
}
