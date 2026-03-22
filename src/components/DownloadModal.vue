<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { JellyfinMediaItem, JellyfinSeason, JellyfinEpisode, TranscodeJobRequest } from '@/api/jellyfin'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useQueueStore } from '@/stores/queue'

const props = defineProps<{
  item: JellyfinMediaItem
}>()

const emit = defineEmits<{
  close: []
}>()

const settings = useSettingsStore()
const auth = useAuthStore()
const queue = useQueueStore()
const router = useRouter()

// ─── Download Options ─────────────────────────────────────────────────────────
const formats = [
  { value: 'mp4', label: 'MP4 (H.264)', description: 'Widely compatible' },
  { value: 'mp4-hevc', label: 'MP4 (H.265/HEVC)', description: 'Better compression, modern devices' },
  { value: 'mkv', label: 'MKV (H.264)', description: 'Lossless container, preserves chapters & subs' },
  { value: 'webm', label: 'WebM (VP9)', description: 'Web-optimised' },
  { value: 'avi', label: 'AVI (DivX)', description: 'Legacy compatible' },
]

const resolutions = [
  { value: 'original', label: 'Original (copy source)', description: 'Keep source video as-is' },
  { value: '4k', label: '4K (2160p)', description: '3840 × 2160' },
  { value: '1080p', label: '1080p Full HD', description: '1920 × 1080' },
  { value: '720p', label: '720p HD', description: '1280 × 720' },
  { value: '480p', label: '480p SD', description: '854 × 480' },
  { value: '360p', label: '360p Mobile', description: '640 × 360' },
]

const bitrates = [
  { value: '0', label: 'Auto (match resolution)', description: 'Let the transcoder decide' },
  { value: '20000000', label: '20 Mbps', description: 'Very high quality' },
  { value: '8000000', label: '8 Mbps', description: 'High quality (recommended 1080p)' },
  { value: '4000000', label: '4 Mbps', description: 'Good quality (recommended 720p)' },
  { value: '2000000', label: '2 Mbps', description: 'Moderate quality' },
  { value: '1000000', label: '1 Mbps', description: 'Low bandwidth' },
]

const audioCodecs = [
  { value: 'copy', label: 'Original (copy source)', description: 'No audio re-encode' },
  { value: 'aac', label: 'AAC', description: 'Best compatibility (default)' },
  { value: 'opus', label: 'Opus', description: 'High quality at lower bitrates' },
  { value: 'mp3', label: 'MP3', description: 'Legacy player compatibility' },
  { value: 'flac', label: 'FLAC', description: 'Lossless audio (larger files)' },
]

const audioBitrates = [
  { value: '96000', label: '96 kbps', description: 'Low bandwidth' },
  { value: '128000', label: '128 kbps', description: 'Balanced quality' },
  { value: '192000', label: '192 kbps', description: 'High quality' },
  { value: '256000', label: '256 kbps', description: 'Very high quality' },
  { value: '320000', label: '320 kbps', description: 'Near transparent quality' },
]

const subtitleOptions = [
  { value: 'none', label: 'No subtitles' },
  { value: 'burn', label: 'Burn in (hardcoded)' },
  { value: 'embed', label: 'Embed (soft subs)' },
]

const selectedFormat = ref('mp4')
const selectedResolution = ref('1080p')
const selectedBitrate = ref('8000000')
const selectedAudioCodec = ref('aac')
const selectedAudioBitrate = ref('128000')
const selectedSubtitles = ref('none')

const posterUrl = computed(() => {
  const base = `${settings.jellyfinUrl}/Items/${props.item.Id}/Images/Primary?fillHeight=200&quality=90`
  const full = auth.token ? `${base}&api_key=${auth.token}` : base
  return import.meta.env.DEV ? `/img-proxy?url=${encodeURIComponent(full)}` : full
})

const autoVideoBitrateByResolution: Record<string, number> = {
  '4k': 16_000_000,
  '1080p': 8_000_000,
  '720p': 4_000_000,
  '480p': 2_000_000,
  '360p': 1_000_000,
}

