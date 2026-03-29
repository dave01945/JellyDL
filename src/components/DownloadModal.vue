<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { JellyfinMediaItem, JellyfinSeason, JellyfinEpisode, JellyfinMediaSource, TranscodeJobRequest, QualityPreset } from '@/api/jellyfin'
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
  { value: '448000', label: '448 kbps', description: 'AC3 5.1 ceiling' },
  { value: '640000', label: '640 kbps', description: 'E-AC3 / DTS core ceiling' },
  { value: '768000', label: '768 kbps', description: 'High-res 5.1 / DTS-HD' },
  { value: '1024000', label: '1024 kbps', description: 'High-res 7.1' },
  { value: '1536000', label: '1536 kbps', description: 'True HD / DTS-HD MA 7.1 ceiling' },
]

const audioChannels = [
  { value: '0', label: 'Original (copy)', description: 'Keep source channel layout' },
  { value: '1', label: 'Mono', description: '1.0 — smallest file, voice-focused' },
  { value: '2', label: 'Stereo', description: '2.0 — standard left/right' },
  { value: '6', label: '5.1 Surround', description: '6-channel (FL, FR, C, LFE, BL, BR)' },
  { value: '8', label: '7.1 Surround', description: '8-channel (adds side L/R)' },
]

const subtitleOptions = [
  { value: 'none', label: 'No subtitles' },
  { value: 'burn', label: 'Burn in (hardcoded)' },
  { value: 'embed', label: 'Embed (soft subs)' },
]

const qualityPresets: { value: QualityPreset; label: string; description: string }[] = [
  { value: 'Custom',  label: 'Custom (manual bitrate)', description: 'Use the manual bitrate / CRF control below' },
  { value: 'Low',     label: 'Low',      description: 'CRF 28 — smallest file, lowest quality' },
  { value: 'Medium',  label: 'Medium',   description: 'CRF 23 — balanced quality' },
  { value: 'High',    label: 'High',     description: 'CRF 18 — high quality' },
  { value: 'VeryHigh', label: 'Very High', description: 'CRF 15 — near-lossless for most content' },
]

const selectedFormat = ref('mp4')
const selectedResolution = ref('1080p')
const selectedBitrate = ref('8000000')
const selectedAudioCodec = ref('aac')
const selectedAudioBitrate = ref('128000')
const selectedAudioChannels = ref('2')
const selectedSubtitles = ref('none')
const selectedQualityPreset = ref<QualityPreset>(settings.defaultQualityPreset)

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

// Multipliers applied to the reference resolution bitrate for each CRF-based preset.
// Reference rate ≈ CRF 18 (High quality). Derived from typical H.264 CRF output rates.
// Real-world CRF 23 output on typical content runs closer to 70% of the CRF 18 reference
// rather than the theoretical ~56% suggested by the 6-steps-per-octave rule.
const qualityPresetMultiplier: Record<QualityPreset, number> = {
  Custom:   1.0,  // unused — manual bitrate used instead
  VeryHigh: 1.75, // CRF 15
  High:     1.0,  // CRF 18
  Medium:   0.70, // CRF 23
  Low:      0.35, // CRF 28
}

// Reference bitrates above assume H.264. Other codecs achieve different sizes at equivalent quality.
const codecFormatMultiplier: Record<string, number> = {
  'mp4':      1.0,   // H.264 baseline
  'mp4-hevc': 0.6,   // HEVC is ~40% smaller at equivalent visual quality
  'mkv':      1.0,   // H.264
  'webm':     0.65,  // VP9 is comparable to HEVC
  'avi':      1.1,   // DivX/MPEG-4 tends to run slightly larger than H.264
}

function toHumanSize(bytes: number): string {
  const gb = bytes / 1_073_741_824
  return gb >= 1 ? `~${gb.toFixed(1)} GB` : `~${(bytes / 1_048_576).toFixed(0)} MB`
}

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

// Fallback episode duration when no RunTimeTicks data is available (42-min drama average).
const AVG_EPISODE_SEC = 42 * 60

