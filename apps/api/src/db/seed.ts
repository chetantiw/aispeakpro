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

const courses = [
  {
    slug: "everyday-english",
    title: "Everyday English",
    description: "Build confidence for daily conversations.",
    goal: "daily",
    level: "A2",
    lessons: [
      { title: "Introduce yourself", kind: "tutor", focus: "introducing yourself: name, work, hobbies" },
      { title: "Order at a café", kind: "scene", scenarioSlug: "cafe-ordering" },
      { title: "Talk about your day", kind: "tutor", focus: "describing your daily routine in the past tense" },
      { title: "Describe your family", kind: "tutor", focus: "describing your family and relationships" },
    ],
  },
  {
    slug: "workplace-english",
    title: "English for Work",
    description: "Communicate clearly in an office.",
    goal: "work",
    level: "B1",
    lessons: [
      { title: "Daily standup", kind: "scene", scenarioSlug: "office-standup" },
      { title: "Talk about your job", kind: "tutor", focus: "describing your job role and responsibilities" },
      { title: "Debate: remote work", kind: "scene", scenarioSlug: "remote-work-debate" },
      { title: "Give a status update", kind: "tutor", focus: "giving a short project status update including a blocker" },
    ],
  },
  {
    slug: "interview-prep",
    title: "Job Interview Prep",
    description: "Practise the most common interview questions.",
    goal: "interview",
    level: "B1",
    lessons: [
      { title: "Tell me about yourself", kind: "tutor", focus: "answering 'tell me about yourself' concisely" },
      { title: "Strengths and weaknesses", kind: "tutor", focus: "discussing your strengths and weaknesses" },
      { title: "Why this job?", kind: "tutor", focus: "explaining why you want the role and the company" },
      { title: "Questions for the interviewer", kind: "tutor", focus: "asking thoughtful questions to an interviewer" },
    ],
  },
  {
    slug: "travel-english",
    title: "English for Travel",
    description: "Handle common travel situations with ease.",
    goal: "travel",
    level: "A2",
    lessons: [
      { title: "Order at a café", kind: "scene", scenarioSlug: "cafe-ordering" },
      { title: "Ask for directions", kind: "tutor", focus: "asking for and understanding directions" },
      { title: "At the hotel", kind: "tutor", focus: "checking in and asking about hotel facilities" },
      { title: "At the airport", kind: "tutor", focus: "airport check-in, security and boarding" },
    ],
  },
  {
    slug: "ielts-speaking",
    title: "IELTS Speaking",
    description: "Practise the three IELTS speaking parts.",
    goal: "exam",
    level: "B2",
    lessons: [
      { title: "Part 1: Familiar topics", kind: "tutor", focus: "IELTS Speaking Part 1: short answers about familiar topics" },
      { title: "Part 2: Long turn", kind: "tutor", focus: "IELTS Speaking Part 2: speaking for two minutes on a cue card" },
      { title: "Part 3: Discussion", kind: "tutor", focus: "IELTS Speaking Part 3: abstract discussion questions" },
    ],
  },
  {
    slug: "academic-english",
    title: "Academic English",
    description: "English for school and college.",
    goal: "academic",
    level: "B1",
    lessons: [
      { title: "Introduce your studies", kind: "tutor", focus: "talking about your studies and subjects" },
      { title: "Give a short presentation", kind: "tutor", focus: "presenting a topic to a class for two minutes" },
      { title: "Group discussion", kind: "scene", scenarioSlug: "remote-work-debate" },
    ],
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

  for (const c of courses) {
    await db
      .insertInto("courses")
      .values({
        slug: c.slug,
        title: c.title,
        description: c.description,
        goal: c.goal,
        level: c.level,
        lessons: JSON.stringify(c.lessons),
      })
      .onConflict((oc) => oc.column("slug").doNothing())
      .execute();
  }

  logger.info(`seeded ${scenarios.length} scenarios, ${courses.length} courses`);
  await closeDb();
}

main().catch((err) => {
  logger.error({ err }, "seed failed");
  process.exit(1);
});
