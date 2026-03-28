<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const showPassword = ref(false)

async function handleLogin() {
  if (!username.value.trim() || !password.value) return
  const ok = await auth.login(username.value.trim(), password.value)
  if (ok) {
    const redirect = (route.query.redirect as string) || '/movies'
    router.push(redirect)
  }
}
</script>

<template>
  <div class="min-h-screen bg-jellyfin-bg flex flex-col items-center justify-center px-4 py-12">

    <!-- Background gradient blobs  -->
    <div class="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div class="absolute -top-48 -left-32 w-96 h-96 rounded-full bg-jellyfin-primary/10 blur-3xl" />
      <div class="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-jellyfin-accent/10 blur-3xl" />
    </div>

    <!-- Card -->
    <div class="relative w-full max-w-md">

      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center gap-3">
          <svg class="w-10 h-10 text-jellyfin-primary" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="currentColor" fill-opacity="0.15"/>
            <path d="M10 8l14 8-14 8V8z" fill="currentColor"/>
            <path d="M22 22h4M24 20v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span class="text-3xl font-bold tracking-tight text-jellyfin-text">
            Jelly<span class="text-jellyfin-primary">DL</span>
          </span>
        </div>
        <p class="mt-2 text-sm text-jellyfin-muted">Sign in with your Jellyfin account</p>
      </div>

      <!-- Login form -->
      <div class="bg-jellyfin-surface border border-jellyfin-border rounded-xl shadow-2xl overflow-hidden">
        <form @submit.prevent="handleLogin" class="p-8 space-y-5">

          <!-- Username -->
          <div class="space-y-1.5">
            <label for="username" class="block text-sm font-medium text-jellyfin-text">
              Username
            </label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-jellyfin-muted">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <input
                id="username"
                v-model="username"
                type="text"
                autocomplete="username"
                required
                placeholder="Enter your username"
                class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text placeholder-jellyfin-muted/60 rounded-lg pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent outline-none transition"
              />
            </div>
          </div>

          <!-- Password -->
          <div class="space-y-1.5">
            <label for="password" class="block text-sm font-medium text-jellyfin-text">
              Password
            </label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-jellyfin-muted">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
              </span>
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                required
                placeholder="Enter your password"
                class="w-full bg-jellyfin-bg border border-jellyfin-border text-jellyfin-text placeholder-jellyfin-muted/60 rounded-lg pl-10 pr-11 py-3 text-sm focus:ring-2 focus:ring-jellyfin-primary focus:border-transparent outline-none transition"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute inset-y-0 right-0 px-3 flex items-center text-jellyfin-muted hover:text-jellyfin-text transition-colors"
                :aria-label="showPassword ? 'Hide password' : 'Show password'"
              >
                <svg v-if="showPassword" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/>
                </svg>
                <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Error -->
          <Transition name="fade">
            <div
              v-if="auth.error"
              class="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400"
            >
              <svg class="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {{ auth.error }}
            </div>
          </Transition>

          <!-- Submit -->
          <button
            type="submit"
            :disabled="auth.loading || !username || !password"
            class="w-full flex items-center justify-center gap-2 bg-jellyfin-primary hover:bg-jellyfin-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors text-sm"
          >
            <svg
              v-if="auth.loading"
              class="w-4 h-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            <span>{{ auth.loading ? 'Signing in…' : 'Sign In' }}</span>
          </button>

        </form>

        <!-- Footer link -->
        <div class="px-8 pb-6 text-center">
          <p class="text-xs text-jellyfin-muted">
            Connect to a different server?
            <RouterLink to="/settings" class="text-jellyfin-primary hover:underline">Configure server URL</RouterLink>
          </p>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
