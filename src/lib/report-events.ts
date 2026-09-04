/**
 * Tiny pub/sub mirroring alert-events.ts: pages broadcast that the current
 * user's daily report for today has been submitted/updated so the 5 PM
 * reminder banner can refetch and disappear.
 */

export const REPORT_SUBMITTED_EVENT = "report-submitted";

/** Broadcast that today's daily report was just filed or updated. */
export function notifyReportSubmitted() {
  window.dispatchEvent(new Event(REPORT_SUBMITTED_EVENT));
}
