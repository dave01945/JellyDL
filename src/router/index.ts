import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      redirect: '/movies',
    },
    {
      path: '/movies',
      name: 'movies',
      component: () => import('@/views/MoviesView.vue'),
    },
    {
      path: '/tv',
      name: 'tv',
      component: () => import('@/views/TvShowsView.vue'),
    },
    {
      path: '/queue',
      name: 'queue',
      component: () => import('@/views/QueueView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { public: true },
    },
    {
      // Catch-all: redirect to movies
      path: '/:pathMatch(.*)*',
      redirect: '/movies',
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'movies' }
  }
})

export default router
