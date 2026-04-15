import { describe, it, expect } from 'vitest';
import { parseDesignComponents, extractSvgComponents, extractFigmaComponents, DesignComponent } from './designFileParser';

describe('designFileParser', () => {
  describe('parseDesignComponents', () => {
    it('converts components to parsed units', () => {
      const components: DesignComponent[] = [
        { name: 'Button', type: 'component', description: 'Primary action button', properties: { variant: 'primary' } },
        { name: 'Card', type: 'component', description: 'Content card container', properties: { padding: 16 } },
      ];

      const result = parseDesignComponents(components);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Button');
      expect(result[0].summary).toContain('Primary action button');
      expect(result[1].title).toBe('Card');
    });

    it('returns empty for empty input', () => {
      expect(parseDesignComponents([])).toHaveLength(0);
    });

    it('generates hashes and token counts', () => {
      const components: DesignComponent[] = [
        { name: 'Icon', type: 'svg', description: 'App icon', properties: {} },
      ];

      const result = parseDesignComponents(components);
      expect(result[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result[0].tokenCount).toBeGreaterThan(0);
    });
  });

  describe('extractSvgComponents', () => {
    it('extracts named groups from SVG', () => {
      const svg = `<svg>
        <g id="header"><rect width="100" height="50"/></g>
        <g id="footer"><rect width="100" height="30"/></g>
      </svg>`;

      const components = extractSvgComponents(svg);

      expect(components).toHaveLength(2);
      expect(components[0].name).toBe('header');
      expect(components[1].name).toBe('footer');
    });

    it('extracts symbol elements', () => {
      const svg = `<svg>
        <symbol id="icon-home"><path d="M0 0"/></symbol>
        <symbol id="icon-settings"><circle r="5"/></symbol>
      </svg>`;

      const components = extractSvgComponents(svg);

      expect(components).toHaveLength(2);
      expect(components[0].name).toBe('icon-home');
      expect(components[0].type).toBe('svg_symbol');
    });

    it('falls back to root for bare SVG', () => {
      const svg = '<svg><rect width="100" height="100"/></svg>';

      const components = extractSvgComponents(svg);

      expect(components).toHaveLength(1);
      expect(components[0].type).toBe('svg_root');
    });
  });

  describe('extractFigmaComponents', () => {
    it('extracts from components map', () => {
      const data = {
        components: {
          'comp-1': { name: 'Button', type: 'COMPONENT', description: 'A button' },
          'comp-2': { name: 'Input', type: 'COMPONENT', description: 'An input field' },
        },
      };

      const components = extractFigmaComponents(data);

      expect(components).toHaveLength(2);
      expect(components[0].name).toBe('Button');
      expect(components[1].name).toBe('Input');
    });

    it('traverses document tree for COMPONENT nodes', () => {
      const data = {
        document: {
          type: 'DOCUMENT',
          children: [
            {
              type: 'CANVAS',
              name: 'Page 1',
              children: [
                { type: 'COMPONENT', name: 'Header', description: 'Page header' },
                { type: 'FRAME', name: 'Container', children: [
                  { type: 'COMPONENT', name: 'Footer', description: 'Page footer' },
                ] },
              ],
            },
          ],
        },
      };

      const components = extractFigmaComponents(data);

      expect(components).toHaveLength(2);
      expect(components.map(c => c.name)).toContain('Header');
      expect(components.map(c => c.name)).toContain('Footer');
    });

    it('returns empty for empty data', () => {
      expect(extractFigmaComponents({})).toHaveLength(0);
    });
  });
});
