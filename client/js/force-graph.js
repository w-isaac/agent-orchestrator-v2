/**
 * Force-directed graph visualization using D3.js.
 * Read-only: renders nodes (artifact/task/context) and weighted edges.
 * Supports zoom, pan, and edge-weight tooltips.
 */

/* exported ForceGraph */
/* global d3 */

var ForceGraph = (function () {
  'use strict';

  // Node visual config per type
  var NODE_CONFIG = {
    artifact: { fill: '#4F8EF7', stroke: '#2563EB', shape: 'circle', r: 18 },
    task:     { fill: '#22C55E', stroke: '#16A34A', shape: 'rect', size: 32, rx: 6 },
    context:  { fill: '#F59E0B', stroke: '#D97706', shape: 'diamond', size: 28 },
  };

  var EDGE_COLOR = '#94A3B8';
  var EDGE_HOVER_COLOR = '#475569';
  var LABEL_MAX = 16;

  function truncateLabel(str) {
    if (!str) return '';
    return str.length > LABEL_MAX ? str.slice(0, LABEL_MAX) + '\u2026' : str;
  }

  /**
   * Render a force-directed graph into the given SVG element.
   * @param {SVGElement} svgEl - The target <svg> element
   * @param {{ nodes: Array, edges: Array }} data - Graph data
   * @returns {{ destroy: Function }} cleanup handle
   */
  function render(svgEl, data) {
    var svg = d3.select(svgEl);
    var width = svgEl.clientWidth || 800;
    var height = svgEl.clientHeight || 600;

    svg.attr('viewBox', [0, 0, width, height]);
    svg.selectAll('*').remove();

    // Container group for zoom/pan
    var g = svg.append('g');

    // Zoom behavior
    var zoomBehavior = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', function (event) {
        g.attr('transform', event.transform);
      });
    svg.call(zoomBehavior);

    // Tooltip element
    var tooltip = d3.select('#edge-tooltip');

    // Prepare data: D3 force mutates the data, so clone
    var nodes = data.nodes.map(function (n) { return Object.assign({}, n); });
    var edges = data.edges.map(function (e) { return Object.assign({}, e); });

    // Force simulation
    var simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id(function (d) { return d.id; }).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(30));

    // Render edges
    var linkGroup = g.append('g').attr('class', 'links');
    var link = linkGroup.selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', EDGE_COLOR)
      .attr('stroke-width', function (d) { return Math.max(1, Math.min(d.weight * 3, 6)); })
      .attr('stroke-opacity', 0.6)
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('stroke', EDGE_HOVER_COLOR).attr('stroke-opacity', 1);
        tooltip
          .classed('hidden', false)
          .style('left', event.offsetX + 12 + 'px')
          .style('top', event.offsetY - 8 + 'px')
          .text('Weight: ' + d.weight.toFixed(2));
      })
      .on('mousemove', function (event) {
        tooltip
          .style('left', event.offsetX + 12 + 'px')
          .style('top', event.offsetY - 8 + 'px');
      })
      .on('mouseleave', function () {
        d3.select(this).attr('stroke', EDGE_COLOR).attr('stroke-opacity', 0.6);
        tooltip.classed('hidden', true);
      });

    // Render nodes
    var nodeGroup = g.append('g').attr('class', 'nodes');
    var node = nodeGroup.selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'node');

    // Draw shapes per type
    node.each(function (d) {
      var el = d3.select(this);
      var cfg = NODE_CONFIG[d.type] || NODE_CONFIG.artifact;
      if (cfg.shape === 'circle') {
        el.append('circle')
          .attr('r', cfg.r)
          .attr('fill', cfg.fill)
          .attr('stroke', cfg.stroke)
          .attr('stroke-width', 2);
      } else if (cfg.shape === 'rect') {
        var half = cfg.size / 2;
        el.append('rect')
          .attr('x', -half)
          .attr('y', -half)
          .attr('width', cfg.size)
          .attr('height', cfg.size)
          .attr('rx', cfg.rx)
          .attr('fill', cfg.fill)
          .attr('stroke', cfg.stroke)
          .attr('stroke-width', 2);
      } else if (cfg.shape === 'diamond') {
        var s = cfg.size / 2;
        el.append('rect')
          .attr('x', -s)
          .attr('y', -s)
          .attr('width', cfg.size)
          .attr('height', cfg.size)
          .attr('rx', 2)
          .attr('fill', cfg.fill)
          .attr('stroke', cfg.stroke)
          .attr('stroke-width', 2)
          .attr('transform', 'rotate(45)');
      }
    });

    // Node labels
    node.append('text')
      .attr('class', 'node-label')
      .attr('dy', function (d) {
        var cfg = NODE_CONFIG[d.type] || NODE_CONFIG.artifact;
        return (cfg.r || cfg.size / 2) + 16;
      })
      .text(function (d) { return truncateLabel(d.label); });

    // Simulation tick
    simulation.on('tick', function () {
      link
        .attr('x1', function (d) { return d.source.x; })
        .attr('y1', function (d) { return d.source.y; })
        .attr('x2', function (d) { return d.target.x; })
        .attr('y2', function (d) { return d.target.y; });

      node.attr('transform', function (d) {
        return 'translate(' + d.x + ',' + d.y + ')';
      });
    });

    // Toolbar controls
    var zoomInBtn = document.getElementById('zoom-in');
    var zoomOutBtn = document.getElementById('zoom-out');
    var zoomResetBtn = document.getElementById('zoom-reset');

    function handleZoomIn() { svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.3); }
    function handleZoomOut() { svg.transition().duration(300).call(zoomBehavior.scaleBy, 0.7); }
    function handleZoomReset() { svg.transition().duration(300).call(zoomBehavior.transform, d3.zoomIdentity); }

    if (zoomInBtn) zoomInBtn.addEventListener('click', handleZoomIn);
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', handleZoomOut);
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', handleZoomReset);

    return {
      simulation: simulation,
      zoomBehavior: zoomBehavior,
      destroy: function () {
        simulation.stop();
        if (zoomInBtn) zoomInBtn.removeEventListener('click', handleZoomIn);
        if (zoomOutBtn) zoomOutBtn.removeEventListener('click', handleZoomOut);
        if (zoomResetBtn) zoomResetBtn.removeEventListener('click', handleZoomReset);
      }
    };
  }

  return {
    render: render,
    NODE_CONFIG: NODE_CONFIG,
    truncateLabel: truncateLabel,
  };
})();

