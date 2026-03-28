import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { JellyfinAPI } from '@/api/jellyfin'
import type { JellyfinUser } from '@/api/jellyfin'

const AUTH_STORAGE_KEY = 'jellyfindl_auth'

interface PersistedAuth {
  token: string
  userId: string
  username: string
}

function loadAuth(): PersistedAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as PersistedAuth
  } catch {
    // ignore
  }
  return null
}

export const useAuthStore = defineStore('auth', () => {
  const saved = loadAuth()

  const token = ref<string | null>(saved?.token ?? null)
  const userId = ref<string | null>(saved?.userId ?? null)
  const username = ref<string | null>(saved?.username ?? null)
  const error = ref<string | null>(null)
  const loading = ref(false)

  const isAuthenticated = computed(() => !!token.value)

  function persist() {
    if (token.value && userId.value && username.value) {
      const data: PersistedAuth = {
        token: token.value,
        userId: userId.value,
        username: username.value,
      }
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data))
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  }

  async function login(usernameInput: string, password: string): Promise<boolean> {
    const settings = useSettingsStore()

    loading.value = true
    error.value = null

    try {
      const api = new JellyfinAPI(settings.jellyfinUrl)
      const result = await api.login(usernameInput, password)

      token.value = result.AccessToken
      userId.value = result.User.Id
      username.value = result.User.Name

      persist()
      return true
    } catch (e: unknown) {
      const axiosError = e as { response?: { status?: number } }
      if (axiosError?.response?.status === 401) {
        error.value = 'Invalid username or password.'
      } else if (axiosError?.response?.status === 0 || !axiosError?.response) {
        error.value = 'Cannot reach Jellyfin server. Check the URL in Settings.'
      } else {
        error.value = 'Login failed. Please try again.'
      }
      return false
    } finally {
      loading.value = false
    }
  }

  function logout() {
    token.value = null
    userId.value = null
    username.value = null
    error.value = null
    persist()
  }

  /** Build an authenticated API client for the current session */
  function getApiClient(): JellyfinAPI {
    const settings = useSettingsStore()
    return new JellyfinAPI(settings.jellyfinUrl, token.value ?? undefined)
  }

  // Expose user info as a convenient object
  const user = computed<JellyfinUser | null>(() =>
    token.value && userId.value && username.value
      ? { Id: userId.value, Name: username.value, HasPassword: true }
      : null
  )

  return { token, userId, username, user, error, loading, isAuthenticated, login, logout, getApiClient }
})
