# JellyDL WebUI

Vue 3 + Vite web UI for browsing Jellyfin media and managing download/transcode flows.

## Requirements

- Node.js 20+
- npm 10+
- Docker
- VS Code (optional, for task automation)
- **Jellyfin plugin: [TranscodeDownload](https://github.com/dave01945/Jellyfin.Plugin.TranscodeDownload)** — required on your Jellyfin server for the transcode/download API endpoints used by this UI

## Local Development

Install dependencies:

```bash
npm install
```

Start dev server:

```bash
npm run dev
```

Build production assets:

```bash
npm run build
```

## Configuration

### Jellyfin Internal URL (Docker)

JellyDL proxies all Jellyfin API calls through a `/jellyfin/` route on the nginx server. This lets the container reach Jellyfin using its **internal Docker network address**, with no CORS issues and no need for clients to have a direct route to Jellyfin.

Set `JELLYFIN_INTERNAL_URL` in your compose file (or as a Docker environment variable) to point at your Jellyfin instance:

```yaml
environment:
  JELLYFIN_INTERNAL_URL: http://jellyfin:8096
```

The nginx config is a template (`nginx.conf.template`). The official `nginx:alpine` image automatically runs `envsubst` on it at container startup, so no custom entrypoint is needed.

### Jellyfin URL — optional override (Settings page)

The **Server URL** field in the Settings page is optional:

- **Leave blank** (recommended): all Jellyfin API calls go through the `/jellyfin` proxy. This is the default behaviour and works out of the box with Docker Compose.
- **Fill in a URL** (e.g. `http://192.168.1.100:8096`): API calls go directly to that address. Use this for direct access scenarios where the proxy isn't available.

### Development

Copy `.env.example` to `.env` and set `VITE_JELLYFIN_URL` to your Jellyfin server. The Vite dev server maps both `/jellyfin/*` and `/api/*` to that URL, mirroring the production nginx proxy.

```env
VITE_JELLYFIN_URL=http://192.168.1.100:8096
```

## Docker

This project uses a runtime-only nginx image.
Build the web assets first, then build the Docker image.

Build assets:

```bash
npm run build
```

Build image:

```bash
docker build -t ghcr.io/dave01945/jellydl:latest .
```

Run locally:

```bash
docker run --rm -p 8080:80 ghcr.io/dave01945/jellydl:latest
```

Open: `http://localhost:8080`

## Deploy With Docker Compose

Local build-based compose:

```bash
docker compose up -d --build
```

Remote deploy (prebuilt image):

```bash
docker compose -f docker-compose.deploy.yml up -d
```

## Publish to GHCR

1. Create a GitHub PAT with `write:packages` scope.
2. Add credentials and image details to a local `.env` file in project root.

Example `.env`:

```env
IMAGE_REPO=ghcr.io/dave01945/jellydl
GHCR_USERNAME=dave01945
GHCR_TOKEN=your_github_pat_here
```

The VS Code build/push tasks source `.env` automatically, so no prompts are shown for the registry or username.

## VS Code Tasks

Tasks are defined in `.vscode/tasks.json`.

Available tasks:

- `JellyDL: Build Web Assets`
- `JellyDL: Docker Build`
- `JellyDL: GHCR Login` (reads `GHCR_TOKEN` from `.env`)
- `JellyDL: Docker Push`
- `JellyDL: Full Build Login Push` (runs all of the above in sequence)

Run a task:

1. Open Command Palette.
2. Select `Tasks: Run Task`.
3. Pick the desired JellyDL task.

## Notes

- `JellyDL: GHCR Login` fails if `GHCR_TOKEN` is missing.
- If `GHCR_USERNAME` is not set in `.env`, the login task falls back to the username prompt.
- The default image tag prompt is `ghcr.io/dave01945/jellydl:latest`.
