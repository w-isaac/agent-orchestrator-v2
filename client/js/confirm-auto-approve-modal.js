/**
 * ConfirmAutoApproveModal: dialog shown before enabling auto-approve.
 * Calls onConfirm when the user confirms, onCancel otherwise.
 */

/* exported ConfirmAutoApproveModal */

var ConfirmAutoApproveModal = (function () {
  'use strict';

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

  function open(opts) {
    opts = opts || {};
    var container = opts.container || document.body;

    var backdrop = el('div', { className: 'modal-backdrop', role: 'presentation' });
    var dialog = el('div', {
      className: 'modal confirm-auto-approve-modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'caa-title',
    });
    backdrop.appendChild(dialog);

    var title = el('h2', { id: 'caa-title', className: 'modal-title' }, ['Enable Auto-Approve?']);
    var body = el('p', { className: 'modal-body' }, [
      'Stories will be automatically approved without manual review. This applies to all future stories in this project.',
    ]);
    var closeBtn = el('button', { type: 'button', className: 'modal-close', 'aria-label': 'Close' }, ['\u00D7']);
    var cancelBtn = el('button', { type: 'button', className: 'btn btn-ghost modal-cancel' }, ['Cancel']);
    var confirmBtn = el('button', { type: 'button', className: 'btn btn-primary modal-confirm' }, ['Enable Auto-Approve']);
    var footer = el('div', { className: 'modal-footer' }, [cancelBtn, confirmBtn]);

    dialog.appendChild(closeBtn);
    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(footer);

    var closed = false;
    function close(reason) {
      if (closed) return;
      closed = true;
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener('keydown', onKey);
      if (reason === 'cancel' && typeof opts.onCancel === 'function') opts.onCancel();
    }

    function onKey(e) {
      if (e.key === 'Escape') close('cancel');
    }

    closeBtn.addEventListener('click', function () { close('cancel'); });
    cancelBtn.addEventListener('click', function () { close('cancel'); });
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) close('cancel');
    });
    confirmBtn.addEventListener('click', function () {
      if (typeof opts.onConfirm === 'function') {
        opts.onConfirm();
      }
      close('confirm');
    });

    document.addEventListener('keydown', onKey);
    container.appendChild(backdrop);
    confirmBtn.focus();

    return {
      close: function () { close('cancel'); },
      dialog: dialog,
      backdrop: backdrop,
      confirmBtn: confirmBtn,
      cancelBtn: cancelBtn,
    };
  }

  return { open: open };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ConfirmAutoApproveModal: ConfirmAutoApproveModal };
}
