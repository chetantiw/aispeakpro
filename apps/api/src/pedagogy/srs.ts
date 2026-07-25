/**
 * SM-2 spaced-repetition scheduler (the SuperMemo-2 algorithm).
 * Pure function — the single most testable, highest-leverage piece of the
 * learning engine. Given a card's current state and a recall grade (0..5),
 * it returns the next state and the next due date.
 */
export interface SrsState {
  ease: number; // easiness factor, >= 1.3
  intervalDays: number; // days until next review
  repetitions: number; // consecutive successful recalls
}

export interface SrsResult extends SrsState {
  dueAt: Date;
}

const MIN_EASE = 1.3;

export function scheduleReview(state: SrsState, grade: number, now: Date = new Date()): SrsResult {
  const g = Math.max(0, Math.min(5, Math.round(grade)));

  let { ease, intervalDays, repetitions } = state;

  if (g < 3) {
    // Failed recall: reset the streak, review again tomorrow.
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * ease);
  }

  // Update easiness factor.
  ease = ease + (0.1 - (5 - g) * (0.08 + (5 - g) * 0.02));
  if (ease < MIN_EASE) ease = MIN_EASE;

  const dueAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return { ease, intervalDays, repetitions, dueAt };
}
