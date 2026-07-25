import { describe, expect, it } from "vitest";
import { heuristicFeedback } from "./feedback.js";
import type { CefrProfile } from "@aispeakpro/shared";

const profile: CefrProfile = { speaking: "A2", listening: "A2", vocabulary: "A2", grammar: "A2" };

describe("heuristicFeedback", () => {
  it("detects article omission", () => {
    const fb = heuristicFeedback(["Yesterday i go to market with friend"], profile);
    const err = fb.errors.find((e) => e.category === "article_omission");
    expect(err).toBeDefined();
    expect(err?.correction.toLowerCase()).toContain("go to the market");
  });

  it("flags lowercase i", () => {
    const fb = heuristicFeedback(["i think it is good"], profile);
    expect(fb.errors.some((e) => e.category === "capitalization")).toBe(true);
  });

  it("mines candidate vocabulary and echoes the CEFR profile", () => {
    const fb = heuristicFeedback(["I enjoyed the wonderful presentation yesterday"], profile);
    expect(fb.newVocabulary).toContain("wonderful");
    expect(fb.cefrEstimate).toEqual(profile);
  });

  it("always returns at least one strength and focus area", () => {
    const fb = heuristicFeedback(["ok"], profile);
    expect(fb.strengths.length).toBeGreaterThan(0);
    expect(fb.focusAreas.length).toBeGreaterThan(0);
  });
});
