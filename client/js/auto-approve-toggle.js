/**
 * AutoApproveToggle: a row with label, helper text, and a switch that
 * persists `auto_approve` on a project via PATCH /api/projects/:id.
 *
 * Disable path: flips immediately, saves optimistically, reverts on error.
 * Enable path: opens ConfirmAutoApproveModal; saves only on confirm.
 */

/* exported AutoApproveToggle */

var AutoApproveToggle = (function () {
  'use strict';

  function patchAutoApprove(opts) {
    var projectId = opts.projectId;
    var value = opts.value;
    var role = opts.role || 'admin';
    var fetchFn = opts.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) return Promise.reject(new Error('fetch is not available'));
    if (!projectId) return Promise.reject(new Error('projectId is required'));

    return fetchFn('/api/projects/' + encodeURIComponent(projectId), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': role,
      },
      body: JSON.stringify({ auto_approve: !!value }),
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (j) {
          throw new Error((j && j.error) || ('HTTP ' + res.status));
        }, function () {
          throw new Error('HTTP ' + res.status);
        });
      }
      return res.json();
    });
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function render(opts) {
    opts = opts || {};
    var container = opts.container || document.createElement('div');
    var projectId = opts.projectId;
    var current = !!opts.initialValue;
    var isAdmin = opts.isAdmin !== false;
    var fetchFn = opts.fetch;
    var role = opts.role || 'admin';
    var ModalCtor = opts.ConfirmModal ||
      (typeof ConfirmAutoApproveModal !== 'undefined' ? ConfirmAutoApproveModal : null);
    var onChange = opts.onChange;
    var onError = opts.onError;

    container.classList.add('auto-approve-toggle');

    var label = el('div', { className: 'aat-label' }, ['Auto-Approve Stories']);
    var helper = el('div', { className: 'aat-helper' }, [
      'When enabled, stories are automatically approved without manual review.',
    ]);

    var toggle = el('button', {
      type: 'button',
      className: 'aat-switch',
      role: 'switch',
      'aria-label': 'Auto-Approve Stories',
    });
    var badge = el('span', { className: 'aat-badge' });

    function applyVisualState(saving) {
      toggle.setAttribute('aria-checked', current ? 'true' : 'false');
      toggle.classList.toggle('on', current);
      toggle.classList.toggle('off', !current);
      badge.textContent = current ? 'Enabled' : 'Disabled';
      badge.className = 'aat-badge' + (current ? ' aat-badge-on' : ' aat-badge-off');
      if (!isAdmin) {
        toggle.disabled = true;
        toggle.setAttribute('title', 'Only admins can change this setting.');
      } else {
        toggle.disabled = !!saving;
        if (saving) toggle.setAttribute('aria-busy', 'true');
        else toggle.removeAttribute('aria-busy');
      }
    }
    applyVisualState(false);

    function save(nextValue) {
      var prev = current;
      current = nextValue;
      applyVisualState(true);
      return patchAutoApprove({
        projectId: projectId,
        value: nextValue,
        fetch: fetchFn,
        role: role,
      }).then(function (resp) {
        applyVisualState(false);
        if (typeof onChange === 'function') onChange(current);
        return resp;
      }).catch(function (err) {
        current = prev;
        applyVisualState(false);
        if (typeof onError === 'function') onError(err);
        throw err;
      });
    }

    toggle.addEventListener('click', function () {
      if (!isAdmin || toggle.disabled) return;
      if (!current) {
        // OFF -> ON: confirm first
        if (!ModalCtor) {
          return save(true);
        }
        ModalCtor.open({
          onConfirm: function () { save(true); },
        });
        return;
      }
      // ON -> OFF: immediate save
      save(false);
    });

    var row = el('div', { className: 'aat-row' });
    var textCol = el('div', { className: 'aat-text' }, [label, helper]);
    var controlCol = el('div', { className: 'aat-control' }, [badge, toggle]);
    row.appendChild(textCol);
    row.appendChild(controlCol);
    container.appendChild(row);

    return {
      container: container,
      toggle: toggle,
      badge: badge,
      getValue: function () { return current; },
      // exposed for testing
      _save: save,
    };
  }

  return {
    render: render,
    patchAutoApprove: patchAutoApprove,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AutoApproveToggle: AutoApproveToggle };
}
