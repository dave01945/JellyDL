<script setup lang="ts">
import { ref } from 'vue'
import type { JellyfinMediaItem } from '@/api/jellyfin'
import DownloadModal from '@/components/DownloadModal.vue'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'

defineProps<{
  item: JellyfinMediaItem
}>()

const settings = useSettingsStore()
const auth = useAuthStore()
const showDownload = ref(false)
const imageError = ref(false)

function formatRuntime(ticks?: number): string {
  if (!ticks) return ''
  const minutes = Math.floor(ticks / 600_000_000)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function posterUrl(id: string): string {
  const base = `${settings.jellyfinUrl}/Items/${id}/Images/Primary?fillHeight=450&quality=96`
  const full = auth.token ? `${base}&api_key=${auth.token}` : base
  return import.meta.env.DEV ? `/img-proxy?url=${encodeURIComponent(full)}` : full
}
</script>

<template>
  <div
    class="group relative flex flex-col bg-jellyfin-card rounded-lg overflow-hidden border border-jellyfin-border hover:border-jellyfin-primary/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/50"
  >
    <!-- Poster image -->
    <div class="relative aspect-[2/3] bg-jellyfin-bg overflow-hidden">
      <img
        v-if="!imageError"
        :src="posterUrl(item.Id)"
        :alt="item.Name"
        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
        @error="imageError = true"
      />
      <!-- Fallback when no poster available -->
      <div
        v-else
        class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-jellyfin-surface to-jellyfin-bg text-jellyfin-muted gap-3"
      >
        <svg class="w-12 h-12 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
          <path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5"/>
        </svg>
        <span class="text-xs text-center px-2 line-clamp-3">{{ item.Name }}</span>
      </div>

      <!-- Download hover overlay -->
      <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
        <button
          @click.stop="showDownload = true"
          class="flex items-center gap-2 bg-jellyfin-primary hover:bg-jellyfin-primary-hover text-white font-semibold px-5 py-2.5 rounded-lg transition-colors shadow-lg text-sm"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          Download
        </button>
      </div>

      <!-- Type badge -->
      <div
        v-if="item.Type === 'Series'"
        class="absolute top-2 left-2 bg-jellyfin-accent/90 text-white text-xs font-semibold px-2 py-0.5 rounded"
      >
        Series
      </div>

      <!-- Rating badge -->
      <div
        v-if="item.CommunityRating"
        class="absolute top-2 right-2 flex items-center gap-1 bg-black/70 text-yellow-400 text-xs font-semibold px-2 py-0.5 rounded"
      >
        <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        {{ item.CommunityRating.toFixed(1) }}
      </div>
    </div>

    <!-- Info section -->
    <div class="flex flex-col flex-1 p-3 gap-1">
      <h3 class="font-semibold text-jellyfin-text text-sm leading-tight line-clamp-2">
        {{ item.Name }}
      </h3>

      <div class="flex items-center gap-2 text-xs text-jellyfin-muted flex-wrap">
        <span v-if="item.ProductionYear">{{ item.ProductionYear }}</span>
        <span
          v-if="item.OfficialRating"
          class="border border-jellyfin-border px-1 rounded text-[10px] leading-tight"
        >
          {{ item.OfficialRating }}
        </span>
        <span v-if="item.Type === 'Movie' && item.RunTimeTicks">
          {{ formatRuntime(item.RunTimeTicks) }}
        </span>
        <span v-if="item.Type === 'Series' && item.SeasonCount">
          {{ item.SeasonCount }} season{{ item.SeasonCount !== 1 ? 's' : '' }}
        </span>
      </div>

      <p
        v-if="item.Overview"
        class="text-xs text-jellyfin-muted line-clamp-3 leading-relaxed pt-1"
      >
        {{ item.Overview }}
      </p>

      <!-- Download button (always visible) -->
      <div class="mt-auto pt-2">
        <button
          @click="showDownload = true"
          class="w-full flex items-center justify-center gap-2 bg-jellyfin-primary/10 hover:bg-jellyfin-primary text-jellyfin-primary hover:text-white border border-jellyfin-primary/30 hover:border-jellyfin-primary font-medium px-3 py-2 rounded-md transition-all duration-150 text-xs"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          Download
        </button>
      </div>
    </div>
  </div>

  <DownloadModal
    v-if="showDownload"
    :item="item"
    @close="showDownload = false"
  />
</template>
