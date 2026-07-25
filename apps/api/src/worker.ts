import { Worker } from "bullmq";
import { env, redisEnabled } from "./env.js";
import { logger } from "./logger.js";
import { FEEDBACK_QUEUE } from "./queue.js";
import { processFeedback, type FeedbackJobData } from "./jobs/feedback.job.js";
import IORedis from "ioredis";

/**
 * Dedicated worker process for the async pedagogy pipeline. Scales
 * independently of the API tier — run N of these behind the same Redis.
 */
if (!redisEnabled) {
  logger.error("REDIS_URL not set; worker has nothing to consume. Feedback runs inline in the API instead.");
  process.exit(1);
}

const connection = new IORedis(env.REDIS_URL as string, { maxRetriesPerRequest: null });

const worker = new Worker<FeedbackJobData>(
  FEEDBACK_QUEUE,
  async (job) => {
    await processFeedback(job.data);
  },
  { connection, concurrency: 5 },
);

worker.on("completed", (job) => logger.info({ jobId: job.id }, "feedback job done"));
worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "feedback job failed"));

logger.info("feedback worker started");
