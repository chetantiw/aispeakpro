import { db, closeDb } from "./index.js";
import { logger } from "../logger.js";

/** Seed a small library of authored scenarios for scene-based learning. */
const scenarios = [
  {
    slug: "cafe-ordering",
    title: "Ordering at a café",
    description: "Order a drink and a snack, then handle a small surprise (they're out of your choice).",
    mode: "scene",
    difficulty: "A2",
    setting: "A busy coffee shop counter.",
    objective: "Successfully order, respond to a follow-up question, and pay.",
    personas: [
      {
        id: "barista",
        name: "Maya",
        role: "the barista",
        voice: "warm-female",
        persona: "Friendly and quick. Asks size, milk preference, and offers a pastry. If the learner orders a muffin, say they just sold out and suggest a croissant.",
      },
    ],
    beats: ["greeting", "take order", "upsell/complication", "payment", "goodbye"],
  },
  {
    slug: "office-standup",
    title: "Daily standup at the office",
    description: "Give your update in a team standup and answer a manager's follow-up.",
    mode: "scene",
    difficulty: "B1",
    setting: "A morning engineering standup over a video call.",
    objective: "Report yesterday's work, today's plan, and a blocker; answer one probing question.",
    personas: [
      {
        id: "manager",
        name: "Ravi",
        role: "the engineering manager",
        voice: "neutral-male",
        persona: "Supportive but probing. After the learner's update, asks one clarifying question about their blocker.",
      },
      {
        id: "peer",
        name: "Sara",
        role: "a teammate",
        voice: "neutral-female",
        persona: "Offers to help with the blocker in one short sentence.",
      },
    ],
    beats: ["manager opens", "learner update", "manager follow-up", "peer offers help", "wrap up"],
  },
  {
    slug: "remote-work-debate",
    title: "Debate: is remote work better?",
    description: "Take a side in a friendly debate about remote versus office work.",
    mode: "scene",
    difficulty: "B2",
    setting: "A casual debate club.",
    objective: "State a position, give two reasons, and rebut one counterargument.",
    personas: [
      {
        id: "opponent",
        name: "Dan",
        role: "the opposing debater",
        voice: "neutral-male",
        persona: "Argues the opposite of whatever the learner argues. Concise, challenging, but respectful.",
      },
      {
        id: "moderator",
        name: "Priya",
        role: "the moderator",
        voice: "warm-female",
        persona: "Keeps time, invites each side to speak, and asks the learner to respond to Dan's point.",
      },
    ],
    beats: ["moderator opens", "learner position", "opponent rebuts", "learner rebuts", "moderator closes"],
  },
] as const;

async function main() {
  for (const s of scenarios) {
    await db
      .insertInto("scenarios")
      .values({
        slug: s.slug,
        title: s.title,
        description: s.description,
        mode: s.mode,
        difficulty: s.difficulty,
        setting: s.setting,
        objective: s.objective,
        personas: JSON.stringify(s.personas),
        beats: JSON.stringify(s.beats),
      })
      .onConflict((oc) => oc.column("slug").doNothing())
      .execute();
  }
  logger.info(`seeded ${scenarios.length} scenarios`);
  await closeDb();
}

main().catch((err) => {
  logger.error({ err }, "seed failed");
  process.exit(1);
});
