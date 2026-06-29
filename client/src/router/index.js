import {createRouter, createWebHistory} from 'vue-router'
import {useAuthStore} from '@/stores/auth'

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/views/LoginView.vue'), meta: { guest: true } },
  { path: '/register', name: 'Register', component: () => import('@/views/RegisterView.vue'), meta: { guest: true } },
  {path: '/about', name: 'About', component: () => import('@/views/AboutView.vue')},
  {path: '/disclaimer', name: 'Disclaimer', component: () => import('@/views/DisclaimerView.vue')},
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      { path: '', name: 'Dashboard', component: () => import('@/views/DashboardView.vue'), meta: { requiresAuth: true } },
      { path: 'news/article/:id', name: 'NewsArticle', component: () => import('@/views/NewsArticleView.vue'), meta: { requiresAuth: true } },
      { path: 'news', name: 'News', component: () => import('@/views/NewsView.vue'), meta: { requiresAuth: true } },
      { path: 'holdings', name: 'Holdings', component: () => import('@/views/HoldingsView.vue'), meta: { requiresAuth: true } },
        {
            path: 'rebalance',
            name: 'Rebalance',
            component: () => import('@/views/RebalanceView.vue'),
            meta: {requiresAuth: true}
        },
      { path: 'watchlist', name: 'Watchlist', component: () => import('@/views/WatchlistView.vue'), meta: { requiresAuth: true } },
      { path: 'transactions', name: 'Transactions', component: () => import('@/views/TransactionsView.vue'), meta: { requiresAuth: true } },
      { path: 'transactions-alerts', name: 'TransactionsAlerts', component: () => import('@/views/DesktopTransactionsAlertsView.vue'), meta: { requiresAuth: true } },
      { path: 'stock/:ticker', redirect: to => `/position/${encodeURIComponent(to.params.ticker)}` },
      { path: 'position/:ticker', name: 'PositionDetail', component: () => import('@/views/PositionDetailView.vue'), meta: { requiresAuth: true } },
      { path: 'alerts', name: 'Alerts', component: () => import('@/views/AlertsView.vue'), meta: { requiresAuth: true } },
      { path: 'history-alerts', name: 'HistoryAlerts', component: () => import('@/views/DesktopHistoryAlertsView.vue'), meta: { requiresAuth: true } },
      { path: 'profile', name: 'Profile', component: () => import('@/views/ProfileView.vue'), meta: { requiresAuth: true } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, savedPosition) => savedPosition || {top: 0},
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.token) return { name: 'Login' }
  if (to.meta.guest && auth.token) return { name: 'Dashboard' }
})

export default router
