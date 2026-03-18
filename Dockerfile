# ============================================================
# Stage 1: Build the Node.js application
# ============================================================
FROM node:20-bookworm AS builder

WORKDIR /app

# Install system deps for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ============================================================
# Stage 2: Production image
# ============================================================
FROM node:20-bookworm-slim AS production

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    git ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Create Python virtual environment and install deps
RUN python3 -m venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
COPY pyproject.toml ./
RUN pip install --no-cache-dir psycopg2-binary anthropic

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy Python agents and parser
COPY python/ ./python/
COPY shared/ ./shared/

# Copy the compiled DelphiAST binary (x86_64 Linux)
# If targeting ARM64, you will need to recompile — see Troubleshooting
COPY python/parser/delphiast_cli ./python/parser/delphiast_cli
RUN chmod +x ./python/parser/delphiast_cli || true

# Create necessary directories
RUN mkdir -p /tmp/repos /tmp/uploads /app/logs/parser

# Expose the application port
EXPOSE 5000

# Environment defaults
ENV NODE_ENV=production
ENV PORT=5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5000/api/projects || exit 1

# Start the application
CMD ["node", "dist/index.cjs"]