function toHumanSize(bytes: number): string {
  const gb = bytes / 1_073_741_824
  return gb >= 1 ? `~${gb.toFixed(1)} GB` : `~${(bytes / 1_048_576).toFixed(0)} MB`
}

const estimatedSize = computed(() => {
  const durationSec = props.item.RunTimeTicks ? props.item.RunTimeTicks / 10_000_000 : 0
  if (!durationSec) return 'Estimate unavailable'

  // Copy-source video cannot be estimated numerically without source bitrate metadata.
  if (selectedResolution.value === 'original') {
    return selectedAudioCodec.value === 'copy'
      ? 'Matches source file size'
      : 'Near source size (audio re-encoded)'
  }

  const manualVideoBitrate = parseInt(selectedBitrate.value)
  const videoBps = manualVideoBitrate > 0
    ? manualVideoBitrate
    : (autoVideoBitrateByResolution[selectedResolution.value] ?? 4_000_000)

  let audioBps: number
  if (selectedAudioCodec.value === 'copy') {
    // Typical compressed source audio estimate when copying stream as-is.
    audioBps = 192_000
  } else if (selectedAudioCodec.value === 'flac') {
    // FLAC is variable; this rough midpoint avoids severe underestimation.
    audioBps = 900_000
  } else {
    const parsedAudio = parseInt(selectedAudioBitrate.value)
    audioBps = parsedAudio > 0 ? parsedAudio : 128_000
  }

  return toHumanSize(((videoBps + audioBps) / 8) * durationSec)
})

// ─── TV Show scope selection ──────────────────────────────────────────────────
type Scope = 'series' | 'season' | 'episodes'
const scope = ref<Scope>('series')

const scopeOptions: { value: Scope; label: string }[] = [
  { value: 'series', label: 'Entire Series' },
  { value: 'season', label: 'Season' },
  { value: 'episodes', label: 'Episodes' },
]

const seasons = ref<JellyfinSeason[]>([])
const seasonsLoading = ref(false)

const episodesBySeason = ref<Record<string, JellyfinEpisode[]>>({})
const episodesLoading = ref<Record<string, boolean>>({})
const expandedSeasons = ref<Set<string>>(new Set())

const selectedSeasonId = ref<string>('')
const selectedEpisodeIds = ref<Set<string>>(new Set())

async function loadSeasons() {
  if (seasons.value.length > 0) return
  seasonsLoading.value = true
  try {
    const api = auth.getApiClient()
    seasons.value = await api.getSeasons(props.item.Id)
    if (seasons.value.length > 0) selectedSeasonId.value = seasons.value[0].Id
  } finally {
    seasonsLoading.value = false
  }
}

async function toggleSeason(seasonId: string) {
  if (expandedSeasons.value.has(seasonId)) {
    expandedSeasons.value = new Set([...expandedSeasons.value].filter(id => id !== seasonId))
    return
  }
  expandedSeasons.value = new Set([...expandedSeasons.value, seasonId])
  if (!episodesBySeason.value[seasonId]) {
    episodesLoading.value = { ...episodesLoading.value, [seasonId]: true }
    try {
      const api = auth.getApiClient()
      episodesBySeason.value = {
        ...episodesBySeason.value,
        [seasonId]: await api.getEpisodes(props.item.Id, seasonId),
      }
    } finally {
      episodesLoading.value = { ...episodesLoading.value, [seasonId]: false }
    }
  }
}

function toggleEpisode(episodeId: string) {
  const next = new Set(selectedEpisodeIds.value)
  if (next.has(episodeId)) next.delete(episodeId)
  else next.add(episodeId)
  selectedEpisodeIds.value = next
}

function toggleAllInSeason(seasonId: string) {
  const eps = episodesBySeason.value[seasonId] ?? []
  const allSelected = eps.every(e => selectedEpisodeIds.value.has(e.Id))
  const next = new Set(selectedEpisodeIds.value)
  if (allSelected) eps.forEach(e => next.delete(e.Id))
  else eps.forEach(e => next.add(e.Id))
  selectedEpisodeIds.value = next
}