/**
 * Derive total content duration (seconds) for the currently selected TV scope.
 * Uses loaded episode RunTimeTicks where available, falls back to ChildCount / EpisodeCount × average.
 */
function getTvDurationSec(): number | null {
  if (scope.value === 'episodes') {
    let totalSec = 0
    let count = 0
    for (const seasonEps of Object.values(episodesBySeason.value)) {
      for (const ep of seasonEps) {
        if (selectedEpisodeIds.value.has(ep.Id)) {
          totalSec += (ep.RunTimeTicks ?? 0) / 10_000_000
          count++
        }
      }
    }
    if (count === 0) return null
    return totalSec > 0 ? totalSec : count * AVG_EPISODE_SEC
  }

  if (scope.value === 'season') {
    const eps = episodesBySeason.value[selectedSeasonId.value]
    if (eps && eps.length > 0) {
      const totalSec = eps.reduce((sum, ep) => sum + (ep.RunTimeTicks ?? 0) / 10_000_000, 0)
      return totalSec > 0 ? totalSec : eps.length * AVG_EPISODE_SEC
    }
    // Episodes not yet loaded — use ChildCount × average
    const season = seasons.value.find(s => s.Id === selectedSeasonId.value)
    const count = season?.ChildCount ?? 0
    return count > 0 ? count * AVG_EPISODE_SEC : null
  }

  // series scope — prefer the series-level RunTimeTicks if populated
  if (props.item.RunTimeTicks) return props.item.RunTimeTicks / 10_000_000

  // Extrapolate from any episodes already loaded
  const allEps = Object.values(episodesBySeason.value).flat()
  const totalCount = props.item.EpisodeCount ?? 0
  if (allEps.length > 0) {
    const loadedSec = allEps.reduce((sum, ep) => sum + (ep.RunTimeTicks ?? 0) / 10_000_000, 0)
    const avgSec = loadedSec > 0 ? loadedSec / allEps.length : AVG_EPISODE_SEC
    return avgSec * (totalCount > 0 ? totalCount : allEps.length)
  }
  return totalCount > 0 ? totalCount * AVG_EPISODE_SEC : null
}

/** Count of individual files that will be queued for the current TV scope. */
function getTvItemCount(): number {
  if (scope.value === 'episodes') return selectedEpisodeIds.value.size

  if (scope.value === 'season') {
    const eps = episodesBySeason.value[selectedSeasonId.value]
    if (eps) return eps.length
    return seasons.value.find(s => s.Id === selectedSeasonId.value)?.ChildCount ?? 0
  }

  // series — sum ChildCount across all seasons if loaded, else use EpisodeCount
  if (seasons.value.length > 0) {
    return seasons.value.reduce((sum, s) => sum + (s.ChildCount ?? 0), 0)
  }
  return props.item.EpisodeCount ?? 0
}

