import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Tooltip from 'primevue/tooltip'
import 'primeicons/primeicons.css'
import './style.css'

import App from './App.vue'
import router from './router'
import {installAnalytics} from './composables/useAnalytics'
import {installClientErrorLogging} from './composables/useClientErrors'

const app = createApp(App)

console.log('env:', import.meta.env);
app.use(createPinia())
app.use(router)
installAnalytics(router)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      prefix: 'p',
      darkModeSelector: '.dark',
      cssLayer: false,
    },
  },
})
app.use(ToastService)
installClientErrorLogging(app)
app.use(ConfirmationService)
app.directive('tooltip', Tooltip)

app.mount('#app')
