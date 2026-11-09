# ==========================================
# Étape 1 : build (dépendances complètes + compilation TypeScript)
# ==========================================
FROM node:22-alpine AS builder

# OpenSSL est requis par le moteur Prisma sous Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Dépendances d'abord : cette couche reste en cache tant que package*.json ne change pas
COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
RUN npx prisma generate

COPY src ./src
RUN npm run build

# Retire les dépendances de développement (le client Prisma généré est conservé)
RUN npm prune --omit=dev

# ==========================================
# Étape 2 : exécution (image légère, utilisateur non-root)
# ==========================================
FROM node:22-alpine AS runner

# OpenSSL pour Prisma ; npm/npx/corepack sont retirés : inutiles à l'exécution
# et sources de vulnérabilités remontées par Trivy
RUN apk add --no-cache openssl \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

ENV NODE_ENV=production \
    PORT=4000

WORKDIR /app

COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:4000/v1/health > /dev/null || exit 1

CMD ["node", "dist/server.js"]
