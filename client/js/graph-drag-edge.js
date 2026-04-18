/**
 * Drag-to-edge interaction controller for ForceGraph.
 *
 * Users drag from a node's edge-handle to another node to create an edge.
 * A dashed-line preview follows the cursor. Dropping on a valid target
 * produces a "create edge" action; the consumer opens EdgeEditModal
 * pre-filled with source and target.
 */

/* exported GraphDragEdge */
/* global d3 */

var GraphDragEdge = (function () {
  'use strict';

  /**
   * Validate a candidate drop target.
   * Returns { valid, reason } where reason ∈ { 'self', 'duplicate', 'missing', null }.
   */
  function validateTarget(state, targetId, existingEdges) {
    if (!targetId) return { valid: false, reason: 'missing' };
    if (!state || !state.sourceId) return { valid: false, reason: 'missing' };
    if (targetId === state.sourceId) return { valid: false, reason: 'self' };
    if (Array.isArray(existingEdges)) {
      for (var i = 0; i < existingEdges.length; i++) {
        var e = existingEdges[i];
        var s = e.source_node_id || (e.source && e.source.id) || e.source;
        var t = e.target_node_id || (e.target && e.target.id) || e.target;
        if (s === state.sourceId && t === targetId) {
          return { valid: false, reason: 'duplicate' };
        }
      }
    }
    return { valid: true, reason: null };
  }

  /**
   * Initialize a drag state for a source node.
   * sourceNode must have {id, x, y}.
   */
  function beginDrag(sourceNode) {
    if (!sourceNode || !sourceNode.id) {
      throw new Error('beginDrag: sourceNode with id is required');
    }
    return {
      active: true,
      sourceId: sourceNode.id,
      sourceX: sourceNode.x || 0,
      sourceY: sourceNode.y || 0,
      cursorX: sourceNode.x || 0,
      cursorY: sourceNode.y || 0,
      candidateTargetId: null,
    };
  }

  /** Update cursor position and optional target hover. Pure update. */
  function updateDrag(state, cursor, candidateTargetId) {
    if (!state || !state.active) return state;
    return Object.assign({}, state, {
      cursorX: cursor.x,
      cursorY: cursor.y,
      candidateTargetId: candidateTargetId || null,
    });
  }

  /**
   * Resolve a drop. Returns { action, sourceId, targetId, reason? }.
   * action ∈ { 'create', 'cancel' }.
   */
  function endDrag(state, dropTargetId, existingEdges) {
    if (!state || !state.active) return { action: 'cancel', reason: 'inactive' };
    if (!dropTargetId) return { action: 'cancel', reason: 'no-target' };
    var v = validateTarget(state, dropTargetId, existingEdges);
    if (!v.valid) return { action: 'cancel', reason: v.reason };
    return { action: 'create', sourceId: state.sourceId, targetId: dropTargetId };
  }

  // ─── SVG preview rendering ──────────────────────────────────────────────────

  var PREVIEW_CLASS = 'edge-drag-preview';
  var HANDLE_CLASS = 'edge-handle';

  function renderPreview(svgG, state) {
    if (typeof d3 === 'undefined' || !svgG) return null;
    var sel = svgG.select('line.' + PREVIEW_CLASS);
    if (!state || !state.active) {
      sel.remove();
      return null;
    }
    if (sel.empty()) {
      sel = svgG.append('line').attr('class', PREVIEW_CLASS);
    }
    sel
      .attr('x1', state.sourceX)
      .attr('y1', state.sourceY)
      .attr('x2', state.cursorX)
      .attr('y2', state.cursorY)
      .attr('stroke', '#4F9DFF')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '6 4')
      .attr('pointer-events', 'none');
    return sel.node();
  }

  function removePreview(svgG) {
    if (!svgG) return;
    svgG.selectAll('line.' + PREVIEW_CLASS).remove();
  }

  /**
   * Attach an edge-handle to a node group on hover.
   * nodeSel is a D3 selection of <g class="node"> elements with data-bound nodes.
   * onDragStart(event, node) is invoked when the handle begins a drag.
   * Returns a cleanup function.
   */
  function attachHandles(nodeSel, options) {
    options = options || {};
    var getRadius = options.getRadius || function () { return 18; };
    var onDragStart = options.onDragStart || function () {};

    function showHandle(event, d) {
      var g = typeof d3 !== 'undefined' ? d3.select(this) : null;
      if (!g || g.select('circle.' + HANDLE_CLASS).size() > 0) return;
      var r = getRadius(d);
      var handle = g.append('circle')
        .attr('class', HANDLE_CLASS)
        .attr('cx', r)
        .attr('cy', 0)
        .attr('r', 8)
        .attr('fill', '#4F9DFF')
        .attr('fill-opacity', 0.8)
        .attr('stroke', '#1E3A8A')
        .attr('stroke-width', 1)
        .style('cursor', 'crosshair');

      handle.on('mousedown', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
        onDragStart(ev, d);
      });
    }

    function hideHandle() {
      if (typeof d3 === 'undefined') return;
      d3.select(this).selectAll('circle.' + HANDLE_CLASS).remove();
    }

    nodeSel.on('mouseenter.edgehandle', showHandle);
    nodeSel.on('mouseleave.edgehandle', hideHandle);

    return function cleanup() {
      nodeSel.on('mouseenter.edgehandle', null);
      nodeSel.on('mouseleave.edgehandle', null);
      nodeSel.selectAll('circle.' + HANDLE_CLASS).remove();
    };
  }

  return {
    beginDrag: beginDrag,
    updateDrag: updateDrag,
    endDrag: endDrag,
    validateTarget: validateTarget,
    renderPreview: renderPreview,
    removePreview: removePreview,
    attachHandles: attachHandles,
    PREVIEW_CLASS: PREVIEW_CLASS,
    HANDLE_CLASS: HANDLE_CLASS,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GraphDragEdge: GraphDragEdge };
}