function seasonAllSelected(seasonId: string): boolean {
  const eps = episodesBySeason.value[seasonId] ?? []
  return eps.length > 0 && eps.every(e => selectedEpisodeIds.value.has(e.Id))
}

function seasonSomeSelected(seasonId: string): boolean {
  const eps = episodesBySeason.value[seasonId] ?? []
  return eps.some(e => selectedEpisodeIds.value.has(e.Id)) && !seasonAllSelected(seasonId)
}

function formatRuntime(ticks?: number): string {
  if (!ticks) return ''
  return `${Math.floor(ticks / 600_000_000)}m`
}

watch(scope, (val) => {
  if (val !== 'series' && props.item.Type === 'Series') loadSeasons()
})

watch(selectedResolution, (val) => {
  const recommendedByResolution: Record<string, string> = {
    original: '0',
    '4k': '20000000',
    '1080p': '8000000',
    '720p': '4000000',
    '480p': '2000000',
    '360p': '1000000',
  }

  selectedBitrate.value = recommendedByResolution[val] ?? '0'
})

onMounted(() => {
  if (props.item.Type === 'Series') loadSeasons()
})

function onBackdropClick(e: MouseEvent) {
  if ((e.target as HTMLElement).dataset.backdrop && !submitting.value) emit('close')
}

// ─── Submit ───────────────────────────────────────────────────────────────────

const submitting = ref(false)
const submitError = ref<string | null>(null)

/** Map UI format value → plugin codec + container params */
function resolveFormatParams(format: string): { videoCodec: string; containerFormat: string } {
  switch (format) {
    case 'mp4-hevc': return { videoCodec: 'hevc', containerFormat: 'mp4' }
    case 'mkv':  return { videoCodec: 'h264', containerFormat: 'mkv' }
    case 'webm': return { videoCodec: 'vp9',  containerFormat: 'webm' }
    case 'avi':  return { videoCodec: 'h264', containerFormat: 'avi' }
    default:     return { videoCodec: 'h264', containerFormat: 'mp4' }
  }
}

/** Map UI resolution value → { maxWidth, maxHeight } (undefined = no constraint) */
function resolveResolution(res: string): { maxWidth?: number; maxHeight?: number } {
  switch (res) {
    case '4k':    return { maxWidth: 3840, maxHeight: 2160 }
    case '1080p': return { maxWidth: 1920, maxHeight: 1080 }
    case '720p':  return { maxWidth: 1280, maxHeight: 720 }
    case '480p':  return { maxWidth: 854,  maxHeight: 480 }
    case '360p':  return { maxWidth: 640,  maxHeight: 360 }
    default:      return {}
  }
}

/** Collect the list of { id, name } items to queue based on type + scope selection */
async function collectTargets(): Promise<{ id: string; name: string }[]> {
  if (props.item.Type !== 'Series') {
    return [{ id: props.item.Id, name: props.item.Name }]
  }

  if (scope.value === 'episodes') {
    const targets: { id: string; name: string }[] = []
    for (const seasonEps of Object.values(episodesBySeason.value)) {
      for (const ep of seasonEps) {
        if (selectedEpisodeIds.value.has(ep.Id)) {
          targets.push({ id: ep.Id, name: ep.Name })
        }
      }
    }
    return targets
  }

  const api = auth.getApiClient()
  let seasonIds: string[]

  if (scope.value === 'season') {
    seasonIds = [selectedSeasonId.value]
  } else {
    // Entire series — ensure all seasons are loaded
    if (seasons.value.length === 0) await loadSeasons()
    seasonIds = seasons.value.map((s) => s.Id)
  }

  const targets: { id: string; name: string }[] = []
  for (const sid of seasonIds) {
    let eps = episodesBySeason.value[sid]
    if (!eps) {
      eps = await api.getEpisodes(props.item.Id, sid)
      episodesBySeason.value = { ...episodesBySeason.value, [sid]: eps }
    }
    targets.push(...eps.map((ep) => ({ id: ep.Id, name: ep.Name })))
  }
  return targets
}

