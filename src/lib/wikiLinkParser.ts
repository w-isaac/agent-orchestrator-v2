/**
 * Extracts wiki-style links [[PageName]] from markdown content.
 */

const WIKI_LINK_RE = /\[\[([^\[\]]+)\]\]/g;

export function parseWikiLinks(content: string): string[] {
  const links = new Set<string>();
  let match: RegExpExecArray | null;

  WIKI_LINK_RE.lastIndex = 0;
  while ((match = WIKI_LINK_RE.exec(content)) !== null) {
    const target = match[1].trim();
    if (target.length > 0) {
      links.add(target);
    }
  }

  return Array.from(links);
}
