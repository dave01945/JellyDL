<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useQueueStore } from '@/stores/queue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const queue = useQueueStore()

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <nav class="fixed top-0 left-0 right-0 z-40 bg-jellyfin-surface/95 backdrop-blur border-b border-jellyfin-border">
    <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">

        <!-- Logo -->
        <RouterLink to="/movies" class="flex items-center gap-2 group">
          <svg class="w-8 h-8 text-jellyfin-primary" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="currentColor" fill-opacity="0.15"/>
            <path d="M10 8l14 8-14 8V8z" fill="currentColor"/>
            <!-- Download arrow indicator -->
            <path d="M22 22h4M24 20v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span class="text-xl font-bold tracking-tight text-jellyfin-text group-hover:text-jellyfin-primary transition-colors">
            Jelly<span class="text-jellyfin-primary">DL</span>
          </span>
        </RouterLink>

        <!-- Nav Links (hidden when not authenticated, e.g. settings from login page) -->
        <div v-if="auth.isAuthenticated" class="flex items-center gap-1">
          <RouterLink
            to="/movies"
            :class="[
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              route.name === 'movies'
                ? 'bg-jellyfin-primary/10 text-jellyfin-primary'
                : 'text-jellyfin-muted hover:text-jellyfin-text hover:bg-white/5'
            ]"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
              <path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5"/>
            </svg>
            Movies
          </RouterLink>

          <RouterLink
            to="/queue"
            :class="[
              'relative flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              route.name === 'queue'
                ? 'bg-jellyfin-primary/10 text-jellyfin-primary'
                : 'text-jellyfin-muted hover:text-jellyfin-text hover:bg-white/5'
            ]"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            Queue
            <span
              v-if="queue.activeCount > 0"
              class="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-jellyfin-primary text-white text-[10px] font-bold rounded-full px-1 leading-none"
            >{{ queue.activeCount }}</span>
          </RouterLink>

          <RouterLink
            to="/tv"
            :class="[
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              route.name === 'tv'
                ? 'bg-jellyfin-primary/10 text-jellyfin-primary'
                : 'text-jellyfin-muted hover:text-jellyfin-text hover:bg-white/5'
            ]"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
              <path d="M17 2l-5 5-5-5"/>
            </svg>
            TV Shows
          </RouterLink>
        </div>

        <!-- Right side: Settings + User -->
        <div class="flex items-center gap-3">
          <RouterLink
            to="/settings"
            :class="[
              'p-2 rounded-md transition-colors',
              route.name === 'settings'
                ? 'text-jellyfin-primary bg-jellyfin-primary/10'
                : 'text-jellyfin-muted hover:text-jellyfin-text hover:bg-white/5'
            ]"
            title="Settings"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </RouterLink>

          <!-- User avatar / logout (only when authenticated) -->
          <div v-if="auth.isAuthenticated" class="flex items-center gap-2 pl-3 border-l border-jellyfin-border">
            <div class="w-8 h-8 rounded-full bg-jellyfin-primary/20 flex items-center justify-center text-jellyfin-primary text-sm font-semibold select-none">
              {{ auth.username?.charAt(0).toUpperCase() ?? '?' }}
            </div>
            <span class="text-sm text-jellyfin-text hidden sm:block max-w-[120px] truncate">
              {{ auth.username }}
            </span>
            <button
              @click="logout"
              class="p-2 rounded-md text-jellyfin-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="Sign out"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </button>
          </div>
        </div>

      </div>
    </div>
  </nav>
</template>
