# syntax=docker/dockerfile:1
#
# ExpressHub image. Vercel does not use this file; it is for local stacks and self-hosting.
# Targets: "tools" (migrations and seeds, has the Prisma CLI) and "runner" (the app, the default).

FROM node:22-bookworm-slim AS base
# Prisma's query engine needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Scripts are skipped; `npm run build` runs `prisma generate` itself.
RUN npm ci --ignore-scripts

FROM deps AS builder
COPY . .
# Switches next.config.ts to the standalone output. Vercel builds never set this.
ENV DOCKER_BUILD=1
# The build only needs a well-formed URL. It does not connect to the database.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

# Migrations and seed scripts. Compose runs this target as a one-shot job.
FROM builder AS tools
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
# The help chat reads these at runtime and the file tracer cannot see them.
COPY --from=builder --chown=app:app /app/docs/help ./docs/help
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
