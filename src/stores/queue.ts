import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { TranscodeJobRequest, TranscodeJobState } from '@/api/jellyfin'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueueEntry {
  jobId: string
  itemId: string
  itemName: string
  seriesName: string | null
  containerFormat: string
  state: TranscodeJobState | 'pending'
  progressPercent: number | null
  outputSizeBytes: number | null
  sourceFileSizeBytes: number | null
  error: string | null
  createdAt: string
}

interface PersistedEntry {
  jobId: string
  itemId: string
  itemName: string
  seriesName?: string | null
  containerFormat: string
  sourceFileSizeBytes?: number | null
}

const STORAGE_KEY = 'jellyfindl_queue'

function normalizeState(raw: unknown): TranscodeJobState | 'pending' {
  if (typeof raw === 'string') {
    const key = raw.trim().toLowerCase()
    if (key === 'queued') return 'Queued'
    if (key === 'running') return 'Running'
    if (key === 'completed') return 'Completed'
    if (key === 'failed') return 'Failed'
    if (key === 'cancelled' || key === 'canceled') return 'Cancelled'
  }

  // Handle numeric enum payloads (common default for .NET enums)
  if (typeof raw === 'number') {
    if (raw === 0) return 'Queued'
    if (raw === 1) return 'Running'
    if (raw === 2) return 'Completed'
    if (raw === 3) return 'Failed'
    if (raw === 4) return 'Cancelled'
  }

  return 'pending'
}

function normalizeProgress(raw: unknown): number | null {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return null
  // Plugin always sends 0–100.
  return Math.max(0, Math.min(100, raw))
}

function loadPersisted(): PersistedEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as PersistedEntry[]
  } catch {
    // ignore corrupt storage
  }
  return []
}

function savePersisted(jobs: QueueEntry[]) {
  const data: PersistedEntry[] = jobs.map(({ jobId, itemId, itemName, seriesName, containerFormat, sourceFileSizeBytes }) => ({
    jobId,
    itemId,
    itemName,
    seriesName: seriesName ?? null,
    containerFormat,
    sourceFileSizeBytes: sourceFileSizeBytes ?? null,
  }))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

// ─── Notifications ───────────────────────────────────────────────────────────

function requestNotificationPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => { /* ignore */ })
  }
}

