/**
 * Tiny pub/sub for opening the command search palette (Ctrl+K) from anywhere —
 * a keyboard shortcut in this module, and (soon) a search trigger in page
 * headers. A single window event beats prop-drilling through layouts, the
 * same pattern as alert-events.ts.
 */

export const OPEN_COMMAND_SEARCH_EVENT = "command-search:open";

/** Broadcast that the command palette should open. */
export function openCommandSearch() {
  window.dispatchEvent(new Event(OPEN_COMMAND_SEARCH_EVENT));
}