const estimatedSize = computed(() => {
  const isTV = props.item.Type === 'Series'

  let durationSec: number
  if (isTV) {
    const tvDur = getTvDurationSec()
    if (tvDur === null) return 'Estimate unavailable'
    durationSec = tvDur
  } else {
    durationSec = props.item.RunTimeTicks ? props.item.RunTimeTicks / 10_000_000 : 0
    if (!durationSec) return 'Estimate unavailable'
  }

  // Copy-source video cannot be estimated numerically without source bitrate metadata.
  if (selectedResolution.value === 'original') {
    const itemCount = isTV ? getTvItemCount() : 0
    const suffix = itemCount > 1 ? ` × ${itemCount} files` : ''
    return selectedAudioCodec.value === 'copy'
      ? `Matches source file size${suffix}`
      : `Near source size (audio re-encoded)${suffix}`
  }

  const refBitrate = autoVideoBitrateByResolution[selectedResolution.value] ?? 4_000_000
  const formatMult = codecFormatMultiplier[selectedFormat.value] ?? 1.0

  let videoBps: number
  if (selectedQualityPreset.value === 'Custom') {
    const manualVideoBitrate = parseInt(selectedBitrate.value)
    // Manual bitrate is codec-agnostic (user picks the number), so apply format multiplier
    // only when using auto bitrate (0 = let encoder decide based on resolution reference).
    videoBps = manualVideoBitrate > 0 ? manualVideoBitrate : refBitrate * formatMult
  } else {
    videoBps = refBitrate * qualityPresetMultiplier[selectedQualityPreset.value] * formatMult
  }

  let audioBps: number
  if (selectedAudioCodec.value === 'copy') {
    // Typical compressed source audio estimate when copying stream as-is.
    audioBps = 192_000
  } else if (selectedAudioCodec.value === 'flac') {
    // FLAC is variable and not affected by channel count the same way; use a fixed midpoint.
    audioBps = 900_000
  } else {
    const parsedAudio = parseInt(selectedAudioBitrate.value)
    const baseBps = parsedAudio > 0 ? parsedAudio : 128_000
    // Scale audio for surround channel counts relative to stereo (2ch) baseline.
    const chCount = parseInt(selectedAudioChannels.value)
    if (chCount === 1) {
      audioBps = baseBps * 0.6        // mono is slightly more than half of stereo
    } else if (chCount > 2) {
      audioBps = baseBps * (chCount / 2) // 6ch → 3×, 8ch → 4×
    } else {
      audioBps = baseBps              // stereo (2) or "original" (0) — no adjustment
    }
  }

  const sizeStr = toHumanSize(((videoBps + audioBps) / 8) * durationSec)
  if (isTV) {
    const itemCount = getTvItemCount()
    return itemCount > 1 ? `${sizeStr} total (${itemCount} files)` : sizeStr
  }
  return sizeStr
})

async function loadSeasons() {
  if (seasons.value.length > 0) return
  seasonsLoading.value = true
  try {
    const api = auth.getApiClient()
    seasons.value = await api.getSeasons(props.item.Id)
    if (seasons.value.length > 0) {
      selectedSeasonId.value = seasons.value[0].Id
      // Kick off source info fetch so the dropdowns are filtered from the start.
      loadTvSourceInfo(seasons.value[0].Id)
    }
  } finally {
    seasonsLoading.value = false
  }
}

/**
 * Derive a minimum-quality SourceInfo composite from a set of episodes.
 * Uses the worst-case value for each metric so that all dropdowns show only options
 * valid for every episode in the selection (prevents upscaling surprises).
 */
function deriveSourceInfoFromEpisodes(eps: JellyfinEpisode[]): SourceInfo | null {
  const withData = eps.filter(ep => ep.sourceWidth || ep.sourceHeight || ep.sourceVideoBitrate)
  if (withData.length === 0) return null

  const minNonNull = (vals: (number | undefined)[]): number | null => {
    const valid = vals.filter((v): v is number => v !== undefined && v > 0)
    return valid.length ? Math.min(...valid) : null
  }

  return {
    width: minNonNull(withData.map(ep => ep.sourceWidth)),
    height: minNonNull(withData.map(ep => ep.sourceHeight)),
    videoBitrate: minNonNull(withData.map(ep => ep.sourceVideoBitrate)),
    totalBitrate: minNonNull(withData.map(ep => ep.sourceTotalBitrate)),
    audioChannels: minNonNull(withData.map(ep => ep.sourceAudioChannels)),
    audioBitrate: minNonNull(withData.map(ep => ep.sourceAudioBitrate)),
    size: null,
  }
}

