import { describe, it, expect } from 'vitest';
import { parsePdfContent } from './pdfParser';

describe('pdfParser', () => {
  it('splits content by markdown-style headings', () => {
    const text = [
      '# Introduction',
      'This is the intro.',
      '## Background',
      'Some background info.',
      '## Methods',
      'Methodology here.',
    ].join('\n');

    const sections = parsePdfContent(text, 'test.pdf');

    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe('Introduction');
    expect(sections[0].content).toContain('intro');
    expect(sections[1].title).toBe('Background');
    expect(sections[2].title).toBe('Methods');
  });

  it('splits content by numbered sections', () => {
    const text = [
      '1. Overview',
      'Overview content here.',
      '2. Details',
      'Detail content here.',
      '3. Conclusion',
      'Conclusion content.',
    ].join('\n');

    const sections = parsePdfContent(text, 'test.pdf');

    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe('1. Overview');
    expect(sections[1].title).toBe('2. Details');
    expect(sections[2].title).toBe('3. Conclusion');
  });

  it('falls back to page breaks when no headings found', () => {
    const text = [
      'Page one content here.',
      '\f',
      'Page two content here.',
      '\f',
      'Page three content here.',
    ].join('\n');

    const sections = parsePdfContent(text, 'test.pdf');

    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe('Page 1');
    expect(sections[1].title).toBe('Page 2');
    expect(sections[2].title).toBe('Page 3');
  });

  it('returns single section for plain text without structure', () => {
    const text = 'Just a plain paragraph of text without any headings or breaks.';

    const sections = parsePdfContent(text, 'document.pdf');

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('document.pdf');
    expect(sections[0].content).toBe(text);
  });

  it('returns empty array for empty content', () => {
    expect(parsePdfContent('', 'test.pdf')).toHaveLength(0);
    expect(parsePdfContent('   ', 'test.pdf')).toHaveLength(0);
  });

  it('generates summaries and hashes for each section', () => {
    const text = '# Section A\nContent A.\n# Section B\nContent B.';
    const sections = parsePdfContent(text, 'test.pdf');

    for (const section of sections) {
      expect(section.summary).toBeTruthy();
      expect(section.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(section.tokenCount).toBeGreaterThan(0);
    }
  });

  it('assigns sequential unit indices', () => {
    const text = '# A\nText\n# B\nText\n# C\nText';
    const sections = parsePdfContent(text, 'test.pdf');

    expect(sections.map(s => s.unitIndex)).toEqual([0, 1, 2]);
  });
});
