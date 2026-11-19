# ---------- Build stage ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# `npm run build` = prisma generate && nest build  -> dist/src/main.js
RUN npm run build

# ---------- Runtime stage ----------
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# node_modules is kept whole: the Prisma CLI (devDependency) is needed at
# startup to run `prisma migrate deploy`.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts /app/package.json ./
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

# Apply migrations -> seed first admin (only if no users) -> start the API
CMD ["sh", "-c", "npx prisma migrate deploy && node scripts/seed-admin.js && node dist/src/main.js"]
