<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import NavBar from '@/components/NavBar.vue'
import MediaCard from '@/components/MediaCard.vue'
import { useMediaLibrary } from '@/composables/useMediaLibrary'

const { items, loading, error, load } = useMediaLibrary('Series')

const search = ref('')

const filtered = computed(() => {
  const q = search.value.toLowerCase().trim()
  if (!q) return items.value
  return items.value.filter(
    (m) =>
      m.Name.toLowerCase().includes(q) ||
      String(m.ProductionYear ?? '').includes(q)
  )
})

onMounted(() => load())
</script>

<template>
  <div class="min-h-screen bg-jellyfin-bg text-jellyfin-text">
    <NavBar />

    <main class="pt-16">
      <!-- Page header -->
      <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-3xl font-bold text-jellyfin-text flex items-center gap-3">
              <svg class="w-7 h-7 text-jellyfin-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
                <path d="M17 2l-5 5-5-5"/>
              </svg>
              TV Shows
            </h1>
            <p v-if="!loading && !error" class="text-sm text-jellyfin-muted mt-1">
              {{ items.length }} series in your library
            </p>
          </div>

          <!-- Search -->
          <div class="relative w-full sm:w-72">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-jellyfin-muted">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </span>
            <input
              v-model="search"
              type="search"
              placeholder="Search TV shows…"
              class="w-full bg-jellyfin-surface border border-jellyfin-border text-jellyfin-text placeholder-jellyfin-muted/60 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-jellyfin-accent focus:border-transparent outline-none transition"
            />
          </div>
        </div>

        <!-- Loading skeletons -->
        <div v-if="loading" class="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
          <div
            v-for="n in 21"
            :key="n"
            class="bg-jellyfin-card rounded-lg overflow-hidden border border-jellyfin-border animate-pulse"
          >
            <div class="aspect-[2/3] bg-jellyfin-border" />
            <div class="p-3 space-y-2">
              <div class="h-3 bg-jellyfin-border rounded w-3/4" />
              <div class="h-3 bg-jellyfin-border rounded w-1/2" />
              <div class="h-7 bg-jellyfin-border rounded mt-2" />
            </div>
          </div>
        </div>

        <!-- Error state -->
        <div
          v-else-if="error"
          class="mt-16 flex flex-col items-center justify-center gap-4 text-center"
        >
          <svg class="w-16 h-16 text-red-400/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p class="text-jellyfin-muted max-w-md">{{ error }}</p>
          <button
            @click="load"
            class="flex items-center gap-2 bg-jellyfin-primary hover:bg-jellyfin-primary-hover text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Try again
          </button>
        </div>

        <!-- Empty search -->
        <div
          v-else-if="filtered.length === 0 && search"
          class="mt-16 flex flex-col items-center justify-center gap-3 text-center"
        >
          <svg class="w-12 h-12 text-jellyfin-muted/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <p class="text-jellyfin-muted">No shows found for "<strong class="text-jellyfin-text">{{ search }}</strong>"</p>
          <button @click="search = ''" class="text-jellyfin-primary text-sm hover:underline">Clear search</button>
        </div>

        <!-- Grid -->
        <div
          v-else
          class="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4"
        >
          <MediaCard v-for="item in filtered" :key="item.Id" :item="item" />
        </div>
      </div>
    </main>
  </div>
</template>
