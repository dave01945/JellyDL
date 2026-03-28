#!/bin/sh
# JellyDL nginx config generator — runs at container startup via /docker-entrypoint.d/
# - JELLYFIN_INTERNAL_URL set   → substitutes URL into the proxy template
# - JELLYFIN_INTERNAL_URL unset → strips the proxy location block so nginx starts cleanly
set -e

CONF=/etc/nginx/conf.d/default.conf
BASE=/etc/nginx/jellydl

if [ -n "$JELLYFIN_INTERNAL_URL" ]; then
    envsubst '${JELLYFIN_INTERNAL_URL}' < "$BASE/default.conf.template" > "$CONF"
    echo "JellyDL: Jellyfin proxy enabled -> $JELLYFIN_INTERNAL_URL"
else
    sed '/# Proxy Jellyfin/,/^    }$/d' "$BASE/default.conf.template" > "$CONF"
    echo "JellyDL: JELLYFIN_INTERNAL_URL not set -- proxy disabled, direct URL override required"
fi
