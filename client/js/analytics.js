/**
 * Token Analytics Dashboard (AOV-18)
 * Renders 5 panels: token usage series, effective cost by model,
 * first-try success, rework cost, budget gauges, conflict rate.
 *
 * Exports pure helpers for unit testing. DOM rendering runs only in browser.
 */
(function () {
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatUsd(n) {
    const v = Number(n) || 0;
    return '$' + v.toFixed(2);
  }

  function formatTokens(n) {
    const v = Number(n) || 0;
    if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return String(v);
  }

  function formatPct(n) {
    const v = Number(n) || 0;
    return (v * 100).toFixed(1) + '%';
  }

  function defaultRange() {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 7);
    const iso = (d) => d.toISOString().slice(0, 10);
    return { from: iso(from), to: iso(to) };
  }

  function buildQuery(filters) {
    const params = new URLSearchParams();
    if (filters.project_id) params.set('project_id', filters.project_id);
    if (filters.agent) params.set('agent', filters.agent);
    if (filters.bucket) params.set('bucket', filters.bucket);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    const qs = params.toString();
    return qs ? '?' + qs : '';
  }

  function statusFromUtilization(pct) {
    if (pct >= 1) return 'over';
    if (pct >= 0.9) return 'critical';
    if (pct >= 0.75) return 'warning';
    return 'ok';
  }

  function barRows(items, labelKey, valueKey, formatter) {
    if (!items || items.length === 0) return '<div class="empty-state">No data in window.</div>';
    const max = items.reduce((a, r) => Math.max(a, Number(r[valueKey]) || 0), 0) || 1;
    return items.map((r) => {
      const val = Number(r[valueKey]) || 0;
      const pct = (val / max) * 100;
      return (
        '<div class="bar-row">' +
          '<span class="bar-label" title="' + escapeHtml(r[labelKey] || '—') + '">' + escapeHtml(r[labelKey] || '—') + '</span>' +
          '<span class="bar-track"><span class="bar-fill" style="width:' + pct.toFixed(1) + '%"></span></span>' +
          '<span class="bar-value">' + escapeHtml(formatter(val)) + '</span>' +
        '</div>'
      );
    }).join('');
  }

  function renderTokenUsage(root, data) {
    if (!data || !data.series || data.series.length === 0) {
      root.innerHTML = '<div class="empty-state">No token usage recorded in this window.</div>';
      return;
    }
    const maxTokens = data.series.reduce((a, p) => Math.max(a, p.tokens), 0) || 1;
    const rows = data.series.map((p) => {
      const pct = (p.tokens / maxTokens) * 100;
      return (
        '<div class="bar-row">' +
          '<span class="bar-label">' + escapeHtml(new Date(p.timestamp).toLocaleString()) + '</span>' +
          '<span class="bar-track"><span class="bar-fill" style="width:' + pct.toFixed(1) + '%"></span></span>' +
          '<span class="bar-value">' + escapeHtml(formatTokens(p.tokens)) + ' / ' + escapeHtml(formatUsd(p.cost_usd)) + '</span>' +
        '</div>'
      );
    }).join('');
    root.innerHTML =
      '<div class="bar-group">' + rows + '</div>' +
      '<details style="margin-top:0.75rem"><summary>By project &amp; agent</summary>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:0.5rem">' +
        '<div><h4 style="margin:0 0 .4rem;font-size:.85rem">By project</h4>' +
        barRows(data.by_project, 'project_name', 'tokens', formatTokens) + '</div>' +
        '<div><h4 style="margin:0 0 .4rem;font-size:.85rem">By agent</h4>' +
        barRows(data.by_agent, 'agent_role', 'tokens', formatTokens) + '</div>' +
      '</div></details>';
  }

  function renderCostByModel(root, data) {
    if (!data || !data.by_model || data.by_model.length === 0) {
      root.innerHTML = '<div class="empty-state">No cost recorded in this window.</div>';
      return;
    }
    const rows = data.by_model.map((r) =>
      '<tr><td>' + escapeHtml(r.model) + '</td>' +
      '<td class="num">' + escapeHtml(formatUsd(r.cost_usd)) + '</td>' +
      '<td class="num">' + escapeHtml(String(r.task_count)) + '</td></tr>'
    ).join('');
    root.innerHTML =
      '<table class="data-table"><thead><tr><th>Model</th><th class="num">Cost</th><th class="num">Tasks</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  }

  function renderSuccessRate(root, data) {
    if (!data || !data.by_agent || data.by_agent.length === 0) {
      root.innerHTML = '<div class="empty-state">No completed tasks in this window.</div>';
      return;
    }
    const rows = data.by_agent.map((r) =>
      '<tr><td>' + escapeHtml(r.agent_role || '—') + '</td>' +
      '<td class="num">' + escapeHtml(String(r.total_tasks)) + '</td>' +
      '<td class="num">' + escapeHtml(String(r.first_try_successes)) + '</td>' +
      '<td class="num" title="First-try success rate">' + escapeHtml(formatPct(r.first_try_rate)) + '</td></tr>'
    ).join('');
    root.innerHTML =
      '<table class="data-table"><thead><tr><th>Agent</th><th class="num">Total</th>' +
      '<th class="num">First-try</th><th class="num">Rate</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function renderRework(root, data) {
    if (!data || !data.total) {
      root.innerHTML = '<div class="empty-state">No rework data.</div>';
      return;
    }
    const t = data.total;
    const byAgent = barRows(data.by_agent, 'agent_role', 'rework_cost_usd', formatUsd);
    root.innerHTML =
      '<div class="kpi-row" style="padding:0 0 .75rem">' +
        '<div class="kpi"><span class="kpi-label">Rework tokens</span><span class="kpi-value">' + escapeHtml(formatTokens(t.rework_tokens)) + '</span></div>' +
        '<div class="kpi"><span class="kpi-label">Rework cost</span><span class="kpi-value">' + escapeHtml(formatUsd(t.rework_cost_usd)) + '</span></div>' +
        '<div class="kpi"><span class="kpi-label">Rework tasks</span><span class="kpi-value">' + escapeHtml(String(t.rework_tasks || 0)) + '</span></div>' +
      '</div>' +
      '<h4 style="margin:.25rem 0 .4rem;font-size:.85rem">By agent</h4>' + byAgent;
  }

  function renderBudgets(root, data) {
    if (!data || !data.gauges || data.gauges.length === 0) {
      root.innerHTML = '<div class="empty-state">No project budgets configured. Use POST /api/analytics/project-budgets to add one.</div>';
      return;
    }
    const tiles = data.gauges.map((g) => {
      const pct = Math.min(1, g.utilization || 0);
      const fillPct = (pct * 100).toFixed(1);
      const warnPct = ((g.warning_threshold || 0.75) * 100).toFixed(1);
      const critPct = ((g.critical_threshold || 0.9) * 100).toFixed(1);
      const tooltip = 'Cap: ' + formatUsd(g.budget_cap_usd) +
        ' | Spend: ' + formatUsd(g.current_spend_usd) +
        ' | ' + formatPct(g.utilization);
      return (
        '<div class="gauge" title="' + escapeHtml(tooltip) + '">' +
          '<div class="gauge-head">' +
            '<span class="gauge-name">' + escapeHtml(g.project_name || g.project_id) + '</span>' +
            '<span class="gauge-status ' + escapeHtml(g.status) + '">' + escapeHtml(g.status) + '</span>' +
          '</div>' +
          '<div class="gauge-track" role="progressbar" aria-valuenow="' + fillPct + '" aria-valuemin="0" aria-valuemax="100">' +
            '<div class="gauge-fill ' + escapeHtml(g.status) + '" style="width:' + fillPct + '%"></div>' +
            '<div class="gauge-marker" style="left:' + warnPct + '%"></div>' +
            '<div class="gauge-marker" style="left:' + critPct + '%"></div>' +
          '</div>' +
          '<div class="gauge-numbers">' +
            '<span>' + escapeHtml(formatUsd(g.current_spend_usd)) + ' / ' + escapeHtml(formatUsd(g.budget_cap_usd)) + '</span>' +
            '<span>' + escapeHtml(formatPct(g.utilization)) + '</span>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    root.innerHTML = '<div class="gauge-grid">' + tiles + '</div>';
  }

  function renderConflicts(root, data) {
    if (!data || data.conflicts_detected === 0) {
      root.innerHTML = '<div class="empty-state">No conflicts recorded in this window.</div>';
      return;
    }
    root.innerHTML =
      '<div class="kpi-row" style="padding:0">' +
        '<div class="kpi"><span class="kpi-label" title="Total conflicts detected">Detected</span><span class="kpi-value">' + escapeHtml(String(data.conflicts_detected)) + '</span></div>' +
        '<div class="kpi"><span class="kpi-label" title="Auto-merged non-overlapping + compatible">Auto-merged</span><span class="kpi-value">' + escapeHtml(String(data.auto_merges)) + '</span></div>' +
        '<div class="kpi"><span class="kpi-label" title="Requeued as incompatible">Manual</span><span class="kpi-value">' + escapeHtml(String(data.manual_interventions)) + '</span></div>' +
        '<div class="kpi"><span class="kpi-label" title="Auto-merge rate">Auto-merge</span><span class="kpi-value">' + escapeHtml(formatPct(data.auto_merge_rate)) + '</span></div>' +
      '</div>';
  }

  function getFiltersFromForm() {
    if (typeof document === 'undefined') return {};
    return {
      project_id: document.getElementById('filter-project').value || '',
      agent: document.getElementById('filter-agent').value || '',
      bucket: document.getElementById('filter-bucket').value || 'daily',
      from: document.getElementById('filter-from').value || '',
      to: document.getElementById('filter-to').value || '',
    };
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function setKpi(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    const v = el.querySelector('.kpi-value');
    if (v) v.textContent = text;
  }

  async function loadDashboard() {
    const filters = getFiltersFromForm();
    const qs = buildQuery(filters);
    const panels = {
      token: document.getElementById('token-usage-panel'),
      model: document.getElementById('cost-model-panel'),
      success: document.getElementById('success-rate-panel'),
      rework: document.getElementById('rework-panel'),
      budget: document.getElementById('budget-panel'),
      conflicts: document.getElementById('conflicts-panel'),
    };
    Object.values(panels).forEach((el) => { if (el) el.innerHTML = '<div class="loading">Loading…</div>'; });

    const endpoints = {
      token: '/api/analytics/token-usage' + qs,
      rate: '/api/analytics/success-rate' + qs,
      rework: '/api/analytics/rework-cost' + qs,
      cost: '/api/analytics/effective-cost' + qs,
      budget: '/api/analytics/budget-utilization' + (filters.project_id ? '?project_id=' + encodeURIComponent(filters.project_id) : ''),
      conflicts: '/api/analytics/conflicts' + qs,
    };

    try {
      const [token, rate, rework, cost, budget, conflicts] = await Promise.all([
        fetchJson(endpoints.token),
        fetchJson(endpoints.rate),
        fetchJson(endpoints.rework),
        fetchJson(endpoints.cost),
        fetchJson(endpoints.budget),
        fetchJson(endpoints.conflicts),
      ]);

      renderTokenUsage(panels.token, token);
      renderCostByModel(panels.model, cost);
      renderSuccessRate(panels.success, rate);
      renderRework(panels.rework, rework);
      renderBudgets(panels.budget, budget);
      renderConflicts(panels.conflicts, conflicts);

      const totalTokens = (token.series || []).reduce((a, p) => a + (p.tokens || 0), 0);
      setKpi('kpi-tokens', formatTokens(totalTokens));
      setKpi('kpi-cost', formatUsd(cost.total_cost_usd || 0));
      const allAgentTotals = (rate.by_agent || []).reduce(
        (a, r) => ({ t: a.t + r.total_tasks, s: a.s + r.first_try_successes }),
        { t: 0, s: 0 },
      );
      setKpi('kpi-first-try', allAgentTotals.t > 0 ? formatPct(allAgentTotals.s / allAgentTotals.t) : '—');
      setKpi('kpi-rework', formatUsd(rework.total ? rework.total.rework_cost_usd : 0));
      setKpi('kpi-auto-merge', conflicts.conflicts_detected > 0 ? formatPct(conflicts.auto_merge_rate) : '—');
    } catch (err) {
      Object.values(panels).forEach((el) => {
        if (el) el.innerHTML = '<div class="error">Failed to load: ' + escapeHtml(err.message) + '</div>';
      });
    }
  }

  async function loadProjects() {
    if (typeof document === 'undefined') return;
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) return;
      const body = await res.json();
      const projects = Array.isArray(body) ? body : (body.projects || []);
      const sel = document.getElementById('filter-project');
      if (!sel) return;
      projects.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name || p.id;
        sel.appendChild(opt);
      });
    } catch (_err) { /* non-fatal */ }
  }

  function init() {
    if (typeof document === 'undefined') return;
    const r = defaultRange();
    const fromEl = document.getElementById('filter-from');
    const toEl = document.getElementById('filter-to');
    if (fromEl && !fromEl.value) fromEl.value = r.from;
    if (toEl && !toEl.value) toEl.value = r.to;

    const form = document.getElementById('analytics-filters');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        loadDashboard();
      });
    }
    loadProjects().then(loadDashboard);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      escapeHtml,
      formatUsd,
      formatTokens,
      formatPct,
      defaultRange,
      buildQuery,
      statusFromUtilization,
      barRows,
    };
  }
})();
