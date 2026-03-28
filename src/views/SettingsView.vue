<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import type { QualityPreset, SpeedPreset } from '@/api/jellyfin'
import packageJson from '../../package.json'

const settings = useSettingsStore()
const auth = useAuthStore()
const router = useRouter()

const urlInput = ref(settings.jellyfinUrl)
const testStatus = ref<'idle' | 'testing' | 'ok' | 'error'>('idle')
const testMessage = ref('')
const saved = ref(false)

const defaultQualityPresetInput = ref<QualityPreset>(settings.defaultQualityPreset)
const defaultSpeedPresetInput = ref<SpeedPreset>(settings.defaultSpeedPreset)
const appVersion = packageJson.version

const qualityPresetOptions: { value: QualityPreset; label: string }[] = [
  { value: 'Custom',   label: 'Custom (manual bitrate)' },
  { value: 'Low',      label: 'Low — CRF 28 (smallest file)' },
  { value: 'Medium',   label: 'Medium — CRF 23 (balanced)' },
  { value: 'High',     label: 'High — CRF 18 (high quality)' },
  { value: 'VeryHigh', label: 'Very High — CRF 15 (near-lossless)' },
]

const speedPresetOptions: { value: SpeedPreset; label: string }[] = [
  { value: 'Default',  label: 'Default (encoder built-in)' },
  { value: 'Fastest',  label: 'Fastest' },
  { value: 'VeryFast', label: 'Very Fast' },
  { value: 'Fast',     label: 'Fast' },
  { value: 'Medium',   label: 'Medium' },
  { value: 'Slow',     label: 'Slow' },
  { value: 'VerySlow', label: 'Very Slow' },
]

// Reset test status when URL changes
watch(urlInput, () => {
  testStatus.value = 'idle'
  saved.value = false
})

async function testConnection() {
  const url = urlInput.value.trim().replace(/\/+$/, '')

  testStatus.value = 'testing'
  testMessage.value = ''

  try {
    // When no URL is set, probe through the built-in /jellyfin proxy.
    // When a URL override is set, use /dev-proxy in dev (CORS) or the URL directly in prod.
    let fetchUrl: string
    let headers: Record<string, string> = { Accept: 'application/json' }

    if (!url) {
      fetchUrl = '/jellyfin/System/Info/Public'
    } else if (import.meta.env.DEV) {
      fetchUrl = '/dev-proxy/System/Info/Public'
      headers['X-Proxy-Target'] = url
    } else {
      fetchUrl = `${url}/System/Info/Public`
    }

    const response = await fetch(fetchUrl, { headers })

    if (response.ok) {
      try {
        const data = await response.json() as { ServerName?: string; Version?: string }
        testStatus.value = 'ok'
        testMessage.value = `Connected to "${data.ServerName ?? 'Jellyfin'}" (v${data.Version ?? '?'})`
      } catch {
        // Got 200 but not JSON — server is reachable, just not the info endpoint
        testStatus.value = 'ok'
        testMessage.value = 'Server is reachable.'
      }
    } else if (response.status === 401 || response.status === 403) {
      // Server responded — it's reachable, auth is just required on this endpoint
      testStatus.value = 'ok'
      testMessage.value = `Server is reachable (HTTP ${response.status}). URL looks correct — save and try logging in.`
    } else {
      testStatus.value = 'error'
      testMessage.value = `Server responded with HTTP ${response.status}. Double-check the URL.`
    }
  } catch {
    testStatus.value = 'error'
    testMessage.value = 'Could not connect. Check the URL and your network.'
  }
}

