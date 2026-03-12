FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
COPY tsconfig.json ./

RUN npm ci

COPY shared/ shared/
COPY server/ server/
COPY client/ client/

RUN npm run build -w shared \
    && npm run build -w client \
    && npm run build -w server

# Run migrations on startup then start server
COPY <<'EOF' /app/start.sh
#!/bin/sh
node server/dist/migrate.js
node server/dist/index.js
EOF
RUN chmod +x /app/start.sh

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["/app/start.sh"]
