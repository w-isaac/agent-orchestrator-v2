/**
 * Design File Parser: Extracts per-component data from design files.
 * Supports Figma JSON, Sketch manifests, and SVG element extraction.
 */

import { hashContent } from './hashUtil';
import { countTokens } from './tokenCounter';

export interface DesignComponent {
  name: string;
  type: string;
  description: string;
  properties: Record<string, unknown>;
}

export interface ParsedComponent {
  unitIndex: number;
  title: string;
  content: string;
  summary: string;
  tokenCount: number;
  contentHash: string;
  metadata: Record<string, unknown>;
}

/**
 * Parse design file content into per-component units.
 * Accepts either a structured component array or raw text for SVG extraction.
 */
export function parseDesignComponents(components: DesignComponent[]): ParsedComponent[] {
  if (!components || components.length === 0) {
    return [];
  }

  return components.map((comp, idx) => buildComponentUnit(idx, comp));
}

/**
 * Extract components from SVG content by parsing top-level groups and named elements.
 */
export function extractSvgComponents(svgContent: string): DesignComponent[] {
  const components: DesignComponent[] = [];

  // Match <g> groups with id or class
  const groupPattern = /<g[^>]*(?:id="([^"]+)"|class="([^"]+)")[^>]*>([\s\S]*?)<\/g>/gi;
  let match: RegExpExecArray | null;

  while ((match = groupPattern.exec(svgContent)) !== null) {
    const name = match[1] || match[2] || `group-${components.length}`;
    const innerContent = match[3] || '';
    components.push({
      name,
      type: 'svg_group',
      description: `SVG group "${name}" with ${countChildElements(innerContent)} child elements`,
      properties: { elementCount: countChildElements(innerContent) },
    });
  }

  // Match named <symbol> elements
  const symbolPattern = /<symbol[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/gi;
  while ((match = symbolPattern.exec(svgContent)) !== null) {
    const name = match[1];
    const innerContent = match[2] || '';
    components.push({
      name,
      type: 'svg_symbol',
      description: `SVG symbol "${name}" with ${countChildElements(innerContent)} child elements`,
      properties: { elementCount: countChildElements(innerContent) },
    });
  }

  // If no groups or symbols found, treat the entire SVG as one component
  if (components.length === 0 && svgContent.trim()) {
    components.push({
      name: 'root',
      type: 'svg_root',
      description: `SVG document with ${countChildElements(svgContent)} top-level elements`,
      properties: { elementCount: countChildElements(svgContent) },
    });
  }

  return components;
}

/**
 * Extract components from a Figma-style JSON structure.
 * Expects { document: { children: [...] } } or { components: {...} } format.
 */
export function extractFigmaComponents(data: Record<string, unknown>): DesignComponent[] {
  const components: DesignComponent[] = [];

  // Try components map first
  if (data.components && typeof data.components === 'object') {
    const compMap = data.components as Record<string, Record<string, unknown>>;
    for (const [id, comp] of Object.entries(compMap)) {
      components.push({
        name: (comp.name as string) || id,
        type: (comp.type as string) || 'component',
        description: (comp.description as string) || `Component ${comp.name || id}`,
        properties: comp,
      });
    }
  }

  // Traverse document children for COMPONENT nodes
  if (data.document && typeof data.document === 'object') {
    const doc = data.document as Record<string, unknown>;
    traverseFigmaNodes(doc, components);
  }

  return components;
}

function traverseFigmaNodes(node: Record<string, unknown>, components: DesignComponent[]): void {
  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    const name = (node.name as string) || 'unnamed';
    // Avoid duplicates
    if (!components.some(c => c.name === name)) {
      components.push({
        name,
        type: (node.type as string).toLowerCase(),
        description: (node.description as string) || `${node.type} "${name}"`,
        properties: {
          absoluteBoundingBox: node.absoluteBoundingBox,
          constraints: node.constraints,
        },
      });
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (typeof child === 'object' && child !== null) {
        traverseFigmaNodes(child as Record<string, unknown>, components);
      }
    }
  }
}

function countChildElements(content: string): number {
  const tags = content.match(/<[a-z][^/]*?>/gi);
  return tags ? tags.length : 0;
}

function buildComponentUnit(unitIndex: number, component: DesignComponent): ParsedComponent {
  const contentLines = [
    `Component: ${component.name}`,
    `Type: ${component.type}`,
    `Description: ${component.description}`,
    '',
    'Properties:',
    JSON.stringify(component.properties, null, 2),
  ];
  const content = contentLines.join('\n');
  const summary = `${component.type} "${component.name}": ${component.description}`;

  return {
    unitIndex,
    title: component.name,
    content,
    summary,
    tokenCount: countTokens(content),
    contentHash: hashContent(content),
    metadata: {
      type: 'design_component',
      componentName: component.name,
      componentType: component.type,
    },
  };
}
