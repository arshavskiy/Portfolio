import {createRouter, createWebHistory} from 'vue-router'
import {useAuthStore} from '@/stores/auth'

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/views/LoginView.vue'), meta: { guest: true } },
  { path: '/register', name: 'Register', component: () => import('@/views/RegisterView.vue'), meta: { guest: true } },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      { path: '', name: 'Dashboard', component: () => import('@/views/DashboardView.vue'), meta: { requiresAuth: true } },
      {path: 'about', name: 'About', component: () => import('@/views/AboutView.vue')},
      {path: 'math', name: 'Math', component: () => import('@/views/MathView.vue'), meta: {requiresAuth: true, requiresAdmin: true}},
      {path: 'help', name: 'Help', component: () => import('@/views/HelpView.vue')},
      {path: 'disclaimer', name: 'Disclaimer', component: () => import('@/views/DisclaimerView.vue')},
      { path: 'news/article/:id', name: 'NewsArticle', component: () => import('@/views/NewsArticleView.vue'), meta: { requiresAuth: true } },
      { path: 'news', name: 'News', component: () => import('@/views/NewsView.vue'), meta: { requiresAuth: true } },
      { path: 'holdings', redirect: '/watchlist' },
        {
            path: 'rebalance',
            name: 'Rebalance',
            component: () => import('@/views/RebalanceView.vue'),
            meta: {requiresAuth: true}
        },
      { path: 'watchlist', name: 'Watchlist', component: () => import('@/views/WatchlistView.vue'), meta: { requiresAuth: true } },
      {
        path: 'typology-map',
        name: 'TypologyMap',
        component: () => import('@/views/TypologyMapView.vue'),
        meta: {requiresAuth: true}
      },
      {
        path: 'insights',
        name: 'AssistantAI',
        component: () => import('@/views/InsightsView.vue'),
        meta: {requiresAuth: true, requiresPremium: true}
      },
      {
        path: 'x-ray',
        name: 'PortfolioXRay',
        component: () => import('@/views/PortfolioXRayView.vue'),
        meta: {requiresAuth: true, requiresPremium: true}
      },
      {
        path: 'insights-data',
        name: 'InsightsData',
        component: () => import('@/views/InsightsDataView.vue'),
        meta: {requiresAuth: true, requiresAdmin: true, desktopOnly: true}
      },
      { path: 'transactions', name: 'Transactions', component: () => import('@/views/TransactionsView.vue'), meta: { requiresAuth: true } },
      { path: 'transactions-alerts', name: 'TransactionsAlerts', component: () => import('@/views/DesktopTransactionsAlertsView.vue'), meta: { requiresAuth: true } },
      { path: 'stock/:ticker', redirect: to => `/position/${encodeURIComponent(to.params.ticker)}` },
      { path: 'position/:ticker', name: 'PositionDetail', component: () => import('@/views/PositionDetailView.vue'), meta: { requiresAuth: true } },
      { path: 'alerts', name: 'Alerts', component: () => import('@/views/AlertsView.vue'), meta: { requiresAuth: true } },
      { path: 'history-alerts', name: 'HistoryAlerts', component: () => import('@/views/DesktopHistoryAlertsView.vue'), meta: { requiresAuth: true } },
      { path: 'profile', redirect: '/account' },
      { path: 'account', name: 'Account', component: () => import('@/views/AccountView.vue'), meta: { requiresAuth: true } },
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
  if (to.meta.requiresAdmin && !auth.isAdmin) return {name: 'Dashboard'}
  if (to.meta.requiresPremium && auth.isRegularUser) return {name: 'Dashboard'}
  if (to.meta.desktopOnly && typeof window !== 'undefined' && window.innerWidth < 1024) return {name: 'Dashboard'}
})

export default router
