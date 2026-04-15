/**
 * DOM & formatting utilities ported from v1.
 * Pure functions only — no API calls, no fetch, no endpoint references.
 */

/**
 * Select a single DOM element.
 * @param {string} selector
 * @param {Element|Document} parent
 * @returns {Element|null}
 */
function $(selector, parent) {
  return (parent || document).querySelector(selector);
}

/**
 * Select all matching DOM elements.
 * @param {string} selector
 * @param {Element|Document} parent
 * @returns {Element[]}
 */
function $$(selector, parent) {
  return Array.from((parent || document).querySelectorAll(selector));
}

/**
 * Format a date string as a locale-friendly display string.
 * @param {string|Date} date
 * @returns {string}
 */
function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Truncate a string to a maximum length, appending ellipsis if needed.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen) {
  if (typeof str !== 'string') return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

/**
 * Capitalize the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
  if (typeof str !== 'string' || str.length === 0) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Simple debounce utility.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// Export for testing (Node/CommonJS environment detection)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatDate, truncate, capitalize, debounce };
}
