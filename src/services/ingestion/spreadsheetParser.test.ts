import { describe, it, expect } from 'vitest';
import { parseSpreadsheetContent, parseCsvContent, SheetData } from './spreadsheetParser';

describe('spreadsheetParser', () => {
  describe('parseSpreadsheetContent', () => {
    it('extracts per-sheet units with schema summaries', () => {
      const sheets: SheetData[] = [
        {
          name: 'Users',
          headers: ['id', 'name', 'email', 'age'],
          rows: [
            ['1', 'Alice', 'alice@example.com', '30'],
            ['2', 'Bob', 'bob@example.com', '25'],
            ['3', 'Carol', 'carol@example.com', '35'],
          ],
        },
        {
          name: 'Orders',
          headers: ['order_id', 'user_id', 'total', 'date'],
          rows: [
            ['101', '1', '49.99', '2024-01-15'],
            ['102', '2', '29.99', '2024-01-16'],
          ],
        },
      ];

      const result = parseSpreadsheetContent(sheets);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Users');
      expect(result[0].summary).toContain('3 rows');
      expect(result[0].summary).toContain('4 columns');
      expect(result[0].metadata).toHaveProperty('rowCount', 3);
      expect(result[0].metadata).toHaveProperty('columnCount', 4);

      expect(result[1].title).toBe('Orders');
      expect(result[1].summary).toContain('2 rows');
    });

    it('infers column types correctly', () => {
      const sheets: SheetData[] = [
        {
          name: 'TypeTest',
          headers: ['count', 'name', 'active', 'created'],
          rows: [
            ['10', 'Alice', 'true', '2024-01-01'],
            ['20', 'Bob', 'false', '2024-02-01'],
            ['30', 'Carol', 'true', '2024-03-01'],
          ],
        },
      ];

      const result = parseSpreadsheetContent(sheets);
      const schema = result[0].metadata.schema as Array<{ name: string; inferredType: string }>;

      expect(schema[0].inferredType).toBe('numeric');
      expect(schema[1].inferredType).toBe('text');
      expect(schema[2].inferredType).toBe('boolean');
      expect(schema[3].inferredType).toBe('date');
    });

    it('returns empty array for empty input', () => {
      expect(parseSpreadsheetContent([])).toHaveLength(0);
    });

    it('assigns sequential unit indices', () => {
      const sheets: SheetData[] = [
        { name: 'A', headers: ['x'], rows: [['1']] },
        { name: 'B', headers: ['y'], rows: [['2']] },
        { name: 'C', headers: ['z'], rows: [['3']] },
      ];

      const result = parseSpreadsheetContent(sheets);
      expect(result.map(r => r.unitIndex)).toEqual([0, 1, 2]);
    });
  });

  describe('parseCsvContent', () => {
    it('parses basic CSV into SheetData', () => {
      const csv = 'name,age,city\nAlice,30,NYC\nBob,25,LA';

      const result = parseCsvContent(csv);

      expect(result.name).toBe('Sheet1');
      expect(result.headers).toEqual(['name', 'age', 'city']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(['Alice', '30', 'NYC']);
    });

    it('handles quoted fields with commas', () => {
      const csv = 'name,description\nAlice,"Hello, World"\nBob,"Foo, Bar"';

      const result = parseCsvContent(csv);

      expect(result.rows[0][1]).toBe('Hello, World');
      expect(result.rows[1][1]).toBe('Foo, Bar');
    });

    it('handles empty CSV', () => {
      const result = parseCsvContent('');

      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    it('uses custom sheet name', () => {
      const result = parseCsvContent('a,b\n1,2', 'MySheet');
      expect(result.name).toBe('MySheet');
    });
  });
});
