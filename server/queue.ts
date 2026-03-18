import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { EventEmitter } from "events";
import type { PipelineEvent, PipelineSnapshot } from "./state-machine";
import { PipelineState, SubState, EventType, VALID_TRANSITIONS, STEP_SUB_STATES, calculateProgress } from "./state-machine";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");

let redisConnection: Redis | null = null;
let redisAvailable = false;

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export function getRedisConnection(): Redis | null {
  if (!redisAvailable) return null;
  if (!redisConnection) {
    redisConnection = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        if (times > 3) {
          redisAvailable = false;
          console.warn("[Redis] Connection lost after retries, disabling Redis features");
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });
    redisConnection.on("error", () => {});
  }
  return redisConnection;
}

export async function initRedisConnection(): Promise<void> {
  try {
    const testConn = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      connectTimeout: 3000,
      retryStrategy: () => null,
      lazyConnect: true,
    });
    testConn.on("error", () => {});
    await testConn.connect();
    await testConn.ping();
    await testConn.quit();
    redisAvailable = true;
    console.log("[Redis] Connection verified — pipeline state monitoring enabled");
  } catch {
    redisAvailable = false;
    console.warn("[Redis] Not available — pipeline state monitoring will use PostgreSQL fallback only");
  }
}

export function createRedisClient(): Redis | null {
  if (!redisAvailable) return null;
  const client = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
  });
  client.on("error", () => {});
  return client;
}

const PIPELINE_EVENTS_QUEUE = "pipeline-events";
const STATE_TRANSITIONS_QUEUE = "state-transitions";

export const pipelineMonitor = new EventEmitter();
pipelineMonitor.setMaxListeners(100);

let pipelineEventsQueue: Queue | null = null;
let stateTransitionsQueue: Queue | null = null;

export function getPipelineEventsQueue(): Queue | null {
  if (!redisAvailable) return null;
  if (!pipelineEventsQueue) {
    const conn = createRedisClient();
    if (!conn) return null;
    pipelineEventsQueue = new Queue(PIPELINE_EVENTS_QUEUE, {
      connection: conn,
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return pipelineEventsQueue;
}

export function getStateTransitionsQueue(): Queue | null {
  if (!redisAvailable) return null;
  if (!stateTransitionsQueue) {
    const conn = createRedisClient();
    if (!conn) return null;
    stateTransitionsQueue = new Queue(STATE_TRANSITIONS_QUEUE, {
      connection: conn,
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return stateTransitionsQueue;
}

export async function publishEvent(event: PipelineEvent): Promise<void> {
  const queue = getPipelineEventsQueue();
  if (queue) {
    try {
      await queue.add(event.eventType, event, {
        jobId: `${event.jobId}-${event.eventType}-${event.timestamp}`,
      });
    } catch {}
  }
  pipelineMonitor.emit("event", event);
}

export async function publishStateTransition(event: PipelineEvent): Promise<void> {
  const queue = getStateTransitionsQueue();
  if (!queue) return;
  try {
    await queue.add("transition", event, {
      jobId: `${event.jobId}-transition-${event.timestamp}`,
    });
  } catch {}
}

export function createStateTransitionWorker(
  onTransition: (event: PipelineEvent) => Promise<void>
): Worker | null {
  const conn = createRedisClient();
  if (!conn) return null;
  const worker = new Worker(
    STATE_TRANSITIONS_QUEUE,
    async (job: Job) => {
      const event = job.data as PipelineEvent;
      await onTransition(event);
    },
    {
      connection: conn,
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[StateTransitionWorker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

export function createPipelineEventWorker(
  onEvent: (event: PipelineEvent) => Promise<void>
): Worker | null {
  const conn = createRedisClient();
  if (!conn) return null;
  const worker = new Worker(
    PIPELINE_EVENTS_QUEUE,
    async (job: Job) => {
      const event = job.data as PipelineEvent;
      await onEvent(event);
    },
    {
      connection: conn,
      concurrency: 10,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[PipelineEventWorker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

export async function getRedisSnapshot(jobId: string): Promise<PipelineSnapshot | null> {
  const redis = getRedisConnection();
  if (!redis) return null;
  try {
    const raw = await redis.get(`pipeline:${jobId}:state`);
    if (!raw) return null;
    return JSON.parse(raw) as PipelineSnapshot;
  } catch {
    return null;
  }
}

export async function setRedisSnapshot(jobId: string, snapshot: PipelineSnapshot): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  try {
    await redis.set(`pipeline:${jobId}:state`, JSON.stringify(snapshot), "EX", 86400);
  } catch {}
}

export async function appendHistory(jobId: string, event: PipelineEvent): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  try {
    const historyKey = `pipeline:${jobId}:history`;
    await redis.rpush(historyKey, JSON.stringify(event));
    await redis.expire(historyKey, 86400);
  } catch {}
}

export async function getHistory(jobId: string): Promise<PipelineEvent[]> {
  const redis = getRedisConnection();
  if (!redis) return [];
  try {
    const items = await redis.lrange(`pipeline:${jobId}:history`, 0, -1);
    return items.map(item => JSON.parse(item) as PipelineEvent);
  } catch {
    return [];
  }
}

export async function getActivePipelines(): Promise<PipelineSnapshot[]> {
  const redis = getRedisConnection();
  if (!redis) return [];
  try {
    const keys = await redis.keys("pipeline:*:state");
    const snapshots: PipelineSnapshot[] = [];
    for (const key of keys) {
      const raw = await redis.get(key);
      if (raw) {
        const snapshot = JSON.parse(raw) as PipelineSnapshot;
        if (snapshot.state !== PipelineState.COMPLETED && snapshot.state !== PipelineState.FAILED) {
          snapshots.push(snapshot);
        }
      }
    }
    return snapshots;
  } catch {
    return [];
  }
}

export async function cleanupPipelineData(jobId: string): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  try {
    await redis.del(`pipeline:${jobId}:state`, `pipeline:${jobId}:history`);
  } catch {}
}