// Page initialization
(function () {
  'use strict';

  if (typeof document === 'undefined') return;

  var loadingEl = document.getElementById('graph-loading');
  var emptyEl = document.getElementById('graph-empty');
  var errorEl = document.getElementById('graph-error');
  var svgEl = document.getElementById('graph-svg');
  var toolbarEl = document.getElementById('graph-toolbar');
  var legendEl = document.getElementById('graph-legend');
  var errorMsg = document.getElementById('error-message');
  var retryBtn = document.getElementById('retry-btn');
  var projectSelect = document.getElementById('project-select');

  if (!svgEl) return; // Not on graph page

  var currentGraph = null;

  function showState(state) {
    [loadingEl, emptyEl, errorEl, svgEl, toolbarEl, legendEl].forEach(function (el) {
      if (el) el.classList.add('hidden');
    });
    if (state === 'loading' && loadingEl) loadingEl.classList.remove('hidden');
    if (state === 'empty' && emptyEl) emptyEl.classList.remove('hidden');
    if (state === 'error' && errorEl) errorEl.classList.remove('hidden');
    if (state === 'populated') {
      if (svgEl) svgEl.classList.remove('hidden');
      if (toolbarEl) toolbarEl.classList.remove('hidden');
      if (legendEl) legendEl.classList.remove('hidden');
    }
  }

  function loadGraph(projectId) {
    if (!projectId) {
      showState('empty');
      return;
    }
    if (currentGraph) {
      currentGraph.destroy();
      currentGraph = null;
    }
    showState('loading');

    fetch('/api/graph/' + encodeURIComponent(projectId))
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data.nodes || data.nodes.length === 0) {
          showState('empty');
          return;
        }
        showState('populated');
        currentGraph = ForceGraph.render(svgEl, data);
      })
      .catch(function (err) {
        if (errorMsg) errorMsg.textContent = err.message || 'Failed to load graph';
        showState('error');
      });
  }

  function loadProjects() {
    fetch('/api/projects')
      .then(function (res) { return res.json(); })
      .then(function (projects) {
        var list = Array.isArray(projects) ? projects : (projects.projects || []);
        list.forEach(function (p) {
          var opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name || p.id;
          projectSelect.appendChild(opt);
        });
        // Auto-select first project
        if (list.length > 0) {
          projectSelect.value = list[0].id;
          loadGraph(list[0].id);
        } else {
          showState('empty');
        }
      })
      .catch(function () {
        showState('empty');
      });
  }

  if (projectSelect) {
    projectSelect.addEventListener('change', function () {
      loadGraph(this.value);
    });
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      if (projectSelect) loadGraph(projectSelect.value);
    });
  }

  loadProjects();
})();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ForceGraph: ForceGraph };
}
