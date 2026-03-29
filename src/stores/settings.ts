import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { QualityPreset } from '@/api/jellyfin'

const STORAGE_KEY = 'jellyfindl_settings_v2'

interface PersistedSettings {
  jellyfinUrl: string
  defaultQualityPreset: QualityPreset
}

function loadFromStorage(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as PersistedSettings
  } catch {
    // ignore corrupt storage
  }
  return {
    jellyfinUrl: '',
    defaultQualityPreset: 'Custom',
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const saved = loadFromStorage()
  const jellyfinUrl = ref<string>(saved.jellyfinUrl)
  const defaultQualityPreset = ref<QualityPreset>(saved.defaultQualityPreset ?? 'Custom')

  function save() {
    const data: PersistedSettings = {
      jellyfinUrl: jellyfinUrl.value,
      defaultQualityPreset: defaultQualityPreset.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  function setJellyfinUrl(url: string) {
    jellyfinUrl.value = url.replace(/\/+$/, '')
    save()
  }

  function setDefaultQualityPreset(preset: QualityPreset) {
    defaultQualityPreset.value = preset
    save()
  }

  return {
    jellyfinUrl,
    defaultQualityPreset,
    setJellyfinUrl,
    setDefaultQualityPreset,
  }
})
