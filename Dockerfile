# ============================================================
# Stage 1: Compile DelphiAST CLI from Pascal source
# Free Pascal Compiler (fpc) is available for amd64 AND arm64
# in Debian repos, so this stage produces the correct binary
# for whatever platform docker buildx targets.
# ============================================================
FROM debian:bookworm-slim AS fpc-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    fpc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy Pascal source library and CLI entry point
COPY delphiast/Source/ ./delphiast/Source/
COPY python/parser/delphiast_cli.lpr ./

# Compile natively for the target architecture.
# -Mdelphi sets Delphi compatibility mode for ALL units (not just the .lpr),
# which is required because the SimpleParser units use Delphi conventions
# (lowercase 'result', etc.) without their own {$MODE} directive.
RUN fpc \
    -Mdelphi \
    -Fu./delphiast/Source \
    -Fu./delphiast/Source/SimpleParser \
    -Fu./delphiast/Source/FreePascalSupport \
    -Fu./delphiast/Source/FreePascalSupport/FPC_StringBuilder \
    -Fi./delphiast/Source/SimpleParser \
    -o./delphiast_cli \
    ./delphiast_cli.lpr

# ============================================================
# Stage 2: Build the Node.js application
# ============================================================
FROM node:20-bookworm AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ============================================================
# Stage 3: Production image
# ============================================================
FROM node:20-bookworm-slim AS production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    git ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Python virtual environment
RUN python3 -m venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
COPY pyproject.toml ./
RUN pip install --no-cache-dir psycopg2-binary anthropic

# Node application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Config files needed for drizzle-kit schema push at startup
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/tsconfig.json ./

# Python pipeline and shared schema
COPY python/ ./python/
COPY shared/ ./shared/

# Overwrite the platform-specific pre-compiled binary with the
# natively compiled one from Stage 1
COPY --from=fpc-builder /build/delphiast_cli ./python/parser/delphiast_cli
RUN chmod +x ./python/parser/delphiast_cli

# Persistent storage dirs
RUN mkdir -p /tmp/repos /tmp/uploads /app/logs/parser

# Entrypoint: runs DB migration then starts the app
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

# Give extra time for migrations on first boot
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:5000/api/projects || exit 1

ENTRYPOINT ["./entrypoint.sh"]