/** Load episodes for a season (if not already cached) and derive source info for dropdown filtering. */
async function loadTvSourceInfo(seasonId: string) {
  if (!seasonId) return
  try {
    const api = auth.getApiClient()
    let eps = episodesBySeason.value[seasonId]
    if (!eps) {
      eps = await api.getEpisodes(props.item.Id, seasonId)
      episodesBySeason.value = { ...episodesBySeason.value, [seasonId]: eps }
    }
    sourceInfo.value = deriveSourceInfoFromEpisodes(eps)
  } catch {
    // non-critical — options won't be filtered
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
  if (props.item.Type !== 'Series') return
  // Refresh source info to match the newly active scope
  if (val === 'episodes') {
    const selected = Object.values(episodesBySeason.value)
      .flat()
      .filter(ep => selectedEpisodeIds.value.has(ep.Id))
    sourceInfo.value = selected.length > 0 ? deriveSourceInfoFromEpisodes(selected) : null
  } else if (val === 'season' && selectedSeasonId.value) {
    loadTvSourceInfo(selectedSeasonId.value)
  } else if (val === 'series' && seasons.value.length > 0) {
    loadTvSourceInfo(seasons.value[0].Id)
  }
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

  const recommended = recommendedByResolution[val] ?? '0'
  if (recommended === '0') {
    selectedBitrate.value = '0'
    return
  }

  const sourceBitrate = sourceInfo.value?.videoBitrate ?? sourceInfo.value?.totalBitrate ?? null
  if (!sourceBitrate) {
    selectedBitrate.value = recommended
    return
  }

  const recommendedNum = parseInt(recommended)
  if (recommendedNum <= sourceBitrate || sourceBitrate >= recommendedNum * VIDEO_BITRATE_TOLERANCE_RATIO) {
    selectedBitrate.value = recommended
    return
  }

  const best = [...bitrates]
    .reverse()
    .find((b) => isBitratePresetAllowedBySource(b.value, sourceBitrate))
  selectedBitrate.value = best ? best.value : '0'
})

// ─── Source file size & option filtering ─────────────────────────────────────

interface SourceInfo {
  videoBitrate: number | null
  totalBitrate: number | null
  width: number | null
  height: number | null
  audioChannels: number | null
  audioBitrate: number | null
  size: number | null
}

const sourceInfo = ref<SourceInfo | null>(null)
const movieMediaSources = ref<JellyfinMediaSource[]>([])
const selectedMovieMediaSourceId = ref<string>('')

function mapMediaSourceToSourceInfo(source: JellyfinMediaSource): SourceInfo {
  return {
    videoBitrate: source.VideoBitrate ?? null,
    totalBitrate: source.Bitrate ?? null,
    width: source.Width ?? null,
    height: source.Height ?? null,
    audioChannels: source.AudioChannels ?? null,
    audioBitrate: source.AudioBitrate ?? null,
    size: source.Size ?? null,
  }
}

const selectedMovieMediaSource = computed(() => {
  if (props.item.Type === 'Series') return null
  if (movieMediaSources.value.length === 0) return null
  if (!selectedMovieMediaSourceId.value) return movieMediaSources.value[0]
  return movieMediaSources.value.find(src => src.Id === selectedMovieMediaSourceId.value) ?? movieMediaSources.value[0]
})

// Allow selecting the next preset bitrate when source bitrate is close.
// Example: source >= 1.8 Mbps can use the 2.0 Mbps preset.
const VIDEO_BITRATE_TOLERANCE_RATIO = 0.9

function isBitratePresetAllowedBySource(presetValue: string, sourceBitrate: number | null): boolean {
  if (presetValue === '0') return true
  if (!sourceBitrate) return true

  const presetBitrate = parseInt(presetValue)
  if (!presetBitrate || Number.isNaN(presetBitrate)) return false

  return presetBitrate <= sourceBitrate || sourceBitrate >= presetBitrate * VIDEO_BITRATE_TOLERANCE_RATIO
}

