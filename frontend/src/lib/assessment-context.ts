// Explicitly consented result context stays in memory and is consumed once.
let pending: string | null = null;
export function setAssessmentContext(value: string | null) { pending = value; }
export function takeAssessmentContext() { const value = pending; pending = null; return value; }
