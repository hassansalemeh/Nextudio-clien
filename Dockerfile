# Nextudio Control: production image for Railway (or any Docker host).
# One container serves the website AND the API, and includes Chromium so quotation / invoice PDFs work.
# Secrets are NEVER baked in: DATABASE_URL etc. are supplied as environment variables when the container runs.

# ---------- 1. build: compile the server and the website ----------
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY . .
RUN npm --prefix server ci \
 && npm --prefix client ci \
 && node scripts/package-godaddy.mjs --no-zip
# result: /src/deploy/godaddy  (dist/, public/, assets/, migrations/, package.json, package-lock.json, app.js)

# ---------- 2. runtime: small image with Chromium for PDFs ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PDF_BROWSER_PATH=/usr/bin/chromium \
    PDF_NO_SANDBOX=true
# chromium + fonts (Liberation = Arial-compatible, DejaVu/Noto = wide character coverage for names and text)
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-dejavu-core fonts-noto-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /src/deploy/godaddy/package.json /src/deploy/godaddy/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /src/deploy/godaddy/ ./

# do not run as root
USER node

# The host (Railway) provides PORT; the server listens on process.env.PORT.
# Health check: the app answers {"status":"ok","database":"ok"} only when the database is reachable.
HEALTHCHECK --interval=30s --timeout=8s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# same command as "npm start" (node dist/index.js), run directly so the app receives stop signals
CMD ["node", "dist/index.js"]
