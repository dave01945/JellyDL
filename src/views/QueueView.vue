<script setup lang="ts">
import { ref } from 'vue'
import { useQueueStore, type QueueEntry } from '@/stores/queue'
import { useAuthStore } from '@/stores/auth'
import NavBar from '@/components/NavBar.vue'

const queue = useQueueStore()
const auth = useAuthStore()

// ─── State badge helpers ──────────────────────────────────────────────────────

const stateLabel: Record<string, string> = {
  pending:   'Transcoding',
  Queued:    'Transcoding',
  Running:   'Running',
  Completed: 'Completed',
  Failed:    'Failed',
  Cancelled: 'Cancelled',
}

const stateBadgeClass: Record<string, string> = {
  pending:   'bg-orange-500/20 text-orange-400',
  Queued:    'bg-orange-500/20 text-orange-400',
  Running:   'bg-jellyfin-primary/20 text-jellyfin-primary',
  Completed: 'bg-green-500/20 text-green-400',
  Failed:    'bg-red-500/20 text-red-400',
  Cancelled: 'bg-amber-500/20 text-amber-400',
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return ''
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  return `${(bytes / 1_048_576).toFixed(0)} MB`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (d.getFullYear() < 1980) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function isActive(j: QueueEntry) {
  return j.state === 'Queued' || j.state === 'Running' || j.state === 'pending'
}

function displayPercent(job: QueueEntry): number {
  if (!isActive(job)) return 0
  if (job.progressPercent === null || Number.isNaN(job.progressPercent)) return 0
  return Math.max(0, Math.min(100, Math.round(job.progressPercent)))
}

function estimateEtaSeconds(job: QueueEntry): number | null {
  if (job.state !== 'Running') return null
  if (job.progressPercent === null || job.progressPercent <= 0 || job.progressPercent >= 100) return null

  const createdMs = Date.parse(job.createdAt)
  if (Number.isNaN(createdMs)) return null

  // Ignore placeholder/invalid historic timestamps (e.g. restored local entry before first status sync)
  if (createdMs < Date.parse('2000-01-01T00:00:00Z')) return null

  const elapsedSec = Math.max(1, (Date.now() - createdMs) / 1000)
  const remainingSec = elapsedSec * ((100 - job.progressPercent) / job.progressPercent)
  return Number.isFinite(remainingSec) ? Math.max(0, Math.round(remainingSec)) : null
}

function formatEta(job: QueueEntry): string {
  const sec = estimateEtaSeconds(job)
  if (sec === null) return 'Calculating…'
  if (sec < 60) return `${sec}s`

  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  if (min < 60) return remSec === 0 ? `${min}m` : `${min}m ${remSec}s`

  const hr = Math.floor(min / 60)
  const remMin = min % 60
  return remMin === 0 ? `${hr}h` : `${hr}h ${remMin}m`
}

// ─── Download ─────────────────────────────────────────────────────────────────

const savingJobs = ref(new Set<string>())

function getSuggestedDownloadName(job: QueueEntry): string {
  const rawName = (job.itemName || job.itemId || 'download').trim()
  const cleaned = rawName.replace(/[\\/:*?"<>|]/g, '_')
  const ext = (job.containerFormat || 'mp4').replace(/^\.+/, '').toLowerCase()
  return `${cleaned}.${ext}`
}

async function saveFile(job: QueueEntry) {
  if (savingJobs.value.has(job.jobId)) return
  savingJobs.value = new Set([...savingJobs.value, job.jobId])
  try {
    const api = auth.getApiClient()
    const filename = getSuggestedDownloadName(job)
    const url = api.getBrowserTranscodeFileUrl(job.jobId, auth.token ?? undefined, filename)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    // Use a new tab/window so the app doesn't navigate away if the server replies inline.
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    // Keep transient "Saving..." state briefly for user feedback.
    await new Promise((resolve) => setTimeout(resolve, 800))
    const nextSaving = new Set(savingJobs.value)
    nextSaving.delete(job.jobId)
    savingJobs.value = nextSaving
  }
}
</script>

<template>
  <div class="min-h-screen bg-jellyfin-bg text-jellyfin-text">
    <NavBar />

    <main class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">

    <!-- Page header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-jellyfin-text">Download Queue</h1>
        <p class="mt-1 text-sm text-jellyfin-muted">
          <span v-if="queue.jobs.length === 0">No jobs yet.</span>
          <template v-else>
            {{ queue.jobs.length }} job{{ queue.jobs.length !== 1 ? 's' : '' }}
            <template v-if="queue.activeCount > 0"> · {{ queue.activeCount }} active</template>
            <template v-if="queue.completedCount > 0"> · {{ queue.completedCount }} ready</template>
          </template>
        </p>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="queue.jobs.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-20 h-20 rounded-full bg-jellyfin-primary/10 flex items-center justify-center mb-5">
        <svg class="w-10 h-10 text-jellyfin-primary/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
      </div>
      <p class="text-jellyfin-muted text-lg">No downloads in queue</p>
      <p class="text-jellyfin-muted/60 text-sm mt-1">Open a movie or TV show and click "Start Download"</p>
    </div>

    <!-- Job list -->
    <ul v-else class="space-y-3">
      <li
        v-for="job in queue.jobs"
        :key="job.jobId"
        class="bg-jellyfin-surface border border-jellyfin-border rounded-xl p-5 flex flex-col gap-3"
      >
        <!-- Row 1: item name + state badge + actions -->
        <div class="flex items-start gap-3">
          <div class="flex-1 min-w-0">
            <p v-if="job.seriesName" class="text-xs text-jellyfin-muted truncate">{{ job.seriesName }}</p>
            <p class="font-semibold text-jellyfin-text truncate">{{ job.itemName || job.itemId }}</p>
            <p class="text-xs text-jellyfin-muted mt-0.5 font-mono uppercase tracking-wide">
              {{ job.containerFormat }}
              <span v-if="job.createdAt && formatTime(job.createdAt)" class="ml-2">· {{ formatTime(job.createdAt) }}</span>
            </p>
          </div>

          <!-- State badge (+ percent for active jobs) -->
          <span
            :class="['flex-shrink-0 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full', stateBadgeClass[job.state] ?? stateBadgeClass['pending']]"
          >
            {{ stateLabel[job.state] ?? job.state }}
            <template v-if="isActive(job)">
              &nbsp;{{ displayPercent(job) }}%
            </template>
          </span>

          <!-- Actions -->
          <div class="flex items-center gap-2 flex-shrink-0">

            <!-- Download (Completed) -->
            <button
              v-if="job.state === 'Completed'"
              @click="saveFile(job)"
              :disabled="savingJobs.has(job.jobId)"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 disabled:opacity-60 disabled:cursor-not-allowed text-green-400 text-xs font-semibold transition-colors"
              title="Download file"
            >
              <svg v-if="savingJobs.has(job.jobId)" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              <svg v-else class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              {{ savingJobs.has(job.jobId) ? 'Saving…' : 'Save' }}
            </button>

            <!-- Cancel (active jobs) / Remove (terminal state) -->
            <button
              @click="queue.removeJob(job.jobId)"
              :class="[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                isActive(job)
                  ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                  : 'bg-white/5 hover:bg-white/10 text-jellyfin-muted',
              ]"
              :title="isActive(job) ? 'Cancel job' : 'Remove from list'"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
              {{ isActive(job) ? 'Cancel' : 'Remove' }}
            </button>

          </div>
        </div>

        <!-- Progress bar (active jobs) -->
        <div v-if="isActive(job)" class="space-y-1">
          <div class="flex items-center justify-between text-xs text-jellyfin-muted">
            <span>Transcoding…</span>
            <div class="flex items-center gap-3 tabular-nums">
              <span class="font-medium text-jellyfin-primary">{{ displayPercent(job) }}%</span>
              <span v-if="job.state === 'Running'" class="text-jellyfin-muted/90">ETA {{ formatEta(job) }}</span>
            </div>
          </div>
          <div class="h-1.5 bg-jellyfin-bg rounded-full overflow-hidden">
            <div
              v-if="job.state === 'Running'"
              class="h-full bg-jellyfin-primary rounded-full transition-all duration-500"
              :style="{ width: `${Math.max(2, job.progressPercent ?? 0)}%` }"
            />
            <!-- Indeterminate shimmer for Queued / pending -->
            <div
              v-else
              class="h-full w-1/3 bg-jellyfin-muted/40 rounded-full animate-pulse"
            />
          </div>
        </div>

        <!-- Completed: file size -->
        <p
          v-if="job.state === 'Completed' && !savingJobs.has(job.jobId)"
          class="text-xs text-green-400"
        >
          <template v-if="job.sourceFileSizeBytes && job.outputSizeBytes">
            {{ formatBytes(job.sourceFileSizeBytes) }} → {{ formatBytes(job.outputSizeBytes) }} ready to download
          </template>
          <template v-else-if="job.outputSizeBytes">
            {{ formatBytes(job.outputSizeBytes) }} ready to download
          </template>
        </p>

        <!-- Download starting state -->
        <div v-if="savingJobs.has(job.jobId)" class="space-y-1">
          <p class="text-xs text-jellyfin-muted">Starting browser download…</p>
        </div>

        <!-- Failed: error message -->
        <p
          v-if="job.state === 'Failed' && job.error"
          class="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2"
        >
          {{ job.error }}
        </p>

      </li>
    </ul>

    </main>
  </div>
</template>
