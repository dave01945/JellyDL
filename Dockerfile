# Runtime-only image. Build static assets locally with: npm run build
FROM nginx:1.25-alpine AS serve

# Copy built assets
COPY dist /usr/share/nginx/html

# Custom nginx config: handles client-side routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
