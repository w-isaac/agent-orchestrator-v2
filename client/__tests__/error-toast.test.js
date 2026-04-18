import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

// Minimal DOM stub so the module can run in vitest's node environment.
// The ErrorToast module only uses: document.createElement, element.appendChild,
// element.removeChild, element.addEventListener, element.setAttribute, and
// element.textContent / childNodes traversal.

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.parentNode = null;
    this.className = '';
    this._text = '';
  }
  appendChild(child) {
    if (child.parentNode && child.parentNode !== this) {
      child.parentNode.removeChild(child);
    }
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) {
      this.children.splice(i, 1);
      child.parentNode = null;
    }
    return child;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(evt, fn) {
    (this.listeners[evt] = this.listeners[evt] || []).push(fn);
  }
  dispatch(evt) {
    (this.listeners[evt] || []).forEach((fn) => fn());
  }
  click() { this.dispatch('click'); }
  get textContent() {
    let out = this._text;
    this.children.forEach((c) => { out += c.textContent; });
    return out;
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  querySelectorAll(sel) {
    const results = [];
    const cls = sel.startsWith('.') ? sel.slice(1) : null;
    const walk = (node) => {
      node.children.forEach((c) => {
        if (cls && c.className && c.className.split(/\s+/).includes(cls)) results.push(c);
        walk(c);
      });
    };
    walk(this);
    return results;
  }
}

class FakeTextNode {
  constructor(text) { this._text = String(text); this.parentNode = null; this.children = []; }
  get textContent() { return this._text; }
}

const fakeDocument = {
  createElement(tag) { return new FakeElement(tag); },
  createTextNode(t) { return new FakeTextNode(t); },
};

global.document = fakeDocument;

const require = createRequire(import.meta.url);
const { ErrorToast } = require('../js/error-toast');

function makeContainer() { return new FakeElement('div'); }

describe('ErrorToast', () => {
  let container;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { vi.useRealTimers(); });

  it('exports a default auto-dismiss duration of 6000ms', () => {
    expect(ErrorToast.AUTO_DISMISS_MS).toBe(6000);
  });

  it('createStack appends a stack element to the container', () => {
    const stack = ErrorToast.createStack(container, { duration: 0 });
    expect(stack.element).toBeDefined();
    expect(container.children).toContain(stack.element);
    expect(stack.element.className).toBe('error-toast-stack');
  });

  it('addToast returns an id and renders a toast into the stack', () => {
    const stack = ErrorToast.createStack(container, { duration: 0 });
    const id = stack.addToast('Something went wrong');
    expect(id).toMatch(/^toast-/);
    expect(stack.getToasts()).toEqual([{ id, message: 'Something went wrong' }]);
    expect(stack.element.children.length).toBe(1);
    expect(stack.element.children[0].textContent).toContain('Something went wrong');
  });

  it('stacks multiple toasts simultaneously', () => {
    const stack = ErrorToast.createStack(container, { duration: 0 });
    stack.addToast('First');
    stack.addToast('Second');
    stack.addToast('Third');
    expect(stack.getToasts().map((t) => t.message)).toEqual(['First', 'Second', 'Third']);
    expect(stack.element.children.length).toBe(3);
  });

  it('dismiss removes the named toast and returns true', () => {
    const stack = ErrorToast.createStack(container, { duration: 0 });
    const id = stack.addToast('hello');
    stack.addToast('world');
    expect(stack.dismiss(id)).toBe(true);
    expect(stack.getToasts().map((t) => t.message)).toEqual(['world']);
  });

  it('dismiss returns false for unknown id', () => {
    const stack = ErrorToast.createStack(container, { duration: 0 });
    expect(stack.dismiss('bogus')).toBe(false);
  });

  it('clicking the dismiss button removes the toast', () => {
    const stack = ErrorToast.createStack(container, { duration: 0 });
    stack.addToast('oops');
    const toast = stack.element.children[0];
    const btn = toast.children.find((c) => c.className === 'error-toast-dismiss');
    btn.click();
    expect(stack.getToasts().length).toBe(0);
  });

  it('auto-dismisses each toast independently after the configured duration', () => {
    vi.useFakeTimers();
    const stack = ErrorToast.createStack(container, { duration: 6000 });
    stack.addToast('first');
    vi.advanceTimersByTime(2000);
    stack.addToast('second');
    expect(stack.getToasts().length).toBe(2);
    vi.advanceTimersByTime(4000); // first hits 6s
    expect(stack.getToasts().map((t) => t.message)).toEqual(['second']);
    vi.advanceTimersByTime(2000); // second hits 6s
    expect(stack.getToasts().length).toBe(0);
  });

  it('destroy clears all toasts and removes the stack element', () => {
    const stack = ErrorToast.createStack(container, { duration: 0 });
    stack.addToast('a');
    stack.addToast('b');
    stack.destroy();
    expect(container.children).not.toContain(stack.element);
    expect(stack.getToasts().length).toBe(0);
  });

  it('throws if container is missing', () => {
    expect(() => ErrorToast.createStack(null)).toThrow();
  });
});
