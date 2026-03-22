import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'jellyfindl_settings'

interface PersistedSettings {
  jellyfinUrl: string
}

function loadFromStorage(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as PersistedSettings
  } catch {
    // ignore corrupt storage
  }
  return {
    jellyfinUrl: import.meta.env.VITE_JELLYFIN_URL ?? '',
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const saved = loadFromStorage()
  const jellyfinUrl = ref<string>(saved.jellyfinUrl)

  function save() {
    const data: PersistedSettings = { jellyfinUrl: jellyfinUrl.value }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  function setJellyfinUrl(url: string) {
    jellyfinUrl.value = url.replace(/\/+$/, '')
    save()
  }

  return { jellyfinUrl, setJellyfinUrl }
})
