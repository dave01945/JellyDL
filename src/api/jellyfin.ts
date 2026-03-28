import axios, { type AxiosInstance } from 'axios'

const APP_NAME = 'JellyfinDL'
const APP_VERSION = '1.0.0'

function getDeviceId(): string {
  let id = localStorage.getItem('jellyfindl_device_id')
  if (!id) {
    id = btoa(`${APP_NAME}_${crypto.randomUUID()}`)
    localStorage.setItem('jellyfindl_device_id', id)
  }
  return id
}

function buildAuthHeader(token?: string): string {
  const deviceId = getDeviceId()
  const base = `MediaBrowser Client="${APP_NAME}", Device="Browser", DeviceId="${deviceId}", Version="${APP_VERSION}"`
  return token ? `${base}, Token="${token}"` : base
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JellyfinUser {
  Id: string
  Name: string
  HasPassword: boolean
}

export interface JellyfinLoginResponse {
  AccessToken: string
  User: JellyfinUser
}

export interface JellyfinLibrary {
  Id: string
  Name: string
  CollectionType: string
}

export interface JellyfinMediaItem {
  Id: string
  Name: string
  Type: 'Movie' | 'Series' | string
  ProductionYear?: number
  CommunityRating?: number
  Overview?: string
  OfficialRating?: string
  RunTimeTicks?: number
  SeasonCount?: number
  EpisodeCount?: number
}

export interface JellyfinSeason {
  Id: string
  Name: string
  IndexNumber?: number
  ChildCount?: number
}

export interface JellyfinEpisode {
  Id: string
  Name: string
  IndexNumber?: number
  ParentIndexNumber?: number
  RunTimeTicks?: number
}

export type QualityPreset = 'Custom' | 'Low' | 'Medium' | 'High' | 'VeryHigh'
export type SpeedPreset = 'Default' | 'Fastest' | 'VeryFast' | 'Fast' | 'Medium' | 'Slow' | 'VerySlow'

export interface TranscodeJobRequest {
  itemId: string
  videoCodec: string
  containerFormat: string
  videoBitrate?: number
  crf?: number
  preset?: QualityPreset
  speedPreset?: SpeedPreset
  maxWidth?: number
  maxHeight?: number
  audioCodec: string
  audioBitrate?: number
  audioChannels?: number
  audioStreamIndex?: number
  subtitleStreamIndex?: number
}

export type TranscodeJobState = 'Queued' | 'Running' | 'Completed' | 'Failed' | 'Cancelled'

export interface TranscodeJobStatus {
  jobId: string
  itemId: string
  itemName: string
  state: TranscodeJobState
  progressPercent: number | null
  outputSizeBytes: number | null
  downloadUrl: string | null
  createdAt: string
  error: string | null
}

// ─── API Client ───────────────────────────────────────────────────────────────

export class JellyfinAPI {
  private client: AxiosInstance
  private baseUrl: string

  constructor(baseUrl: string, token?: string) {
    // Normalise: strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '')

    // In dev mode, route all requests through the Vite server-side proxy to
    // avoid browser CORS restrictions. The real target URL is passed via header.
    const isDev = import.meta.env.DEV
    const baseURL = isDev ? '/dev-proxy' : this.baseUrl
    const extraHeaders = isDev ? { 'X-Proxy-Target': this.baseUrl } : {}

    this.client = axios.create({
      baseURL,
      headers: {
        Authorization: buildAuthHeader(token),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...extraHeaders,
      },
      timeout: 15000,
    })
  }

  /** Authenticate a user and return the access token + user info */
  async login(username: string, password: string): Promise<JellyfinLoginResponse> {
    // Refresh auth header without token for login call
    const headers = { Authorization: buildAuthHeader() }
    const response = await this.client.post<JellyfinLoginResponse>(
      '/Users/AuthenticateByName',
      { Username: username, Pw: password },
      { headers }
    )
    return response.data
  }

  /** Return all media libraries visible to the given user */
  async getLibraries(userId: string): Promise<JellyfinLibrary[]> {
    const response = await this.client.get<{ Items: JellyfinLibrary[] }>(
      `/Users/${userId}/Views`
    )
    return response.data.Items ?? []
  }

  /** Return seasons for a series */
  async getSeasons(seriesId: string): Promise<JellyfinSeason[]> {
    const response = await this.client.get<{ Items: JellyfinSeason[] }>(
      `/Shows/${seriesId}/Seasons`,
      { params: { Fields: 'ChildCount', EnableImageTypes: 'none' } }
    )
    return response.data.Items ?? []
  }

  /** Return episodes for a series, optionally filtered to one season */
  async getEpisodes(seriesId: string, seasonId?: string): Promise<JellyfinEpisode[]> {
    const params: Record<string, string | number> = {
      Fields: 'RunTimeTicks',
      EnableImageTypes: 'none',
      Limit: 500,
    }
    if (seasonId) params.SeasonId = seasonId
    const response = await this.client.get<{ Items: JellyfinEpisode[] }>(
      `/Shows/${seriesId}/Episodes`,
      { params }
    )
    return response.data.Items ?? []
  }

  /** Return items inside a library folder */
  async getItems(
    parentId: string,
    includeItemTypes: 'Movie' | 'Series'
  ): Promise<JellyfinMediaItem[]> {
    const response = await this.client.get<{ Items: JellyfinMediaItem[] }>('/Items', {
      params: {
        ParentId: parentId,
        IncludeItemTypes: includeItemTypes,
        Recursive: true,
        SortBy: 'SortName',
        SortOrder: 'Ascending',
        Fields: 'Overview,CommunityRating,ProductionYear,OfficialRating,RunTimeTicks,SeasonCount,EpisodeCount',
        ImageTypeLimit: 1,
        EnableImageTypes: 'Primary',
        Limit: 1000,
      },
    })
    return response.data.Items ?? []
  }

  // ─── Transcode Download ────────────────────────────────────────────────────

  /** Start a new transcode-download job. Returns the generated jobId. */
  async createTranscodeJob(req: TranscodeJobRequest): Promise<string> {
    const response = await this.client.post<{ jobId: string }>(
      '/Plugins/TranscodeDownload/jobs',
      req,
    )
    return response.data.jobId
  }

  /** Return all currently tracked jobs. */
  async getTranscodeJobs(): Promise<TranscodeJobStatus[]> {
    const response = await this.client.get<TranscodeJobStatus[]>(
      '/Plugins/TranscodeDownload/jobs',
    )
    return response.data ?? []
  }

  /** Return a single job status, or null if the server returns 404. */
  async getTranscodeJob(jobId: string): Promise<TranscodeJobStatus | null> {
    try {
      const response = await this.client.get<TranscodeJobStatus>(
        `/Plugins/TranscodeDownload/jobs/${jobId}`,
      )
      return response.data
    } catch (err: unknown) {
      if ((err as { response?: { status?: number } })?.response?.status === 404) return null
      throw err
    }
  }

  /** Cancel + delete a job and its output file. */
  async deleteTranscodeJob(jobId: string): Promise<void> {
    await this.client.delete(`/Plugins/TranscodeDownload/jobs/${jobId}`)
  }

  /**
   * Build the URL to directly download a completed transcode file.
   *
   * In production we embed the api_key as a query parameter so a plain
   * <a download> or window.open() works without any extra headers.
   * In dev mode we route through the Vite `/dev-proxy` middleware which
   * injects the correct Authorization header server-side.
   */
  getTranscodeFileUrl(jobId: string, token?: string): string {
    const path = `/Plugins/TranscodeDownload/jobs/${jobId}/file`
    if (import.meta.env.DEV) {
      return `/dev-proxy${path}`
    }
    const base = `${this.baseUrl}${path}`
    return token ? `${base}?api_key=${token}` : base
  }

  /**
   * Build a direct Jellyfin download URL intended for browser-native downloads.
   * This always targets the Jellyfin origin (not the dev proxy) so the browser
   * can manage progress/queue in its built-in download UI.
   */
  getBrowserTranscodeFileUrl(jobId: string, token?: string, preferredFileName?: string): string {
    const path = `/Plugins/TranscodeDownload/jobs/${jobId}/file`
    const params = new URLSearchParams()
    if (token) params.set('api_key', token)
    if (preferredFileName) params.set('name', preferredFileName)
    const query = params.toString()

    // In dev, prefer same-origin Vite proxy URL so browser honors the
    // `<a download>` filename instead of falling back to URL path names.
    const base = import.meta.env.DEV ? `/api${path}` : `${this.baseUrl}${path}`
    return query ? `${base}?${query}` : base
  }

  /**
   * Fetch a completed transcode file via the authenticated axios client and
   * return it as a Blob together with the suggested filename from the
   * Content-Disposition header (falls back to `{jobId}.bin`).
   *
   * Using the axios client ensures the `X-Proxy-Target` / `Authorization`
   * headers are sent in both dev and production modes.
   */
  async downloadTranscodeFile(
    jobId: string,
    onDownloadProgress?: (percent: number) => void,
  ): Promise<{ blob: Blob; filename: string }> {
    const response = await this.client.get<Blob>(
      `/Plugins/TranscodeDownload/jobs/${jobId}/file`,
      {
        responseType: 'blob',
        // Large files can take longer than the default API timeout.
        timeout: 0,
        onDownloadProgress: onDownloadProgress
          ? (evt) => {
              const total = evt.total ?? (evt.event as ProgressEvent)?.total ?? 0
              const loaded = evt.loaded ?? 0
              const percent = total > 0 ? Math.round((loaded / total) * 100) : -1
              onDownloadProgress(percent)
            }
          : undefined,
      },
    )
    const disposition = response.headers['content-disposition'] as string | undefined
    let filename = `${jobId}.bin`
    if (disposition) {
      const match = /filename[^;=\n]*=(['"]?)([^'";\n]+)\1/i.exec(disposition)
      if (match) filename = match[2].trim()
    }
    return { blob: response.data as Blob, filename }
  }

  /**
   * Build the URL for a Jellyfin primary-image request.
   * Jellyfin serves images without authentication by default.
   */
  getPrimaryImageUrl(itemId: string, height = 450): string {
    return `${this.baseUrl}/Items/${itemId}/Images/Primary?fillHeight=${height}&quality=96`
  }

  /** Return a backdrop image URL */
  getBackdropImageUrl(itemId: string): string {
    return `${this.baseUrl}/Items/${itemId}/Images/Backdrop?fillWidth=1280&quality=80`
  }
}

/** Create an authenticated API client using values from localStorage */
export function createApiClient(jellyfinUrl: string, token?: string): JellyfinAPI {
  return new JellyfinAPI(jellyfinUrl, token)
}
