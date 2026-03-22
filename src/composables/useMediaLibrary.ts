import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { JellyfinMediaItem, JellyfinLibrary } from '@/api/jellyfin'

export type MediaType = 'Movie' | 'Series'

const LIBRARY_TYPE_MAP: Record<MediaType, string[]> = {
  Movie: ['movies'],
  Series: ['tvshows'],
}

export function useMediaLibrary(mediaType: MediaType) {
  const auth = useAuthStore()

  const items = ref<JellyfinMediaItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    items.value = []

    try {
      const api = auth.getApiClient()

      // Get all library folders and pick the ones matching our type
      const libraries: JellyfinLibrary[] = await api.getLibraries(auth.userId!)
      const allowed = LIBRARY_TYPE_MAP[mediaType]
      const matching = libraries.filter((lib) =>
        allowed.includes((lib.CollectionType ?? '').toLowerCase())
      )

      if (matching.length === 0) {
        error.value = `No ${mediaType === 'Movie' ? 'movie' : 'TV show'} libraries found in Jellyfin.`
        return
      }

      // Fetch items from all matching libraries in parallel
      const results = await Promise.all(
        matching.map((lib) => api.getItems(lib.Id, mediaType))
      )

      // Merge + deduplicate by Id
      const seen = new Set<string>()
      const merged: JellyfinMediaItem[] = []
      for (const batch of results) {
        for (const item of batch) {
          if (!seen.has(item.Id)) {
            seen.add(item.Id)
            merged.push(item)
          }
        }
      }

      // Sort by name
      merged.sort((a, b) => a.Name.localeCompare(b.Name))
      items.value = merged
    } catch (e: unknown) {
      const axiosError = e as { response?: { status?: number } }
      if (axiosError?.response?.status === 401) {
        error.value = 'Session expired. Please sign in again.'
      } else {
        error.value = 'Could not load library. Check your Jellyfin server connection.'
      }
    } finally {
      loading.value = false
    }
  }

  return { items, loading, error, load }
}
