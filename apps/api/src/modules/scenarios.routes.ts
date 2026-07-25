import type { FastifyInstance } from "fastify";
import type { Persona, Scenario } from "@aispeakpro/shared";
import { db } from "../db/index.js";
import { Errors } from "../http/errors.js";

function toScenarioDto(row: {
  id: string;
  slug: string;
  title: string;
  description: string;
  mode: string;
  difficulty: string;
  setting: string;
  objective: string;
  personas: unknown;
  beats: unknown;
}): Scenario {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    mode: row.mode as Scenario["mode"],
    difficulty: row.difficulty as Scenario["difficulty"],
    setting: row.setting,
    objective: row.objective,
    personas: (row.personas as Persona[]) ?? [],
    beats: (row.beats as string[]) ?? [],
  };
}

export async function scenarioRoutes(app: FastifyInstance) {
  app.get("/scenarios", async () => {
    const rows = await db
      .selectFrom("scenarios")
      .selectAll()
      .where("is_active", "=", true)
      .orderBy("difficulty", "asc")
      .execute();
    return rows.map(toScenarioDto);
  });

  app.get("/scenarios/:slug", async (req) => {
    const { slug } = req.params as { slug: string };
    const row = await db
      .selectFrom("scenarios")
      .selectAll()
      .where("slug", "=", slug)
      .executeTakeFirst();
    if (!row) throw Errors.notFound("Scenario not found");
    return toScenarioDto(row);
  });
}