function saveSettings() {
  const url = urlInput.value.trim().replace(/\/+$/, '')
  settings.setJellyfinUrl(url)
  settings.setDefaultQualityPreset(defaultQualityPresetInput.value)
  settings.setDefaultSpeedPreset(defaultSpeedPresetInput.value)
  saved.value = true
}

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen bg-jellyfin-bg text-jellyfin-text">
    <NavBar />

    <main class="pt-16">
      <div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">

        <!-- Page title -->
        <div>
          <h1 class="text-3xl font-bold text-jellyfin-text flex items-center gap-3">
            <svg class="w-7 h-7 text-jellyfin-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            Settings
          </h1>
          <p class="text-sm text-jellyfin-muted mt-1">Configure your Jellyfin server connection</p>
        </div>

        <!-- Server configuration card -->
        <div class="bg-jellyfin-surface border border-jellyfin-border rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-jellyfin-border">
            <h2 class="font-semibold text-jellyfin-text">Jellyfin Server</h2>
            <p class="text-sm text-jellyfin-muted mt-0.5">Optional URL override — leave blank to use the built-in proxy</p>
          </div>

          <div class="p-6 space-y-4">
            <!-- URL Input -->
            <div class="space-y-1.5">
              <label for="server-url" class="block text-sm font-medium text-jellyfin-text">Server URL <span class="text-jellyfin-muted font-normal">(optional override)</span></label>
              <input
                id="server-url"
                v-model="urlInput"
                type="url"
                placeholder="Leave blank to use the built-in proxy"
                class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text placeholder-jellyfin-muted/60 rounded-lg px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent outline-none transition"
              />
              <p class="text-xs text-jellyfin-muted">
                Leave blank (recommended for Docker deployments) to route Jellyfin API calls through the
                built-in <code class="bg-jellyfin-bg px-1 py-0.5 rounded text-jellyfin-text">/jellyfin</code> proxy.
                Fill in only when accessing Jellyfin directly (e.g.
                <code class="bg-jellyfin-bg px-1 py-0.5 rounded text-jellyfin-text">http://192.168.1.100:8096</code>).
              </p>
            </div>

            <!-- Test connection result -->
            <Transition name="fade">
              <div
                v-if="testStatus !== 'idle'"
                :class="[
                  'flex items-start gap-3 rounded-lg px-4 py-3 text-sm',
                  testStatus === 'ok' ? 'bg-green-500/10 border border-green-500/30 text-green-400' :
                  testStatus === 'error' ? 'bg-red-500/10 border border-red-500/30 text-red-400' :
                  'bg-jellyfin-bg border border-jellyfin-border text-jellyfin-muted'
                ]"
              >
                <svg v-if="testStatus === 'testing'" class="w-4 h-4 mt-0.5 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
                <svg v-else-if="testStatus === 'ok'" class="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <svg v-else class="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <span>{{ testStatus === 'testing' ? 'Testing connection…' : testMessage }}</span>
              </div>
            </Transition>

            <!-- Saved confirmation -->
            <Transition name="fade">
              <div
                v-if="saved"
                class="flex items-center gap-2 text-sm text-green-400"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                Settings saved
              </div>
            </Transition>

            <!-- Action buttons -->
            <div class="flex flex-wrap gap-3 pt-1">
              <button
                @click="testConnection"
                :disabled="testStatus === 'testing'"
                class="flex items-center gap-2 bg-jellyfin-bg hover:bg-jellyfin-card disabled:opacity-50 disabled:cursor-not-allowed border border-jellyfin-border text-jellyfin-text font-medium px-4 py-2 rounded-lg text-sm transition-colors"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 6l4.5 4.5L10 6M23 18l-4.5-4.5L14 18M2.5 10.5S5 5 12 5s9.5 5.5 9.5 5.5M21.5 13.5S19 19 12 19s-9.5-5.5-9.5-5.5"/>
                </svg>
                Test Connection
              </button>
              <button
                @click="saveSettings"
                class="flex items-center gap-2 bg-jellyfin-primary hover:bg-jellyfin-primary-hover text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                </svg>
                Save
              </button>
            </div>
          </div>
        </div>

        <!-- Transcode defaults card -->
        <div class="bg-jellyfin-surface border border-jellyfin-border rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-jellyfin-border">
            <h2 class="font-semibold text-jellyfin-text">Transcode Defaults</h2>
            <p class="text-sm text-jellyfin-muted mt-0.5">Default presets used when opening the download dialog</p>
          </div>
          <div class="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div class="space-y-1.5">
              <label for="default-quality-preset" class="block text-sm font-medium text-jellyfin-text">Default Quality Preset</label>
              <select
                id="default-quality-preset"
                v-model="defaultQualityPresetInput"
                class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent outline-none transition"
              >
                <option v-for="opt in qualityPresetOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div class="space-y-1.5">
              <label for="default-speed-preset" class="block text-sm font-medium text-jellyfin-text">Default Speed Preset</label>
              <select
                id="default-speed-preset"
                v-model="defaultSpeedPresetInput"
                class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent outline-none transition"
              >
                <option v-for="opt in speedPresetOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Account section (only shown when logged in) -->
        <div v-if="auth.isAuthenticated" class="bg-jellyfin-surface border border-jellyfin-border rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-jellyfin-border">
            <h2 class="font-semibold text-jellyfin-text">Account</h2>
          </div>
          <div class="p-6 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-jellyfin-primary/20 flex items-center justify-center text-jellyfin-primary font-semibold">
                {{ auth.username?.charAt(0).toUpperCase() ?? '?' }}
              </div>
              <div>
                <p class="font-medium text-jellyfin-text">{{ auth.username }}</p>
                <p class="text-xs text-jellyfin-muted">Signed in</p>
              </div>
            </div>
            <button
              @click="logout"
              class="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 border border-red-400/30 hover:border-red-400/50 px-4 py-2 rounded-lg transition-colors"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
              Sign out
            </button>
          </div>
        </div>

        <!-- Version -->
        <p class="text-center text-xs text-jellyfin-muted">JellyDL v{{ appVersion }}</p>

      </div>
    </main>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
