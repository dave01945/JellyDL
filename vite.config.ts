import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import http from 'node:http'
import https from 'node:https'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const jellyfinTarget = env.VITE_JELLYFIN_URL || 'http://localhost:8096'

  return {
    plugins: [
      vue(),
      {
        // Dev-only: full transparent proxy for all Jellyfin API calls.
        // Avoids browser CORS by making the request server-side via node:http/https,
        // which allows setting any header (including Host and Authorization).
        name: 'jellyfin-dev-proxy',
        configureServer(server) {
          // Image proxy: /img-proxy?url=<encoded-full-url>
          // Used by <img> tags which cannot send custom headers.
          server.middlewares.use('/img-proxy', (req, res) => {
            const qs = new URL(req.url ?? '', 'http://localhost').searchParams
            const target = qs.get('url')
            if (!target) {
              res.writeHead(400)
              res.end(JSON.stringify({ error: 'Missing url param' }))
              return
            }

            let targetUrl: URL
            try {
              targetUrl = new URL(target)
            } catch {
              res.writeHead(400)
              res.end(JSON.stringify({ error: 'Invalid url param' }))
              return
            }

            const lib = targetUrl.protocol === 'https:' ? https : http
            const proxyReq = lib.request(
              {
                hostname: targetUrl.hostname,
                port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                path: targetUrl.pathname + targetUrl.search,
                method: 'GET',
                headers: { host: targetUrl.host },
              },
              (proxyRes) => {
                res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers)
                proxyRes.pipe(res)
              },
            )
            proxyReq.on('error', (e) => {
              if (!res.headersSent) {
                res.writeHead(502)
                res.end(JSON.stringify({ error: e.message }))
              }
            })
            req.pipe(proxyReq)
          })

          server.middlewares.use('/dev-proxy', (req, res) => {
            const rawTarget = req.headers['x-proxy-target']
            const target = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget
            if (!target) {
              res.writeHead(400)
              res.end(JSON.stringify({ error: 'Missing X-Proxy-Target header' }))
              return
            }

            let targetUrl: URL
            try {
              targetUrl = new URL(req.url ?? '/', target)
            } catch {
              res.writeHead(400)
              res.end(JSON.stringify({ error: 'Invalid target URL' }))
              return
            }

            const skipHeaders = new Set([
              'connection', 'x-proxy-target', 'keep-alive', 'upgrade', 'te',
            ])
            const forwardHeaders: Record<string, string | string[]> = {
              // Override Host so Jellyfin's network security accepts the request
              host: targetUrl.host,
            }
            for (const [k, v] of Object.entries(req.headers)) {
              if (!skipHeaders.has(k.toLowerCase())) {
                forwardHeaders[k] = v as string | string[]
              }
            }

            const lib = targetUrl.protocol === 'https:' ? https : http
            const proxyReq = lib.request(
              {
                hostname: targetUrl.hostname,
                port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                path: targetUrl.pathname + targetUrl.search,
                method: req.method ?? 'GET',
                headers: forwardHeaders,
              },
              (proxyRes) => {
                res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers)
                proxyRes.pipe(res)
              },
            )
            proxyReq.on('error', (e) => {
              if (!res.headersSent) {
                res.writeHead(502)
                res.end(JSON.stringify({ error: e.message }))
              }
            })
            // Pipe the request body directly (handles POST with JSON body)
            req.pipe(proxyReq)
          })
        },
      },
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        // Proxy for /jellyfin/* — mirrors the nginx reverse proxy used in production.
        // Rewrites the prefix and forwards to VITE_JELLYFIN_URL.
        '/jellyfin': {
          target: jellyfinTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/jellyfin/, ''),
        },
        '/api': {
          target: jellyfinTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
