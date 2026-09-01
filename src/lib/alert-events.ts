/**
 * Tiny pub/sub for keeping the nav badge's alert count in sync with page
 * actions. The alerts page and the service-records pages dispatch
 * `alert-count:changed` after any mutation that could change the active alert
 * set (a dismiss, a status transition); AppNav listens and refetches the
 * count. A full event bus is overkill — one custom window event is enough at
 * this project's scale, and it beats prop-drilling through layouts.
 */

export const ALERT_COUNT_EVENT = "alert-count:changed";

/** Broadcast that the active alert set may have changed. */
export function notifyAlertCountChanged() {
  window.dispatchEvent(new Event(ALERT_COUNT_EVENT));
}