function formatVersionBitrate(bitsPerSecond?: number): string {
  if (!bitsPerSecond || bitsPerSecond <= 0) return 'Unknown bitrate'
  return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`
}

function movieVersionLabel(source: JellyfinMediaSource, index: number): string {
  const dims = source.Width && source.Height ? `${source.Width}x${source.Height}` : null
  const container = source.Container ? source.Container.toUpperCase() : null
  const bitrate = formatVersionBitrate(source.VideoBitrate ?? source.Bitrate)
  const size = source.Size ? toExactSize(source.Size) : null
  const friendlyName = source.Name?.trim() || `Version ${index + 1}`
  const suffix = [dims, container, bitrate, size].filter(Boolean).join(' · ')
  return suffix ? `${friendlyName} (${suffix})` : friendlyName
}

/**
 * Total source file size for the current selection.
 * - Movie: the single file size from sourceInfo.
 * - TV episodes scope: sum of fileSize for all selected episodes.
 * - TV season scope: sum of fileSize for all episodes in the selected season.
 * - TV series scope: not shown (too many episodes to pre-load reliably).
 */
const sourceFileSize = computed((): number | null => {
  if (props.item.Type !== 'Series') return selectedMovieMediaSource.value?.Size ?? sourceInfo.value?.size ?? null

  if (scope.value === 'episodes') {
    const selected = Object.values(episodesBySeason.value)
      .flat()
      .filter(ep => selectedEpisodeIds.value.has(ep.Id))
    if (selected.length === 0 || selected.every(ep => !ep.fileSize)) return null
    return selected.reduce((sum, ep) => sum + (ep.fileSize ?? 0), 0)
  }

  if (scope.value === 'season') {
    const eps = episodesBySeason.value[selectedSeasonId.value]
    if (!eps || eps.every(ep => !ep.fileSize)) return null
    return eps.reduce((sum, ep) => sum + (ep.fileSize ?? 0), 0)
  }

  // series scope — would need all seasons loaded; skip to avoid partial totals
  return null
})

const sourceSizeLabel = computed(() => {
  if (props.item.Type !== 'Series') return 'Original size:'
  if (scope.value === 'episodes') return 'Selected source size:'
  return 'Season source size:'
})

function toExactSize(bytes: number): string {
  const gb = bytes / 1_073_741_824
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1_048_576).toFixed(0)} MB`
}

// Height in pixels for each named resolution preset.
const resolutionHeightMap: Record<string, number> = {
  '4k': 2160, '1080p': 1080, '720p': 720, '480p': 480, '360p': 360,
}

// Only show resolutions that don't exceed the source dimensions (no upscaling).
const availableResolutions = computed(() => {
  const srcH = sourceInfo.value?.height
  if (!srcH) return resolutions
  return resolutions.filter(r => r.value === 'original' || (resolutionHeightMap[r.value] ?? 0) <= srcH)
})

// Only show audio bitrate options at or below the source stream's bitrate.
const availableAudioBitrates = computed(() => {
  const srcBps = sourceInfo.value?.audioBitrate
  if (!srcBps) return audioBitrates
  return audioBitrates.filter(ab => parseInt(ab.value) <= srcBps)
})

// Only show video bitrate options at or below the source video bitrate.
// The '0' (Auto) entry is always kept so the encoder can decide.
const availableVideoBitrates = computed(() => {
  const srcBps = sourceInfo.value?.videoBitrate ?? sourceInfo.value?.totalBitrate
  if (!srcBps) return bitrates
  return bitrates.filter(b => isBitratePresetAllowedBySource(b.value, srcBps))
})

// Only show channel layouts at or below the source channel count.
const availableAudioChannels = computed(() => {
  const srcCh = sourceInfo.value?.audioChannels
  if (!srcCh) return audioChannels
  return audioChannels.filter(ch => ch.value === '0' || parseInt(ch.value) <= srcCh)
})

