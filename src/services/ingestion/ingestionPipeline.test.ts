import { describe, it, expect } from 'vitest';
import { runIngestionPipeline, IngestionInput } from './ingestionPipeline';

describe('ingestionPipeline', () => {
  describe('PDF ingestion', () => {
    it('extracts sections from PDF content', () => {
      const input: IngestionInput = {
        fileType: 'pdf',
        content: '# Intro\nIntro text.\n# Methods\nMethod text.\n# Results\nResult text.',
      };

      const result = runIngestionPipeline('file-1', 'paper.pdf', input);

      expect(result.fileId).toBe('file-1');
      expect(result.fileName).toBe('paper.pdf');
      expect(result.fileType).toBe('pdf');
      expect(result.units).toHaveLength(3);
      expect(result.units[0].unitType).toBe('pdf_section');
      expect(result.unitCounts.total).toBe(3);
      expect(result.unitCounts.successful).toBe(3);
      expect(result.unitCounts.failed).toBe(0);
    });

    it('handles empty PDF content', () => {
      const input: IngestionInput = { fileType: 'pdf', content: '' };
      const result = runIngestionPipeline('file-2', 'empty.pdf', input);

      expect(result.units).toHaveLength(0);
      expect(result.unitCounts.total).toBe(0);
    });
  });

  describe('Spreadsheet ingestion', () => {
    it('extracts sheets from spreadsheet data', () => {
      const input: IngestionInput = {
        fileType: 'spreadsheet',
        content: '',
        sheets: [
          { name: 'Sheet1', headers: ['a', 'b'], rows: [['1', '2']] },
          { name: 'Sheet2', headers: ['x', 'y'], rows: [['3', '4']] },
        ],
      };

      const result = runIngestionPipeline('file-3', 'data.xlsx', input);

      expect(result.units).toHaveLength(2);
      expect(result.units[0].unitType).toBe('spreadsheet_sheet');
      expect(result.units[0].title).toBe('Sheet1');
      expect(result.units[1].title).toBe('Sheet2');
      expect(result.unitCounts.total).toBe(2);
    });

    it('falls back to CSV parsing when no sheets provided', () => {
      const input: IngestionInput = {
        fileType: 'spreadsheet',
        content: 'name,age\nAlice,30\nBob,25',
      };

      const result = runIngestionPipeline('file-4', 'data.csv', input);

      expect(result.units).toHaveLength(1);
      expect(result.units[0].unitType).toBe('spreadsheet_sheet');
    });
  });

  describe('Design file ingestion', () => {
    it('extracts components from provided component list', () => {
      const input: IngestionInput = {
        fileType: 'design',
        content: '',
        components: [
          { name: 'Button', type: 'component', description: 'A button', properties: {} },
          { name: 'Card', type: 'component', description: 'A card', properties: {} },
        ],
      };

      const result = runIngestionPipeline('file-5', 'design.fig', input);

      expect(result.units).toHaveLength(2);
      expect(result.units[0].unitType).toBe('design_component');
      expect(result.units[0].title).toBe('Button');
    });

    it('extracts components from SVG content', () => {
      const svg = '<svg><g id="nav"><rect/></g><g id="main"><rect/></g></svg>';
      const input: IngestionInput = { fileType: 'design', content: svg };

      const result = runIngestionPipeline('file-6', 'layout.svg', input);

      expect(result.units).toHaveLength(2);
      expect(result.units[0].unitType).toBe('design_component');
    });

    it('extracts components from Figma JSON', () => {
      const figmaJson = JSON.stringify({
        components: {
          'c1': { name: 'Header', type: 'COMPONENT', description: 'Header component' },
        },
      });
      const input: IngestionInput = { fileType: 'design', content: figmaJson };

      const result = runIngestionPipeline('file-7', 'design.fig', input);

      expect(result.units).toHaveLength(1);
      expect(result.units[0].title).toBe('Header');
    });
  });

  describe('Error isolation', () => {
    it('reports per-file counts', () => {
      const input: IngestionInput = {
        fileType: 'pdf',
        content: '# A\nText\n# B\nText',
      };

      const result = runIngestionPipeline('file-8', 'test.pdf', input);

      expect(result.unitCounts).toEqual({
        total: 2,
        successful: 2,
        failed: 0,
      });
    });
  });
});
