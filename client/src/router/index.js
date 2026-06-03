import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/views/LoginView.vue'), meta: { guest: true } },
  { path: '/register', name: 'Register', component: () => import('@/views/RegisterView.vue'), meta: { guest: true } },
  {
    path: '/',
    component: () => import('@/layouts/MobileLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'Dashboard', component: () => import('@/views/DashboardView.vue') },
      { path: 'holdings', name: 'Holdings', component: () => import('@/views/HoldingsView.vue') },
      { path: 'watchlist', name: 'Watchlist', component: () => import('@/views/WatchlistView.vue') },
      { path: 'transactions', name: 'Transactions', component: () => import('@/views/TransactionsView.vue') },
      { path: 'stock/:ticker', name: 'StockDetail', component: () => import('@/views/StockDetailView.vue') },
      { path: 'position/:ticker', name: 'PositionDetail', component: () => import('@/views/PositionDetailView.vue') },
      { path: 'profile', name: 'Profile', component: () => import('@/views/ProfileView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.token) return { name: 'Login' }
  if (to.meta.guest && auth.token) return { name: 'Dashboard' }
})

export default router
