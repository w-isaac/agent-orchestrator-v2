import { describe, it, expect } from 'vitest';
import { parseWikiLinks } from './wikiLinkParser';

describe('parseWikiLinks', () => {
  it('extracts single wiki link', () => {
    expect(parseWikiLinks('See [[PageName]] for details')).toEqual(['PageName']);
  });

  it('extracts multiple wiki links', () => {
    const result = parseWikiLinks('Links: [[Foo]] and [[Bar]] and [[Baz]]');
    expect(result).toEqual(['Foo', 'Bar', 'Baz']);
  });

  it('deduplicates repeated links', () => {
    expect(parseWikiLinks('[[A]] and [[A]]')).toEqual(['A']);
  });

  it('returns empty for no links', () => {
    expect(parseWikiLinks('No links here')).toEqual([]);
  });

  it('returns empty for empty content', () => {
    expect(parseWikiLinks('')).toEqual([]);
  });

  it('ignores nested brackets', () => {
    // [[]] with nothing inside should not match
    expect(parseWikiLinks('[[]]')).toEqual([]);
  });

  it('handles links with spaces', () => {
    expect(parseWikiLinks('[[My Page Name]]')).toEqual(['My Page Name']);
  });

  it('trims whitespace in link targets', () => {
    expect(parseWikiLinks('[[  SpacedName  ]]')).toEqual(['SpacedName']);
  });
});
