const { formatDate, truncate, capitalize, debounce } = require('../js/utils');

describe('formatDate', () => {
  it('formats a date string', () => {
    expect(formatDate('2026-01-15')).toMatch(/Jan/);
    expect(formatDate('2026-01-15')).toMatch(/2026/);
  });

  it('formats a Date object', () => {
    const result = formatDate(new Date('2026-06-01'));
    expect(result).toMatch(/Jun/);
  });

  it('returns empty string for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('');
  });
});

describe('truncate', () => {
  it('returns string unchanged if within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates and adds ellipsis', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
  });

  it('returns empty string for non-string input', () => {
    expect(truncate(null, 5)).toBe('');
  });
});

describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('returns empty string for empty input', () => {
    expect(capitalize('')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(capitalize(42)).toBe('');
  });
});

describe('debounce', () => {
  it('returns a function', () => {
    const fn = debounce(() => {}, 100);
    expect(typeof fn).toBe('function');
  });
});