// When source info loads, snap any current selections that exceed the source down
// to the highest available option that fits.
watch(sourceInfo, (info) => {
  if (!info) return

  const srcH = info.height
  if (srcH) {
    const curH = resolutionHeightMap[selectedResolution.value]
    if (curH && curH > srcH) {
      const best = Object.entries(resolutionHeightMap)
        .filter(([, h]) => h <= srcH)
        .sort(([, a], [, b]) => b - a)[0]
      selectedResolution.value = best ? best[0] : 'original'
    }
  }

  const srcAudioBps = info.audioBitrate
  if (srcAudioBps) {
    const cur = parseInt(selectedAudioBitrate.value)
    if (cur > srcAudioBps) {
      const best = [...audioBitrates].reverse().find(ab => parseInt(ab.value) <= srcAudioBps)
      if (best) selectedAudioBitrate.value = best.value
    }
  }

  const srcVideoBps = info.videoBitrate ?? info.totalBitrate
  if (srcVideoBps) {
    const cur = parseInt(selectedBitrate.value)
    if (cur > 0 && !isBitratePresetAllowedBySource(selectedBitrate.value, srcVideoBps)) {
      const best = [...bitrates].reverse().find(b => isBitratePresetAllowedBySource(b.value, srcVideoBps))
      selectedBitrate.value = best ? best.value : '0'
    }
  }

  const srcCh = info.audioChannels
  if (srcCh) {
    const cur = parseInt(selectedAudioChannels.value)
    if (cur > 0 && cur > srcCh) {
      const best = [...audioChannels].reverse().find(ch => ch.value !== '0' && parseInt(ch.value) <= srcCh)
      selectedAudioChannels.value = best ? best.value : '0'
    }
  }
})

// For TV shows: when the selected season changes, refresh source info from that season's episodes.
watch(selectedSeasonId, (seasonId) => {
  if (!seasonId || props.item.Type !== 'Series') return
  // In episodes scope the selection drives source info, not the season
  if (scope.value !== 'episodes') loadTvSourceInfo(seasonId)
})

// When in episodes scope, recompute source info from the current selection so that
// dropdown options stay limited to what is valid for every selected episode.
watch(selectedEpisodeIds, () => {
  if (props.item.Type !== 'Series' || scope.value !== 'episodes') return
  const selected = Object.values(episodesBySeason.value)
    .flat()
    .filter(ep => selectedEpisodeIds.value.has(ep.Id))
  sourceInfo.value = selected.length > 0 ? deriveSourceInfoFromEpisodes(selected) : null
})

watch(selectedMovieMediaSourceId, () => {
  if (props.item.Type === 'Series') return
  const selectedSource = selectedMovieMediaSource.value
  if (!selectedSource) return
  sourceInfo.value = mapMediaSourceToSourceInfo(selectedSource)
})

