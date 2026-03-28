# Runtime-only image. Build static assets locally with: npm run build
FROM nginx:1.25-alpine AS serve

# Version label — pass at build time: docker build --build-arg VERSION=$(node -p "require('./package.json').version")
ARG VERSION=dev
LABEL org.opencontainers.image.title="JellyDL" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/dave01945/WebUI"

# Copy built assets
COPY dist /usr/share/nginx/html

# Store nginx template outside the auto-processed /etc/nginx/templates/ directory.
# A custom entrypoint script generates the final config at startup, either
# substituting JELLYFIN_INTERNAL_URL (proxy enabled) or stripping the proxy
# location block entirely (proxy disabled, direct URL override mode).
RUN mkdir -p /etc/nginx/jellydl
COPY nginx.conf.template /etc/nginx/jellydl/default.conf.template
COPY docker-entrypoint.d/10-generate-nginx-conf.sh /docker-entrypoint.d/10-generate-nginx-conf.sh
RUN chmod +x /docker-entrypoint.d/10-generate-nginx-conf.sh

# Default to empty — container starts cleanly without this env var set.
ENV JELLYFIN_INTERNAL_URL=""

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
