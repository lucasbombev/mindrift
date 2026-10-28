# Drift Rent — imagem de produção local (LAN)
# Build multi-stage; o frontend é compilado e servido pelo próprio Express.
FROM node:24-bookworm-slim AS builder

WORKDIR /app
# Ferramentas para compilar better-sqlite3 caso não haja binário pré-compilado.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --no-audit --no-fund

COPY backend ./backend
COPY frontend ./frontend
COPY scripts ./scripts
RUN npm run build

# Remove artefatos de desenvolvimento para reduzir a imagem.
RUN npm prune --omit=dev --workspaces --include-workspace-root || true

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    TZ=America/Fortaleza

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/frontend ./frontend
COPY --from=builder /app/scripts ./scripts

# As pastas são volumes no compose; criadas aqui para uso sem volume também.
RUN mkdir -p backend/data backend/uploads backend/backups backend/certs

EXPOSE 3000 3443

HEALTHCHECK --interval=30s --timeout=6s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/src/server.js"]
