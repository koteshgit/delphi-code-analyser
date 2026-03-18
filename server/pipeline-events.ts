import {
  PipelineState,
  SubState,
  EventType,
  VALID_TRANSITIONS,
  STEP_SUB_STATES,
  calculateProgress,
  type PipelineEvent,
  type PipelineSnapshot,
} from "./state-machine";
import {
  getRedisSnapshot,
  setRedisSnapshot,
  appendHistory,
  getHistory as getRedisHistory,
  pipelineMonitor,
  isRedisAvailable,
} from "./queue";
import { storage } from "./storage";

const inMemorySnapshots = new Map<string, PipelineSnapshot>();
const inMemoryHistory = new Map<string, PipelineEvent[]>();

async function getSnapshot(jobId: string): Promise<PipelineSnapshot | null> {
  if (isRedisAvailable()) {
    const snap = await getRedisSnapshot(jobId);
    if (snap) return snap;
  }
  return inMemorySnapshots.get(jobId) || null;
}

async function saveSnapshot(jobId: string, snapshot: PipelineSnapshot): Promise<void> {
  inMemorySnapshots.set(jobId, snapshot);
  await setRedisSnapshot(jobId, snapshot);
}

async function saveHistory(jobId: string, event: PipelineEvent): Promise<void> {
  const history = inMemoryHistory.get(jobId) || [];
  history.push(event);
  inMemoryHistory.set(jobId, history);
  await appendHistory(jobId, event);
}

export class PipelineEventBus {
  async initialize(): Promise<void> {
    console.log("[PipelineEventBus] Initialized — direct event processing mode (no worker duplication)");
  }

