import {defineConfig, loadEnv} from 'vite'
import vue from '@vitejs/plugin-vue'
import {VitePWA} from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'
import {fileURLToPath, URL} from 'node:url'
import {resolveApiProxyTarget} from './src/config/api.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = resolveApiProxyTarget(env.VITE_API_PROXY_TARGET)

  return {
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    plugins: [
      vue(),
      tailwindcss(),
      VitePWA({
      registerType: 'autoUpdate',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'StockFolio',
        short_name: 'StockFolio',
        description: 'Personal Stocks Portfolio Tracker',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone', 'minimal-ui'],
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
        injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
        devOptions: {
          // Service worker disabled in dev — it caches JS bundles and serves
          // stale code, defeating HMR. The production build keeps the full SW
          // (push/offline). Set to true only when testing push locally.
          enabled: false,
          type: 'module',
        },
      }),
    ],
    server: {
      host: true,
      proxy: {
        '/api': { target: apiProxyTarget, changeOrigin: true },
      },
    },
  }
})