async function startDownload() {
  submitting.value = true
  submitError.value = null

  try {
    const { videoCodec, containerFormat } = resolveFormatParams(selectedFormat.value)
    const { maxWidth, maxHeight } = resolveResolution(selectedResolution.value)
    const isOriginal = selectedResolution.value === 'original'
    const bitrateNum = parseInt(selectedBitrate.value) || undefined
    const audioBitrateNum = parseInt(selectedAudioBitrate.value) || undefined
    const isAudioCopy = selectedAudioCodec.value === 'copy'

    const baseRequest: Omit<TranscodeJobRequest, 'itemId'> = {
      videoCodec: isOriginal ? 'copy' : videoCodec,
      containerFormat,
      ...(isOriginal ? {} : { maxWidth, maxHeight }),
      ...(bitrateNum ? { videoBitrate: bitrateNum } : {}),
      audioCodec: selectedAudioCodec.value,
      ...(isAudioCopy ? {} : { audioBitrate: audioBitrateNum ?? 128_000 }),
      audioStreamIndex: -1,
      subtitleStreamIndex: -1,
    }

    const targets = await collectTargets()
    if (targets.length === 0) {
      submitError.value = 'No items selected to download.'
      return
    }

    const errors: string[] = []
    await Promise.all(
      targets.map(async ({ id, name }) => {
        try {
          await queue.enqueueItem(id, name, { ...baseRequest, itemId: id })
        } catch (err: unknown) {
          const msg = (err as { message?: string })?.message ?? 'Unknown error'
          errors.push(`${name}: ${msg}`)
        }
      }),
    )

    if (errors.length > 0) {
      submitError.value =
        errors.slice(0, 3).join('\n') +
        (errors.length > 3 ? `\n…and ${errors.length - 3} more` : '')
      return
    }

    emit('close')
    router.push('/queue')
  } catch (err: unknown) {
    submitError.value = (err as { message?: string })?.message ?? 'Failed to queue download.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      data-backdrop="true"
      @click="onBackdropClick"
    >
      <div class="relative w-full max-w-2xl bg-jellyfin-surface border border-jellyfin-border rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        <!-- Header -->
        <div class="flex items-start gap-4 p-6 border-b border-jellyfin-border flex-shrink-0">
          <img
            :src="posterUrl"
            :alt="item.Name"
            class="w-16 h-24 object-cover rounded-md flex-shrink-0 shadow-lg"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <div class="flex-1 min-w-0 pt-1">
            <p class="text-xs text-jellyfin-primary font-medium uppercase tracking-wider mb-1">
              {{ item.Type === 'Series' ? 'TV Show' : 'Movie' }} · Download
            </p>
            <h2 class="text-xl font-bold text-jellyfin-text leading-tight">{{ item.Name }}</h2>
            <p v-if="item.ProductionYear" class="text-sm text-jellyfin-muted mt-1">{{ item.ProductionYear }}</p>
          </div>
          <button
            @click="emit('close')"
            :disabled="submitting"
            class="flex-shrink-0 p-1.5 rounded-md text-jellyfin-muted hover:text-jellyfin-text hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Scrollable body -->
        <div class="overflow-y-auto flex-1">
          <div class="p-6 space-y-5">

            <!-- TV Show scope selector -->
            <template v-if="item.Type === 'Series'">
              <div class="space-y-3">
                <label class="block text-xs font-semibold text-jellyfin-muted uppercase tracking-wider">What to download</label>
                <div class="flex rounded-lg overflow-hidden border border-jellyfin-border text-sm font-medium">
                  <button
                    v-for="opt in scopeOptions"
                    :key="opt.value"
                    @click="scope = opt.value"
                    :class="[
                      'flex-1 px-3 py-2 transition-colors',
                      scope === opt.value
                        ? 'bg-jellyfin-primary text-white'
                        : 'bg-jellyfin-bg text-jellyfin-muted hover:text-jellyfin-text hover:bg-white/5',
                    ]"
                  >
                    {{ opt.label }}
                  </button>
                </div>

                <!-- Season dropdown -->
                <div v-if="scope === 'season'">
                  <div v-if="seasonsLoading" class="text-sm text-jellyfin-muted animate-pulse py-2">Loading seasons…</div>
                  <select
                    v-else
                    v-model="selectedSeasonId"
                    class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent transition"
                  >
                    <option v-for="s in seasons" :key="s.Id" :value="s.Id">
                      {{ s.Name }}{{ s.ChildCount ? ` (${s.ChildCount} episodes)` : '' }}
                    </option>
                  </select>
                </div>

                <!-- Episode picker -->
                <div v-if="scope === 'episodes'" class="space-y-2">
                  <div v-if="seasonsLoading" class="text-sm text-jellyfin-muted animate-pulse py-2">Loading seasons…</div>
                  <div
                    v-for="season in seasons"
                    :key="season.Id"
                    class="border border-jellyfin-border rounded-lg overflow-hidden"
                  >
                    <!-- Season header -->
                    <div class="flex items-center gap-3 px-4 py-3 bg-jellyfin-bg">
                      <button
                        type="button"
                        :class="[
                          'w-4 h-4 flex-shrink-0 rounded border transition-colors flex items-center justify-center',
                          seasonAllSelected(season.Id)
                            ? 'bg-jellyfin-primary border-jellyfin-primary'
                            : seasonSomeSelected(season.Id)
                              ? 'bg-jellyfin-primary/40 border-jellyfin-primary'
                              : 'border-jellyfin-border bg-transparent hover:border-jellyfin-primary',
                        ]"
                        @click="toggleAllInSeason(season.Id); if (!expandedSeasons.has(season.Id)) toggleSeason(season.Id)"
                      >
                        <svg v-if="seasonAllSelected(season.Id)" class="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M20 6L9 17l-5-5"/></svg>
                        <span v-else-if="seasonSomeSelected(season.Id)" class="w-2 h-0.5 bg-white rounded-full"/>
                      </button>
                      <button
                        type="button"
                        class="flex-1 flex items-center gap-2 text-left hover:text-jellyfin-text transition-colors"
                        @click="toggleSeason(season.Id)"
                      >
                        <span class="text-sm font-medium text-jellyfin-text">{{ season.Name }}</span>
                        <span v-if="season.ChildCount" class="text-xs text-jellyfin-muted">{{ season.ChildCount }} ep</span>
                        <svg
                          class="w-4 h-4 text-jellyfin-muted ml-auto transition-transform"
                          :class="{ 'rotate-180': expandedSeasons.has(season.Id) }"
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                        ><path d="M6 9l6 6 6-6"/></svg>
                      </button>
                    </div>

                    <!-- Episodes -->
                    <div v-if="expandedSeasons.has(season.Id)" class="divide-y divide-jellyfin-border border-t border-jellyfin-border">
                      <div v-if="episodesLoading[season.Id]" class="px-4 py-3 text-sm text-jellyfin-muted animate-pulse">
                        Loading episodes…
                      </div>
                      <label
                        v-for="ep in episodesBySeason[season.Id]"
                        :key="ep.Id"
                        class="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                      >
                        <button
                          type="button"
                          :class="[
                            'w-4 h-4 flex-shrink-0 rounded border transition-colors flex items-center justify-center',
                            selectedEpisodeIds.has(ep.Id)
                              ? 'bg-jellyfin-primary border-jellyfin-primary'
                              : 'border-jellyfin-border bg-transparent hover:border-jellyfin-primary',
                          ]"
                          @click="toggleEpisode(ep.Id)"
                        >
                          <svg v-if="selectedEpisodeIds.has(ep.Id)" class="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M20 6L9 17l-5-5"/></svg>
                        </button>
                        <span class="text-xs text-jellyfin-muted w-8 flex-shrink-0">
                          E{{ String(ep.IndexNumber ?? '?').padStart(2, '0') }}
                        </span>
                        <span class="flex-1 text-sm text-jellyfin-text truncate">{{ ep.Name }}</span>
                        <span v-if="ep.RunTimeTicks" class="text-xs text-jellyfin-muted flex-shrink-0">
                          {{ formatRuntime(ep.RunTimeTicks) }}
                        </span>
                      </label>
                    </div>
                  </div>

                  <p v-if="selectedEpisodeIds.size > 0" class="text-xs text-jellyfin-primary font-medium">
                    {{ selectedEpisodeIds.size }} episode{{ selectedEpisodeIds.size !== 1 ? 's' : '' }} selected
                  </p>
                </div>

              </div>
            </template>

            <!-- Format / Resolution / Bitrate / Subtitles -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-jellyfin-muted uppercase tracking-wider">Format</label>
                <select v-model="selectedFormat" class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent transition">
                  <option v-for="f in formats" :key="f.value" :value="f.value">{{ f.label }}</option>
                </select>
                <p class="text-xs text-jellyfin-muted">{{ formats.find(f => f.value === selectedFormat)?.description }}</p>
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-jellyfin-muted uppercase tracking-wider">Resolution</label>
                <select v-model="selectedResolution" class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent transition">
                  <option v-for="r in resolutions" :key="r.value" :value="r.value">{{ r.label }}</option>
                </select>
                <p class="text-xs text-jellyfin-muted">{{ resolutions.find(r => r.value === selectedResolution)?.description }}</p>
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-jellyfin-muted uppercase tracking-wider">Bitrate</label>
                <select v-model="selectedBitrate" :disabled="selectedResolution === 'original'" class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent transition disabled:opacity-50">
                  <option v-for="b in bitrates" :key="b.value" :value="b.value">{{ b.label }}</option>
                </select>
                <p class="text-xs text-jellyfin-muted">{{ bitrates.find(b => b.value === selectedBitrate)?.description }}</p>
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-jellyfin-muted uppercase tracking-wider">Audio Codec</label>
                <select v-model="selectedAudioCodec" class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent transition">
                  <option v-for="a in audioCodecs" :key="a.value" :value="a.value">{{ a.label }}</option>
                </select>
                <p class="text-xs text-jellyfin-muted">{{ audioCodecs.find(a => a.value === selectedAudioCodec)?.description }}</p>
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-jellyfin-muted uppercase tracking-wider">Audio Bitrate</label>
                <select v-model="selectedAudioBitrate" :disabled="selectedAudioCodec === 'copy'" class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent transition disabled:opacity-50">
                  <option v-for="ab in audioBitrates" :key="ab.value" :value="ab.value">{{ ab.label }}</option>
                </select>
                <p class="text-xs text-jellyfin-muted">{{ audioBitrates.find(ab => ab.value === selectedAudioBitrate)?.description }}</p>
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-jellyfin-muted uppercase tracking-wider">Subtitles</label>
                <select v-model="selectedSubtitles" class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent transition">
                  <option v-for="s in subtitleOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
                </select>
              </div>

            </div>

            <div class="flex items-center justify-between text-sm text-jellyfin-muted border-t border-jellyfin-border pt-4">
              <span>Estimated size:</span>
              <span class="font-semibold text-jellyfin-text">{{ estimatedSize }}</span>
            </div>

            <!-- Submit error -->
            <div
              v-if="submitError"
              class="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400 whitespace-pre-line"
            >
              <svg class="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {{ submitError }}
            </div>

          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-3 px-6 py-4 flex-shrink-0 border-t border-jellyfin-border">
          <button
            @click="emit('close')"
            :disabled="submitting"
            class="px-5 py-2.5 rounded-lg text-sm font-medium text-jellyfin-muted hover:text-jellyfin-text hover:bg-white/5 border border-jellyfin-border transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            @click="startDownload"
            :disabled="submitting"
            class="flex items-center gap-2 bg-jellyfin-primary hover:bg-jellyfin-primary/80 disabled:bg-jellyfin-primary/50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
          >
            <svg v-if="submitting" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
            <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            {{ submitting ? 'Queuing…' : 'Start Download' }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>