function notifyJobComplete(itemName: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification('Transcode ready', {
      body: `${itemName} is ready to download`,
      icon: '/favicon.ico',
      tag: `jellydl-complete-${itemName}`,
    })
  } catch {
    // Notification constructor can throw in some contexts
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useQueueStore = defineStore('queue', () => {
  const auth = useAuthStore()

  const jobs = ref<QueueEntry[]>([])
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const activeCount = computed(
    () => jobs.value.filter((j) => j.state === 'Queued' || j.state === 'Running' || j.state === 'pending').length,
  )

  const completedCount = computed(
    () => jobs.value.filter((j) => j.state === 'Completed').length,
  )

  // ── Polling ──────────────────────────────────────────────────────────────

  async function poll() {
    const api = auth.getApiClient()
    // Snapshot active job IDs so mutations mid-loop don't affect iteration
    const activeIds = jobs.value
      .filter((j) => j.state === 'Queued' || j.state === 'Running' || j.state === 'pending')
      .map((j) => j.jobId)

    await Promise.all(
      activeIds.map(async (jobId) => {
        try {
          const status = await api.getTranscodeJob(jobId)
          if (status === null) {
            // Server no longer knows about this job (restarted etc.) — remove it
            jobs.value = jobs.value.filter((j) => j.jobId !== jobId)
            savePersisted(jobs.value)
            return
          }
          const idx = jobs.value.findIndex((j) => j.jobId === jobId)
          if (idx !== -1) {
            const raw = status as {
              state?: unknown
              State?: unknown
              progressPercent?: unknown
              ProgressPercent?: unknown
              createdAt?: string | null
              CreatedAt?: string | null
              outputSizeBytes?: number | null
              OutputSizeBytes?: number | null
              error?: string | null
              Error?: string | null
              itemName?: string | null
              ItemName?: string | null
            }

            const nextState = normalizeState(raw.state ?? raw.State)
            const nextProgress = normalizeProgress(raw.progressPercent ?? raw.ProgressPercent)
            const nextCreatedAt = raw.createdAt ?? raw.CreatedAt ?? jobs.value[idx].createdAt
            const nextOutputSize = raw.outputSizeBytes ?? raw.OutputSizeBytes ?? null
            const nextError = raw.error ?? raw.Error ?? null
            const nextItemName = raw.itemName ?? raw.ItemName ?? jobs.value[idx].itemName

            const prevState = jobs.value[idx].state

            // splice guarantees Vue's reactivity system detects the change
            jobs.value.splice(idx, 1, {
              ...jobs.value[idx],
              state: nextState,
              progressPercent: nextProgress,
              createdAt: nextCreatedAt,
              outputSizeBytes: nextOutputSize,
              error: nextError,
              itemName: nextItemName,
            })

            if (nextState === 'Completed' && prevState !== 'Completed') {
              notifyJobComplete(nextItemName)
            }
          }
        } catch {
          // Network error — leave state as-is; will retry next tick
        }
      }),
    )

    // Stop timer if nothing left to watch
    if (activeCount.value === 0 && pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function startPolling() {
    if (pollTimer !== null) return
    pollTimer = setInterval(poll, 3000)
    // immediate first tick
    poll()
  }

  // ── Public actions ────────────────────────────────────────────────────────

  /**
   * Enqueue a single item for transcoding.
   * Posts a job to the plugin API, then tracks it in the store.
   */
  async function enqueueItem(
    itemId: string,
    itemName: string,
    options: TranscodeJobRequest,
    seriesName?: string | null,
  ): Promise<string> {
    const api = auth.getApiClient()
    const [jobId, srcInfo] = await Promise.all([
      api.createTranscodeJob({ ...options, itemId }),
      api.getItemVideoInfo(itemId, auth.userId!).catch(() => null),
    ])

    const entry: QueueEntry = {
      jobId,
      itemId,
      itemName,
      seriesName: seriesName ?? null,
      containerFormat: options.containerFormat,
      state: 'Queued',
      progressPercent: null,
      outputSizeBytes: null,
      sourceFileSizeBytes: srcInfo?.size ?? null,
      error: null,
      createdAt: new Date().toISOString(),
    }

    // Ask for notification permission the first time a job is queued
    requestNotificationPermission()

    // Most-recent-first
    jobs.value = [entry, ...jobs.value]
    savePersisted(jobs.value)
    startPolling()

    return jobId
  }

  /** Cancel a running job and remove it from the queue. */
  async function removeJob(jobId: string) {
    try {
      const api = auth.getApiClient()
      await api.deleteTranscodeJob(jobId)
    } catch {
      // Best-effort — remove from local state regardless
    }
    jobs.value = jobs.value.filter((j) => j.jobId !== jobId)
    savePersisted(jobs.value)
  }

  /**
   * Build the URL to directly download a completed file.
   * In dev, the URL is routed through the Vite proxy (no api_key needed).
   * In production, the api_key is embedded as a query param so a plain
   * <a download> or programmatic fetch works without custom headers.
   */
  function getDownloadUrl(jobId: string): string {
    const api = auth.getApiClient()
    return api.getTranscodeFileUrl(jobId, auth.token ?? undefined)
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  function init() {
    const persisted = loadPersisted()
    if (persisted.length === 0) return

    // Restore as 'pending' — poll will replace with real state
    jobs.value = persisted.map((p) => ({
      ...p,
      state: 'pending' as const,
      progressPercent: null,
      outputSizeBytes: null,
      seriesName: p.seriesName ?? null,
      sourceFileSizeBytes: p.sourceFileSizeBytes ?? null,
      error: null,
      createdAt: new Date(0).toISOString(),
    }))
    startPolling()
  }

  // Run init immediately so the store is ready on first use
  init()

  return {
    jobs,
    activeCount,
    completedCount,
    enqueueItem,
    removeJob,
    getDownloadUrl,
    poll,
  }
})
