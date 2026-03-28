# JellyDL WebUI

Vue 3 + Vite web UI for browsing Jellyfin media and managing download/transcode flows.

## Requirements

- Node.js 20+
- npm 10+
- Docker
- VS Code (optional, for task automation)

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
2. Add credentials to a local `.env` file in project root.

Example `.env`:

```env
GHCR_TOKEN=your_github_pat_here
GHCR_USERNAME=dave01945
```

Manual login + push:

```bash
docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin <<< "$GHCR_TOKEN"
docker push ghcr.io/dave01945/jellydl:latest
```

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
