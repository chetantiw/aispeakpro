import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env, redisEnabled } from "./env.js";
import { logger } from "./logger.js";
import { processFeedback, type FeedbackJobData } from "./jobs/feedback.job.js";

export const FEEDBACK_QUEUE = "session-feedback";

/**
 * A single connection is shared by the queue producer. BullMQ requires
 * `maxRetriesPerRequest: null` on its Redis client.
 */
let connection: IORedis | null = null;
let feedbackQueue: Queue<FeedbackJobData> | null = null;

if (redisEnabled) {
  connection = new IORedis(env.REDIS_URL as string, { maxRetriesPerRequest: null });
  feedbackQueue = new Queue<FeedbackJobData>(FEEDBACK_QUEUE, { connection });
}

/**
 * Enqueue post-session analysis. When Redis is configured the work runs in the
 * dedicated worker process; otherwise it runs inline so the app is fully
 * functional in single-process / local dev with no extra infrastructure.
 */
export async function enqueueFeedback(data: FeedbackJobData): Promise<void> {
  if (feedbackQueue) {
    await feedbackQueue.add("analyze", data, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  } else {
    try {
      await processFeedback(data);
    } catch (err) {
      logger.error({ err, data }, "inline feedback failed");
    }
  }
}

export function getRedisConnection(): IORedis | null {
  return connection;
}
