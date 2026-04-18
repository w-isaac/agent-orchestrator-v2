/**
 * OptimisticGraph: state primitives for optimistic graph mutations.
 *
 * Pattern: snapshot → apply → API call → on failure rollback + toast,
 *          on success finalize with server response.
 *
 * All state operations are pure. Use `mutate()` to orchestrate an
 * optimistic update around a request function.
 */

/* exported OptimisticGraph */

var OptimisticGraph = (function () {
  'use strict';

  function cloneNode(n) { return Object.assign({}, n); }
  function cloneEdge(e) { return Object.assign({}, e); }

  function cloneState(state) {
    state = state || {};
    return {
      nodes: Array.isArray(state.nodes) ? state.nodes.map(cloneNode) : [],
      edges: Array.isArray(state.edges) ? state.edges.map(cloneEdge) : [],
    };
  }

  function edgeTouchesNode(e, nodeId) {
    var s = e.source_node_id || (e.source && e.source.id) || e.source;
    var t = e.target_node_id || (e.target && e.target.id) || e.target;
    return s === nodeId || t === nodeId;
  }

  function findIndex(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return i;
    }
    return -1;
  }

  /**
   * Apply a change optimistically.
   * change: { op: 'create'|'update'|'delete', entity: 'node'|'edge', data: {...} }
   *   - create: data must include a client-side id (e.g. "tmp-...")
   *   - update: data must include id + fields to merge
   *   - delete: data must include id
   * Returns { nextState, snapshot } where snapshot captures what is needed to rollback.
   */
  function applyChange(state, change) {
    if (!change || !change.op || !change.entity || !change.data) {
      throw new Error('applyChange: change must have op, entity, and data');
    }
    var next = cloneState(state);
    var snapshot = { change: change, prev: null, prevEdges: null };

    if (change.entity === 'node') {
      if (change.op === 'create') {
        if (!change.data.id) throw new Error('applyChange: create requires data.id');
        next.nodes.push(Object.assign({ _pending: true }, change.data));
      } else if (change.op === 'update') {
        var uIdx = findIndex(next.nodes, change.data.id);
        if (uIdx >= 0) {
          snapshot.prev = cloneNode(next.nodes[uIdx]);
          next.nodes[uIdx] = Object.assign({}, next.nodes[uIdx], change.data, { _pending: true });
        }
      } else if (change.op === 'delete') {
        var dIdx = findIndex(next.nodes, change.data.id);
        if (dIdx >= 0) {
          snapshot.prev = cloneNode(next.nodes[dIdx]);
          next.nodes.splice(dIdx, 1);
          snapshot.prevEdges = [];
          next.edges = next.edges.filter(function (e) {
            if (edgeTouchesNode(e, change.data.id)) {
              snapshot.prevEdges.push(cloneEdge(e));
              return false;
            }
            return true;
          });
        }
      } else {
        throw new Error('applyChange: unknown op ' + change.op);
      }
    } else if (change.entity === 'edge') {
      if (change.op === 'create') {
        if (!change.data.id) throw new Error('applyChange: create requires data.id');
        next.edges.push(Object.assign({ _pending: true }, change.data));
      } else if (change.op === 'update') {
        var euIdx = findIndex(next.edges, change.data.id);
        if (euIdx >= 0) {
          snapshot.prev = cloneEdge(next.edges[euIdx]);
          next.edges[euIdx] = Object.assign({}, next.edges[euIdx], change.data, { _pending: true });
        }
      } else if (change.op === 'delete') {
        var edIdx = findIndex(next.edges, change.data.id);
        if (edIdx >= 0) {
          snapshot.prev = cloneEdge(next.edges[edIdx]);
          next.edges.splice(edIdx, 1);
        }
      } else {
        throw new Error('applyChange: unknown op ' + change.op);
      }
    } else {
      throw new Error('applyChange: unknown entity ' + change.entity);
    }
    return { nextState: next, snapshot: snapshot };
  }

  /**
   * Rollback an optimistic change. Returns a state with the prior slice restored.
   */
  function rollback(state, snapshot) {
    if (!snapshot || !snapshot.change) return cloneState(state);
    var restored = cloneState(state);
    var change = snapshot.change;

    if (change.entity === 'node') {
      if (change.op === 'create') {
        restored.nodes = restored.nodes.filter(function (n) { return n.id !== change.data.id; });
      } else if (change.op === 'update' && snapshot.prev) {
        var idx = findIndex(restored.nodes, snapshot.prev.id);
        if (idx >= 0) restored.nodes[idx] = cloneNode(snapshot.prev);
        else restored.nodes.push(cloneNode(snapshot.prev));
      } else if (change.op === 'delete' && snapshot.prev) {
        restored.nodes.push(cloneNode(snapshot.prev));
        if (Array.isArray(snapshot.prevEdges)) {
          snapshot.prevEdges.forEach(function (e) { restored.edges.push(cloneEdge(e)); });
        }
      }
    } else if (change.entity === 'edge') {
      if (change.op === 'create') {
        restored.edges = restored.edges.filter(function (e) { return e.id !== change.data.id; });
      } else if (change.op === 'update' && snapshot.prev) {
        var eIdx = findIndex(restored.edges, snapshot.prev.id);
        if (eIdx >= 0) restored.edges[eIdx] = cloneEdge(snapshot.prev);
        else restored.edges.push(cloneEdge(snapshot.prev));
      } else if (change.op === 'delete' && snapshot.prev) {
        restored.edges.push(cloneEdge(snapshot.prev));
      }
    }
    return restored;
  }

  /**
   * Finalize an optimistic change with server response (e.g. replace temp id).
   * `tempId` is the client-side id assigned at create time; for update, it's the
   * same id as on the server. For delete, nothing is finalized (the item is gone).
   */
  function finalize(state, change, tempId, serverData) {
    var next = cloneState(state);
    if (!change || change.op === 'delete') return next;

    if (change.entity === 'node') {
      var idx = findIndex(next.nodes, tempId);
      if (idx >= 0) {
        var merged = Object.assign({}, next.nodes[idx], serverData || {});
        delete merged._pending;
        next.nodes[idx] = merged;
      }
    } else if (change.entity === 'edge') {
      var eIdx = findIndex(next.edges, tempId);
      if (eIdx >= 0) {
        var mergedE = Object.assign({}, next.edges[eIdx], serverData || {});
        delete mergedE._pending;
        next.edges[eIdx] = mergedE;
      }
    }
    return next;
  }

  /**
   * Orchestrate an optimistic mutation. Returns a Promise.
   *
   * opts:
   *  - state: current graph state
   *  - change: { op, entity, data } (data.id is the temp/client id)
   *  - request: () => Promise<serverData>
   *  - onStateChange(newState): fires on apply, finalize, and rollback
   *  - onError(err): optional — called on request failure (e.g. to show toast)
   */
  function mutate(opts) {
    if (!opts || !opts.state || !opts.change || !opts.request || !opts.onStateChange) {
      return Promise.reject(new Error('mutate: state, change, request, onStateChange are required'));
    }
    var applied;
    try {
      applied = applyChange(opts.state, opts.change);
    } catch (err) {
      return Promise.reject(err);
    }
    opts.onStateChange(applied.nextState);

    return Promise.resolve().then(opts.request).then(function (serverData) {
      var tempId = opts.change.data && opts.change.data.id;
      var finalState = finalize(applied.nextState, opts.change, tempId, serverData);
      opts.onStateChange(finalState);
      return serverData;
    }, function (err) {
      var restored = rollback(applied.nextState, applied.snapshot);
      opts.onStateChange(restored);
      if (opts.onError) opts.onError(err);
      throw err;
    });
  }

  return {
    applyChange: applyChange,
    rollback: rollback,
    finalize: finalize,
    mutate: mutate,
    cloneState: cloneState,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OptimisticGraph: OptimisticGraph };
}
