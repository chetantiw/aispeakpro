import { describe, expect, it } from "vitest";
import { scheduleReview, type SrsState } from "./srs.js";

const fresh: SrsState = { ease: 2.5, intervalDays: 0, repetitions: 0 };
const now = new Date("2026-01-01T00:00:00Z");

describe("scheduleReview (SM-2)", () => {
  it("schedules first successful review one day out", () => {
    const r = scheduleReview(fresh, 5, now);
    expect(r.repetitions).toBe(1);
    expect(r.intervalDays).toBe(1);
    expect(r.dueAt.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("uses the classic 1 -> 6 day jump on the second success", () => {
    const first = scheduleReview(fresh, 4, now);
    const second = scheduleReview(first, 4, now);
    expect(second.repetitions).toBe(2);
    expect(second.intervalDays).toBe(6);
  });

  it("multiplies by ease from the third success onward", () => {
    let s: SrsState = fresh;
    s = scheduleReview(s, 5, now); // interval 1
    s = scheduleReview(s, 5, now); // interval 6
    const third = scheduleReview(s, 5, now); // 6 * ease
    expect(third.intervalDays).toBeGreaterThan(6);
  });

  it("resets the streak on a failed recall", () => {
    const good = scheduleReview(fresh, 5, now);
    const failed = scheduleReview(good, 1, now);
    expect(failed.repetitions).toBe(0);
    expect(failed.intervalDays).toBe(1);
  });

  it("never lets ease drop below 1.3", () => {
    let s: SrsState = fresh;
    for (let i = 0; i < 10; i++) s = scheduleReview(s, 0, now);
    expect(s.ease).toBeGreaterThanOrEqual(1.3);
  });
});
