// Grace period for overdue DUE service records, shared across the app.
// Module 7's dashboard imports this constant; Module 9's isOverdue() uses it
// too — the definition lives here, in one place.
export const GRACE_PERIOD_DAYS = Number(process.env.OVERDUE_GRACE_DAYS ?? 7);