onMounted(async () => {
  if (props.item.Type === 'Series') loadSeasons()

  // For movies, fetch the source media info immediately to filter available options.
  // For TV shows, source info is loaded per-season via loadTvSourceInfo (called from loadSeasons).
  if (props.item.Type !== 'Series') {
    try {
      const api = auth.getApiClient()
      movieMediaSources.value = await api.getItemMediaSources(props.item.Id, auth.userId!)
      if (movieMediaSources.value.length > 0) {
        selectedMovieMediaSourceId.value = movieMediaSources.value[0].Id
        sourceInfo.value = mapMediaSourceToSourceInfo(movieMediaSources.value[0])
      } else {
        sourceInfo.value = await api.getItemVideoInfo(props.item.Id, auth.userId!)
      }
    } catch {
      // non-critical — options won't be filtered and size won't be shown
    }
  }
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

/** Format a TV episode name as "Show Name - S01E02 - Episode Name" */
function episodeLabel(ep: { Name: string; IndexNumber?: number; ParentIndexNumber?: number }): string {
  const seriesName = props.item.Name
  const s = ep.ParentIndexNumber != null ? String(ep.ParentIndexNumber).padStart(2, '0') : null
  const e = ep.IndexNumber != null ? String(ep.IndexNumber).padStart(2, '0') : null
  const code = s && e ? `S${s}E${e}` : s ? `S${s}` : null
  return code ? `${seriesName} - ${code} - ${ep.Name}` : `${seriesName} - ${ep.Name}`
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
          targets.push({ id: ep.Id, name: episodeLabel(ep) })
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
    targets.push(...eps.map((ep) => ({ id: ep.Id, name: episodeLabel(ep) })))
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

    const audioChannelsNum = parseInt(selectedAudioChannels.value)
    const useCustomBitrate = selectedQualityPreset.value === 'Custom'

    // CRF values matching the quality preset descriptions shown in the UI.
    const qualityPresetCrf: Partial<Record<QualityPreset, number>> = {
      VeryHigh: 15,
      High:     18,
      Medium:   23,
      Low:      28,
    }
    const presetCrf = !useCustomBitrate ? qualityPresetCrf[selectedQualityPreset.value] : undefined

    // Compute a target videoBitrate for non-Custom presets so the backend has an
    // explicit bitrate constraint even if it doesn't act on the crf field.
    // Uses the same reference bitrates and multipliers as the size estimator.
    let presetVideoBitrate: number | undefined
    if (!useCustomBitrate && !isOriginal) {
      const refBitrate = autoVideoBitrateByResolution[selectedResolution.value] ?? 4_000_000
      const codecMult = codecFormatMultiplier[selectedFormat.value] ?? 1.0
      const qualityMult = qualityPresetMultiplier[selectedQualityPreset.value] ?? 1.0
      presetVideoBitrate = Math.round(refBitrate * qualityMult * codecMult)
    }

    const baseRequest: Omit<TranscodeJobRequest, 'itemId'> = {
      ...(props.item.Type !== 'Series' && selectedMovieMediaSourceId.value
        ? { mediaSourceId: selectedMovieMediaSourceId.value }
        : {}),
      videoCodec: isOriginal ? 'copy' : videoCodec,
      containerFormat,
      ...(isOriginal ? {} : { maxWidth, maxHeight }),
      ...(useCustomBitrate && bitrateNum ? { videoBitrate: bitrateNum } : {}),
      ...(presetVideoBitrate !== undefined ? { videoBitrate: presetVideoBitrate } : {}),
      ...(presetCrf !== undefined ? { crf: presetCrf } : {}),
      preset: selectedQualityPreset.value,
      audioCodec: selectedAudioCodec.value,
      ...(isAudioCopy ? {} : { audioBitrate: audioBitrateNum ?? 128_000 }),
      ...(!isAudioCopy && audioChannelsNum > 0 ? { audioChannels: audioChannelsNum } : {}),
      audioStreamIndex: -1,
      subtitleStreamIndex: -1,
    }

    const targets = await collectTargets()
    if (targets.length === 0) {
      submitError.value = 'No items selected to download.'
      return
    }

    const api = auth.getApiClient()
    const errors: string[] = []
    await Promise.all(
      targets.map(async ({ id, name }) => {
        try {
          let request: TranscodeJobRequest = { ...baseRequest, itemId: id }

          // Fetch source media info to enforce ceilings (output must be <= source).
          // Skip for copy-video jobs since there is no re-encode to constrain.
          if (request.videoCodec !== 'copy') {
            const src = await api.getItemVideoInfo(
              id,
              auth.userId!,
              props.item.Type !== 'Series' ? selectedMovieMediaSourceId.value : undefined,
            )

            // ── Video bitrate ceiling ────────────────────────────────────────
            // Only cap an explicitly-set manual bitrate (Custom preset).
            // For CRF-based presets, leave videoBitrate unset so the CRF drives
            // quality; setting it to the source bitrate would override the CRF
            // and produce a file as large as the original.
            const srcBitrate = src.videoBitrate ?? src.totalBitrate ?? null
            if (srcBitrate && request.videoBitrate) {
              request = {
                ...request,
                videoBitrate: Math.min(request.videoBitrate, srcBitrate),
              }
            }

            // ── Resolution ceiling ──────────────────────────────────────────
            // Never upscale: if the requested dimensions exceed the source, drop
            // the constraint so the encoder keeps the source dimensions.
            if (src.width && src.height) {
              const reqW = request.maxWidth ?? Infinity
              const reqH = request.maxHeight ?? Infinity
              if (reqW > src.width || reqH > src.height) {
                // Requested resolution is larger than source — remove the cap so
                // the encoder outputs at source resolution instead of upscaling.
                const { maxWidth: _w, maxHeight: _h, ...rest } = request
                request = rest as TranscodeJobRequest
              }
            }

            // ── Audio channel ceiling ────────────────────────────────────────
            if (src.audioChannels && request.audioChannels) {
              request = {
                ...request,
                audioChannels: Math.min(request.audioChannels, src.audioChannels),
              }
            }

            // ── Audio bitrate ceiling ────────────────────────────────────────
            if (src.audioBitrate && request.audioBitrate) {
              request = {
                ...request,
                audioBitrate: Math.min(request.audioBitrate, src.audioBitrate),
              }
            }
          }

          await queue.enqueueItem(id, name, request, props.item.Type === 'Series' ? props.item.Name : null)
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

            <!-- Movie version selector (multi-version titles) -->
            <template v-if="item.Type !== 'Series' && movieMediaSources.length > 1">
              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-jellyfin-muted uppercase tracking-wider">Version</label>
                <select
                  v-model="selectedMovieMediaSourceId"
                  class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent transition"
                >
                  <option
                    v-for="(source, idx) in movieMediaSources"
                    :key="source.Id"
                    :value="source.Id"
                  >
                    {{ movieVersionLabel(source, idx) }}
                  </option>
                </select>
                <p class="text-xs text-jellyfin-muted">Select which movie file/version to transcode and download.</p>
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
                  <option v-for="r in availableResolutions" :key="r.value" :value="r.value">{{ r.label }}</option>
                </select>
                <p class="text-xs text-jellyfin-muted">{{ resolutions.find(r => r.value === selectedResolution)?.description }}</p>
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-jellyfin-muted uppercase tracking-wider">Quality Preset</label>
                <select v-model="selectedQualityPreset" class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent transition">
                  <option v-for="q in qualityPresets" :key="q.value" :value="q.value">{{ q.label }}</option>
                </select>
                <p class="text-xs text-jellyfin-muted">{{ qualityPresets.find(q => q.value === selectedQualityPreset)?.description }}</p>
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-jellyfin-muted uppercase tracking-wider">Bitrate</label>
                <select v-model="selectedBitrate" :disabled="selectedResolution === 'original' || selectedQualityPreset !== 'Custom'" class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent transition disabled:opacity-50">
                  <option v-for="b in availableVideoBitrates" :key="b.value" :value="b.value">{{ b.label }}</option>
                </select>
                <p class="text-xs text-jellyfin-muted">{{ selectedQualityPreset !== 'Custom' ? 'Controlled by quality preset' : bitrates.find(b => b.value === selectedBitrate)?.description }}</p>
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
                  <option v-for="ab in availableAudioBitrates" :key="ab.value" :value="ab.value">{{ ab.label }}</option>
                </select>
                <p class="text-xs text-jellyfin-muted">{{ audioBitrates.find(ab => ab.value === selectedAudioBitrate)?.description }}</p>
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-jellyfin-muted uppercase tracking-wider">Audio Channels</label>
                <select v-model="selectedAudioChannels" :disabled="selectedAudioCodec === 'copy'" class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent transition disabled:opacity-50">
                  <option v-for="ch in availableAudioChannels" :key="ch.value" :value="ch.value">{{ ch.label }}</option>
                </select>
                <p class="text-xs text-jellyfin-muted">{{ audioChannels.find(ch => ch.value === selectedAudioChannels)?.description }}</p>
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-jellyfin-muted uppercase tracking-wider">Subtitles</label>
                <select v-model="selectedSubtitles" class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent transition">
                  <option v-for="s in subtitleOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
                </select>
              </div>

            </div>

            <div class="border-t border-jellyfin-border pt-4 space-y-1.5">
              <div v-if="sourceFileSize !== null" class="flex items-center justify-between text-sm text-jellyfin-muted">
                <span>{{ sourceSizeLabel }}</span>
                <span class="font-semibold text-jellyfin-text">{{ toExactSize(sourceFileSize) }}</span>
              </div>
              <div class="flex items-center justify-between text-sm text-jellyfin-muted">
                <span>Estimated size:</span>
                <span class="font-semibold text-jellyfin-text">{{ estimatedSize }}</span>
              </div>
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
