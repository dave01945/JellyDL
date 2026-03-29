function normalizeBasePath(url?: string): string {
  const raw = (url ?? '').trim().replace(/\/+$/, '')
  const base = raw || '/jellyfin'

  // Accept either server root or web UI URLs in settings.
  return base.replace(/\/web(?:\/index\.html)?$/i, '')
}

export function jellyfinWebUrl(url?: string): string {
  return `${normalizeBasePath(url)}/web/index.html`
}

export function jellyfinItemUrl(url: string | undefined, id: string): string {
  const detailsId = encodeURIComponent(id)
  return `${jellyfinWebUrl(url)}#!/details?id=${detailsId}`
}