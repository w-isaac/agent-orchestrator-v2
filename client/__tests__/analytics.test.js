const {
  escapeHtml,
  formatUsd,
  formatTokens,
  formatPct,
  defaultRange,
  buildQuery,
  statusFromUtilization,
  barRows,
} = require('../js/analytics');

describe('escapeHtml', () => {
  it('escapes HTML-sensitive characters', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });
  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('formatUsd', () => {
  it('formats numbers as USD', () => {
    expect(formatUsd(1.5)).toBe('$1.50');
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd('3.456')).toBe('$3.46');
  });
});

describe('formatTokens', () => {
  it('uses K/M suffixes', () => {
    expect(formatTokens(500)).toBe('500');
    expect(formatTokens(1500)).toBe('1.5K');
    expect(formatTokens(2500000)).toBe('2.50M');
  });
});

describe('formatPct', () => {
  it('renders ratio as percentage with one decimal', () => {
    expect(formatPct(0.75)).toBe('75.0%');
    expect(formatPct(0)).toBe('0.0%');
    expect(formatPct(1)).toBe('100.0%');
  });
});

describe('defaultRange', () => {
  it('returns 7-day window ISO dates', () => {
    const r = defaultRange();
    expect(r.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const fromDate = new Date(r.from);
    const toDate = new Date(r.to);
    const diffDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);
    expect(Math.round(diffDays)).toBe(7);
  });
});

describe('buildQuery', () => {
  it('builds an empty query when no filters set', () => {
    expect(buildQuery({})).toBe('');
  });
  it('encodes present filters', () => {
    const qs = buildQuery({ project_id: 'p1', agent: 'qa', bucket: 'daily', from: '2026-04-01', to: '2026-04-18' });
    expect(qs).toContain('project_id=p1');
    expect(qs).toContain('agent=qa');
    expect(qs).toContain('bucket=daily');
    expect(qs).toContain('from=2026-04-01');
    expect(qs).toContain('to=2026-04-18');
  });
  it('skips empty values', () => {
    const qs = buildQuery({ project_id: '', agent: 'qa' });
    expect(qs).toBe('?agent=qa');
  });
});

describe('statusFromUtilization', () => {
  it('maps thresholds correctly', () => {
    expect(statusFromUtilization(0)).toBe('ok');
    expect(statusFromUtilization(0.5)).toBe('ok');
    expect(statusFromUtilization(0.75)).toBe('warning');
    expect(statusFromUtilization(0.89)).toBe('warning');
    expect(statusFromUtilization(0.9)).toBe('critical');
    expect(statusFromUtilization(0.99)).toBe('critical');
    expect(statusFromUtilization(1)).toBe('over');
    expect(statusFromUtilization(1.5)).toBe('over');
  });
});

describe('barRows', () => {
  it('returns empty-state markup for no items', () => {
    expect(barRows([], 'x', 'y', (v) => String(v))).toContain('empty-state');
  });
  it('renders bar rows with label and value', () => {
    const out = barRows(
      [{ project_name: 'A', tokens: 100 }, { project_name: 'B', tokens: 50 }],
      'project_name',
      'tokens',
      (v) => v + 'x',
    );
    expect(out).toContain('>A<');
    expect(out).toContain('100x');
    expect(out).toContain('50x');
  });
  it('escapes label to prevent XSS', () => {
    const out = barRows(
      [{ name: '<b>x</b>', v: 1 }],
      'name',
      'v',
      (v) => String(v),
    );
    expect(out).toContain('&lt;b&gt;');
    expect(out).not.toContain('<b>x</b>');
  });
});
