# Redis Setup Guide for Delphi Legacy Code Analyser

This guide walks you through setting up Redis for the Delphi Legacy Code Analyser, step by step. Redis provides fast, real-time pipeline state monitoring. Without it, the app falls back to in-memory snapshots and PostgreSQL — everything still works, but you lose persistent sub-second state caching.

---

## Table of Contents

1. [How the App Uses Redis](#1-how-the-app-uses-redis)
2. [Option A: Upstash (Recommended for Cloud / Replit)](#2-option-a-upstash-recommended-for-cloud--replit)
3. [Option B: Self-Hosted Redis with Docker](#3-option-b-self-hosted-redis-with-docker)
4. [Option C: Local Redis (Development Only)](#4-option-c-local-redis-development-only)
5. [Wiring Redis to the App](#5-wiring-redis-to-the-app)
6. [Verifying the Connection](#6-verifying-the-connection)
7. [Troubleshooting](#7-troubleshooting)
8. [What Happens Without Redis](#8-what-happens-without-redis)

---

## 1. How the App Uses Redis

Redis serves two purposes in this app:

| Purpose | Redis Key Pattern | TTL |
|---------|------------------|-----|
| **Pipeline state snapshots** — current state, sub-state, progress percentage | `pipeline:{jobId}:state` | 24 hours |
| **Pipeline event history** — ordered list of all state transitions for a job | `pipeline:{jobId}:history` | 24 hours |

The app reads/writes these keys via the `ioredis` library. The connection is configured in `server/queue.ts` using two environment variables:

```
REDIS_HOST   (default: 127.0.0.1)
REDIS_PORT   (default: 6379)
```

At startup, the app probes Redis with a 3-second timeout. If Redis is unreachable, it logs a warning and disables all Redis features — the app continues to work using in-memory state and PostgreSQL as a fallback.

---

## 2. Option A: Upstash (Recommended for Cloud / Replit)

Upstash provides serverless Redis with a generous free tier (10,000 commands/day). This is the best option for Replit deployments because there is no Redis binary available in the production container.

### Step 1: Create an Upstash Account

1. Go to [https://upstash.com](https://upstash.com)
2. Sign up (GitHub/Google login works)
3. You land on the Upstash Console dashboard

### Step 2: Create a Redis Database

1. Click **"Create Database"**
2. Fill in the form:
   - **Name:** `delphi-analyser` (or any name you like)
   - **Region:** Choose the region closest to your deployment (e.g., `us-east-1` for US-based Replit)
   - **Type:** Leave as **Regional** (cheaper and fine for this use case)
   - **TLS:** Leave **enabled** (Upstash enables it by default)
3. Click **"Create"**

### Step 3: Copy Your Connection Details

After creation, you'll see a details page. You need three values:

| Field | Example Value |
|-------|---------------|
| **Endpoint** | `helped-crab-12345.upstash.io` |
| **Port** | `6379` |
| **Password** | `AXk2AAIjcDE...` (long alphanumeric string) |

You can also find a **Redis URL** on the page in this format:
```
rediss://default:AXk2AAIjcDE...@helped-crab-12345.upstash.io:6379
```

Keep this page open — you'll need these values in Step 5.

### Step 4: Update the App to Support TLS + Password

The current `server/queue.ts` connects with host + port only. Upstash requires a password and uses TLS (`rediss://`). You need to add support for the `REDIS_URL` environment variable.

Open `server/queue.ts` and find these lines at the top:

```typescript
const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");
```

Replace them with:

```typescript
const REDIS_URL = process.env.REDIS_URL || null;
const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");

function getRedisConfig(): Record<string, any> {
  if (REDIS_URL) {
    return {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
  return {
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

function createBaseRedisClient(extraOpts: Record<string, any> = {}): Redis {
  if (REDIS_URL) {
    return new Redis(REDIS_URL, { ...getRedisConfig(), ...extraOpts });
  }
  return new Redis({ ...getRedisConfig(), ...extraOpts });
}
```

Then update `initRedisConnection()` to use `createBaseRedisClient`:

```typescript
export async function initRedisConnection(): Promise<void> {
  try {
    const testConn = createBaseRedisClient({
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
```

And update `getRedisConnection()` and `createRedisClient()` to use `createBaseRedisClient` as well.

### Step 5: Set the Environment Variable

**On Replit:**

1. Open the **Secrets** panel (lock icon in the sidebar)
2. Add a new secret:
   - **Key:** `REDIS_URL`
   - **Value:** `rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT:6379`
3. Restart the app

**On Docker / self-hosted:**

Add to your `.env` file or `docker-compose.yml`:
```
REDIS_URL=rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT:6379
```

### Step 6: Restart and Verify

Restart the application. You should see in the logs:
```
[Redis] Connection verified — pipeline state monitoring enabled
```

If you see the fallback message instead, double-check your URL, password, and that TLS is correct (`rediss://` not `redis://`).

---

## 3. Option B: Self-Hosted Redis with Docker

If you're running the app via Docker Compose (the `docker-compose.yml` in this repo), Redis is already configured for you.

### Step 1: Verify docker-compose.yml

The file already includes a Redis service:

```yaml
redis:
  image: redis:7-alpine
  restart: unless-stopped
  ports:
    - "6379:6379"
  volumes:
    - redisdata:/data
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 5s
    retries: 5
```

And the app service already depends on it:

```yaml
app:
  depends_on:
    redis:
      condition: service_healthy
  environment:
    REDIS_URL: redis://redis:6379
```

### Step 2: Start Everything

```bash
docker compose up -d
```

Docker Compose will:
1. Start PostgreSQL and wait for it to be healthy
2. Start Redis and wait for it to respond to `PING`
3. Start the app, which connects to Redis at `redis://redis:6379`

### Step 3: Verify

```bash
# Check Redis is running
docker compose exec redis redis-cli ping
# Expected output: PONG

# Check app logs for Redis connection
docker compose logs app | grep -i redis
# Expected: [Redis] Connection verified — pipeline state monitoring enabled
```

---

## 4. Option C: Local Redis (Development Only)

This is what the app does automatically in the Replit development environment.

### On macOS

```bash
brew install redis
brew services start redis
```

### On Ubuntu / Debian

```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

### On Windows

Use WSL2 and follow the Ubuntu steps above, or download Redis for Windows from [https://github.com/microsoftarchive/redis/releases](https://github.com/microsoftarchive/redis/releases).

### Verify

```bash
redis-cli ping
# Expected output: PONG
```

No environment variables needed — the app defaults to `127.0.0.1:6379`.

---

## 5. Wiring Redis to the App

Here's a summary of which environment variables to set depending on your setup:

| Setup | Environment Variables |
|-------|----------------------|
| **Upstash / Remote Redis with TLS** | `REDIS_URL=rediss://default:PASSWORD@HOST:PORT` |
| **Remote Redis without TLS** | `REDIS_URL=redis://HOST:PORT` |
| **Docker Compose** | `REDIS_URL=redis://redis:6379` (already in docker-compose.yml) |
| **Local Redis** | None needed (defaults to `127.0.0.1:6379`) |
| **Local with custom port** | `REDIS_HOST=127.0.0.1` and `REDIS_PORT=6380` |

### Where to Set Them

**Replit Secrets panel:**
1. Click the lock icon in the left sidebar
2. Add `REDIS_URL` with your connection string
3. Restart the workflow

**Docker `.env` file:**
```env
REDIS_URL=redis://redis:6379
```

**Shell (temporary):**
```bash
export REDIS_URL=redis://localhost:6379
npm run dev
```

---

## 6. Verifying the Connection

### Check Startup Logs

When the app starts, look for one of these messages:

| Log Message | Meaning |
|-------------|---------|
| `[Redis] Already running` | Local redis-server was already running |
| `[Redis] Started successfully` | App started a local redis-server daemon |
| `[Redis] Connection verified — pipeline state monitoring enabled` | Successfully connected (local or remote) |
| `[Redis] Not available — pipeline state monitoring will use PostgreSQL fallback only` | Could not connect; app continues without Redis |

### Test via API

Once a pipeline has run, check the pipeline state endpoint:

```bash
# Replace JOB_ID with an actual analysis job ID
curl http://localhost:5000/api/pipeline/JOB_ID/state
```

If Redis is working, you'll get a response like:
```json
{
  "jobId": "abc-123",
  "projectId": "def-456",
  "state": "COMPLETED",
  "subState": null,
  "progress": 100,
  "startedAt": 1710000000000,
  "updatedAt": 1710000060000
}
```

If Redis is not connected, you'll get `null` (the endpoint falls back to in-memory state, which is empty if no pipeline has run since the last restart).

### Test Redis Directly

```bash
# Local or Docker
redis-cli ping

# Remote with password
redis-cli -h YOUR_HOST -p 6379 -a YOUR_PASSWORD ping

# Upstash (TLS)
redis-cli -h YOUR_HOST -p 6379 -a YOUR_PASSWORD --tls ping
```


## 7. Troubleshooting

### "Connection refused" at startup

**Cause:** No Redis server is listening on the configured host/port.

**Fix:**
- Local: Make sure `redis-server` is running (`redis-server --daemonize yes`)
- Docker: Make sure the Redis container is up (`docker compose ps`)
- Remote: Check your `REDIS_URL` is correct and the service is online

### "NOAUTH Authentication required"

**Cause:** Redis requires a password but none was provided.

**Fix:** Use `REDIS_URL` with the password embedded:
```
redis://default:YOUR_PASSWORD@HOST:PORT
```

### "WRONGPASS invalid username-password pair"

**Cause:** The password in your `REDIS_URL` is wrong.

**Fix:** Go back to your Redis provider dashboard and copy the password again. Make sure there are no extra spaces.

### "Connection timed out" or TLS handshake failures

**Cause:** Using `redis://` instead of `rediss://` for a TLS-enabled Redis, or vice versa.

**Fix:**
- Upstash and most cloud Redis: Use `rediss://` (with double s)
- Local/Docker Redis: Use `redis://` (single s)

### App starts but pipeline state is always null

**Cause:** Redis connected but no pipeline has run since the last restart, so there are no snapshots cached.

**Fix:** Run an analysis pipeline. The state endpoint will return data once the pipeline starts emitting events.

### "redis-server not available" warning at startup

**Cause:** The app tried to start a local `redis-server` daemon but the binary isn't installed (common in production deployments).

**Fix:** This is expected in production. If you see `[Redis] Connection verified` after this warning, Redis is connected via `REDIS_URL` and everything is fine. If you see the fallback message, set `REDIS_URL` to point to your Redis instance.

---

## 8. What Happens Without Redis

The app is designed to work with or without Redis. Here's what changes:

| Feature | With Redis | Without Redis |
|---------|-----------|---------------|
| Pipeline state snapshots | Stored in Redis (fast, 24h TTL) | Stored in-memory (lost on restart) |
| Pipeline event history | Stored in Redis + PostgreSQL | Stored in-memory + PostgreSQL |
| State API (`/api/pipeline/:id/state`) | Returns Redis snapshot | Returns in-memory snapshot |
| History API (`/api/pipeline/:id/history`) | Returns Redis history, falls back to PostgreSQL | Returns in-memory or PostgreSQL events |
| Active pipelines API (`/api/pipeline/active`) | Scans Redis keys | Returns in-memory active pipelines |
| Job completion / project data | Always PostgreSQL (unaffected) | Always PostgreSQL (unaffected) |
| MCP server pipeline tools | Uses Redis when available | Falls back to in-memory + PostgreSQL |

**Bottom line:** Redis makes pipeline monitoring faster and persistent across restarts, but the core analysis pipeline, job tracking, and all project data always use PostgreSQL regardless.