  async startPipeline(jobId: string, projectId: string): Promise<void> {
    const snapshot: PipelineSnapshot = {
      jobId,
      projectId,
      state: PipelineState.INITIALIZING,
      subState: null,
      completedSubStates: [],
      progress: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveSnapshot(jobId, snapshot);

    const event: PipelineEvent = {
      eventType: EventType.PIPELINE_STARTED,
      jobId,
      projectId,
      timestamp: Date.now(),
      state: PipelineState.INITIALIZING,
      message: "Pipeline started",
    };

    await saveHistory(jobId, event);
    await storage.addPipelineEvent(jobId, projectId, event);

    pipelineMonitor.emit("event", event);
  }

  async transitionState(jobId: string, projectId: string, newState: PipelineState, message?: string): Promise<void> {
    const snapshot = await getSnapshot(jobId);
    if (!snapshot) {
      console.error(`[PipelineEventBus] No snapshot found for job ${jobId}`);
      return;
    }

    const previousState = snapshot.state;

    if (previousState === newState) {
      return;
    }

    const validTargets = VALID_TRANSITIONS[previousState];
    if (!validTargets?.includes(newState)) {
      console.error(`[PipelineEventBus] Invalid transition: ${previousState} -> ${newState}`);
      return;
    }

    snapshot.state = newState;
    snapshot.subState = null;
    snapshot.completedSubStates = [];
    snapshot.progress = calculateProgress(newState, null, []);
    snapshot.updatedAt = Date.now();

    if (newState === PipelineState.FAILED) {
      snapshot.error = message;
    }

    await saveSnapshot(jobId, snapshot);

    const event: PipelineEvent = {
      eventType: EventType.STATE_TRANSITION,
      jobId,
      projectId,
      timestamp: Date.now(),
      state: newState,
      previousState,
      message: message || `Transitioned to ${newState}`,
    };

    await saveHistory(jobId, event);
    await storage.addPipelineEvent(jobId, projectId, event);

    pipelineMonitor.emit("event", event);
    pipelineMonitor.emit("stateChange", {
      jobId,
      state: newState,
      previousState,
    });
  }

  async enterSubState(jobId: string, projectId: string, state: PipelineState, subState: SubState, message?: string): Promise<void> {
    const snapshot = await getSnapshot(jobId);
    if (!snapshot) return;

    if (snapshot.state !== state) {
      return;
    }

    const validSubStates = STEP_SUB_STATES[state];
    if (!validSubStates?.includes(subState)) {
      console.error(`[PipelineEventBus] Invalid sub-state ${subState} for state ${state}`);
      return;
    }

    snapshot.subState = subState;
    snapshot.updatedAt = Date.now();
    await saveSnapshot(jobId, snapshot);

    const event: PipelineEvent = {
      eventType: EventType.SUB_STATE_ENTERED,
      jobId,
      projectId,
      timestamp: Date.now(),
      state,
      subState,
      message,
    };

    await saveHistory(jobId, event);
    await storage.addPipelineEvent(jobId, projectId, event);

    pipelineMonitor.emit("event", event);
  }

  async completeSubState(jobId: string, projectId: string, state: PipelineState, subState: SubState, metadata?: Record<string, any>): Promise<void> {
    const snapshot = await getSnapshot(jobId);
    if (!snapshot) return;

    if (snapshot.state !== state) {
      return;
    }

    const validSubStates = STEP_SUB_STATES[state];
    if (!validSubStates?.includes(subState)) {
      return;
    }

    if (!snapshot.completedSubStates.includes(subState)) {
      snapshot.completedSubStates.push(subState);
    }

    snapshot.progress = calculateProgress(state, subState, snapshot.completedSubStates);
    snapshot.updatedAt = Date.now();
    snapshot.metrics = { ...snapshot.metrics, ...metadata };
    await saveSnapshot(jobId, snapshot);

    const event: PipelineEvent = {
      eventType: EventType.SUB_STATE_COMPLETED,
      jobId,
      projectId,
      timestamp: Date.now(),
      state,
      subState,
      message: `Sub-state ${subState} completed`,
      metadata,
    };

    await saveHistory(jobId, event);
    await storage.addPipelineEvent(jobId, projectId, event);

    pipelineMonitor.emit("event", event);
  }

  async completePipeline(jobId: string, projectId: string, metrics?: Record<string, any>): Promise<void> {
    const snapshot = await getSnapshot(jobId);
    if (!snapshot) return;

    snapshot.state = PipelineState.COMPLETED;
    snapshot.progress = 100;
    snapshot.updatedAt = Date.now();
    snapshot.metrics = { ...snapshot.metrics, ...metrics };
    await saveSnapshot(jobId, snapshot);

    const event: PipelineEvent = {
      eventType: EventType.PIPELINE_COMPLETED,
      jobId,
      projectId,
      timestamp: Date.now(),
      state: PipelineState.COMPLETED,
      message: "Pipeline completed successfully",
      metadata: metrics,
    };

    await saveHistory(jobId, event);
    await storage.addPipelineEvent(jobId, projectId, event);

    pipelineMonitor.emit("event", event);
  }

  async failPipeline(jobId: string, projectId: string, error: string): Promise<void> {
    const snapshot = await getSnapshot(jobId);
    if (!snapshot) return;

    snapshot.state = PipelineState.FAILED;
    snapshot.error = error;
    snapshot.updatedAt = Date.now();
    await saveSnapshot(jobId, snapshot);

    const event: PipelineEvent = {
      eventType: EventType.PIPELINE_FAILED,
      jobId,
      projectId,
      timestamp: Date.now(),
      state: PipelineState.FAILED,
      message: error,
    };

    await saveHistory(jobId, event);
    await storage.addPipelineEvent(jobId, projectId, event);

    pipelineMonitor.emit("event", event);
  }

  async getState(jobId: string): Promise<PipelineSnapshot | null> {
    return getSnapshot(jobId);
  }

  async getHistory(jobId: string): Promise<PipelineEvent[]> {
    if (isRedisAvailable()) {
      const redisHistory = await getRedisHistory(jobId);
      if (redisHistory.length > 0) return redisHistory;
    }
    return inMemoryHistory.get(jobId) || [];
  }

  async shutdown(): Promise<void> {
    console.log("[PipelineEventBus] Shut down");
  }
}

export const pipelineEventBus = new PipelineEventBus();
