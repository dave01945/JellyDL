# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json* ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install

# Copy source and build
COPY . .

# Allow passing VITE_JELLYFIN_URL at build time
ARG VITE_JELLYFIN_URL=""
ENV VITE_JELLYFIN_URL=$VITE_JELLYFIN_URL

RUN npm run build

# ─── Stage 2: Serve ───────────────────────────────────────────────────────────
FROM nginx:1.25-alpine AS serve

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Custom nginx config: handles client-side routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
