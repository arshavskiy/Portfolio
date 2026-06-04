<script setup>
import {ref} from 'vue'
import {useRouter} from 'vue-router'
import {useToast} from 'primevue/usetoast'
import {useAuthStore} from '@/stores/auth'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'

const router = useRouter()
const toast = useToast()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const loading = ref(false)

const features = [
  {
    icon: 'pi pi-chart-bar',
    title: 'Live Portfolio',
    text: 'Track holdings, P&L, and value over time across stocks, crypto & global markets.'
  },
  {
    icon: 'pi pi-bell',
    title: 'Price Alerts',
    text: 'Get push notifications the moment a stock hits your target price.'
  },
  {
    icon: 'pi pi-globe',
    title: 'Multi-Market',
    text: 'US, TASE, Europe, Asia and crypto — all in one place, multi-currency.'
  },
  {
    icon: 'pi pi-upload',
    title: 'Import & Group',
    text: 'Import from Excel/CSV and organize holdings into custom groups.'
  },
]

async function submit() {
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    router.push('/')
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Login failed', detail: err.message, life: 3000 })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="landing">
    <!-- Hero / marketing -->
    <section class="hero">
      <div class="hero-inner">
        <div class="brand">
          <span class="brand-mark">📈</span>
          <span class="brand-name gradient-title">StockFolio</span>
        </div>

        <h1 class="hero-title">
          Your whole portfolio,<br/>
          <span class="gradient-title">beautifully in focus.</span>
        </h1>
        <p class="hero-sub">
          A fast, mobile-first tracker for stocks, crypto, and global markets —
          with live P&L, price alerts, and a clean dark interface.
        </p>

        <!-- Stylized phone mockup -->
        <div aria-hidden="true" class="mockup">
          <div class="phone">
            <div class="phone-notch"/>
            <div class="phone-screen">
              <div class="mk-header">
                <span class="mk-title gradient-title">Portfolio</span>
                <span class="mk-total">$48,210</span>
              </div>

              <div class="mk-card mk-gain">
                <div class="mk-row">
                  <div>
                    <div class="mk-ticker">NVDA</div>
                    <div class="mk-name">NVIDIA Corp</div>
                  </div>
                  <div class="mk-right">
                    <div class="mk-val">$12,540</div>
                    <span class="mk-badge up">+4.2%</span>
                  </div>
                </div>
                <svg class="mk-spark" preserveAspectRatio="none" viewBox="0 0 200 40">
                  <polyline class="spark-up"
                            points="0,32 20,28 40,30 60,22 80,24 100,16 120,18 140,10 160,12 180,6 200,4"/>
                </svg>
              </div>

              <div class="mk-card mk-loss">
                <div class="mk-row">
                  <div>
                    <div class="mk-ticker">BTC-USD</div>
                    <div class="mk-name">Bitcoin</div>
                  </div>
                  <div class="mk-right">
                    <div class="mk-val">$8,930</div>
                    <span class="mk-badge down">−2.1%</span>
                  </div>
                </div>
                <svg class="mk-spark" preserveAspectRatio="none" viewBox="0 0 200 40">
                  <polyline class="spark-down"
                            points="0,8 20,10 40,6 60,14 80,12 100,20 120,18 140,26 160,24 180,30 200,34"/>
                </svg>
              </div>

              <div class="mk-pills">
                <span class="mk-pill active">D</span>
                <span class="mk-pill">W</span>
                <span class="mk-pill">M</span>
                <span class="mk-pill">6M</span>
                <span class="mk-pill">Y</span>
              </div>
            </div>
          </div>
        </div>

        <div class="features">
          <div v-for="f in features" :key="f.title" class="feature">
            <i :class="f.icon" class="feature-icon"/>
            <div>
              <div class="feature-title">{{ f.title }}</div>
              <div class="feature-text text-muted">{{ f.text }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Login -->
    <section class="auth">
      <div class="auth-card">
        <h2 class="auth-heading">Welcome back</h2>
        <p class="auth-subheading text-muted">Sign in to your portfolio</p>

        <form class="auth-form" @submit.prevent="submit">
          <div class="field">
            <label>Email</label>
            <InputText v-model="email" fluid placeholder="you@example.com" required type="email"/>
          </div>
          <div class="field">
            <label>Password</label>
            <Password v-model="password" :feedback="false" fluid placeholder="Password" required toggleMask/>
          </div>
          <Button :loading="loading" fluid label="Sign In" type="submit"/>
        </form>

        <p class="auth-footer">
          No account?
          <RouterLink to="/register">Create one — it's free</RouterLink>
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing {
  min-height: 100dvh;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
}

/* ── Hero ── */
.hero {
  position: relative;
  padding: 2.5rem 1.25rem 1.5rem;
  overflow: hidden;
}

/* subtle radial glow backdrop */
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(60% 50% at 20% 0%, rgba(0, 207, 255, 0.12), transparent 70%),
  radial-gradient(50% 50% at 90% 20%, rgba(168, 85, 247, 0.12), transparent 70%);
  pointer-events: none;
}

.hero-inner {
  position: relative;
  max-width: 560px;
  margin: 0 auto;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1.75rem;
}

.brand-mark {
  font-size: 1.6rem;
}

.brand-name {
  font-size: 1.35rem;
  font-weight: 800;
}

.hero-title {
  font-size: 1.9rem;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin-bottom: 0.75rem;
}

.hero-sub {
  font-size: 0.95rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 1.75rem;
  max-width: 460px;
}

/* ── Phone mockup ── */
.mockup {
  display: flex;
  justify-content: center;
  margin: 0 0 2rem;
}

.phone {
  position: relative;
  width: 230px;
  background: #0a0a0a;
  border: 2px solid #2a2a2a;
  border-radius: 28px;
  padding: 12px 10px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6),
  0 0 0 1px rgba(255, 255, 255, 0.03) inset,
  0 0 60px rgba(0, 207, 255, 0.08);
  transform: rotate(-3deg);
  transition: transform 0.3s;
}

.phone:hover {
  transform: rotate(0deg);
}

.phone-notch {
  position: absolute;
  top: 7px;
  left: 50%;
  transform: translateX(-50%);
  width: 70px;
  height: 5px;
  background: #2a2a2a;
  border-radius: 3px;
}

.phone-screen {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.mk-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 2px 2px 4px;
}

.mk-title {
  font-size: 0.82rem;
  font-weight: 800;
}

.mk-total {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-primary);
}

.mk-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 9px 4px;
}

.mk-gain {
  border-color: rgba(0, 195, 106, 0.4);
  box-shadow: 0 0 12px rgba(0, 195, 106, 0.12);
}

.mk-loss {
  border-color: rgba(224, 45, 74, 0.4);
  box-shadow: 0 0 12px rgba(224, 45, 74, 0.12);
}

.mk-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.mk-ticker {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--text-primary);
}

.mk-name {
  font-size: 0.55rem;
  color: var(--text-secondary);
}

.mk-right {
  text-align: right;
}

.mk-val {
  font-size: 0.68rem;
  font-weight: 700;
}

.mk-badge {
  display: inline-block;
  font-size: 0.55rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  margin-top: 2px;
}

.mk-badge.up {
  background: #00c36a;
  color: #fff;
}

.mk-badge.down {
  background: #e02d4a;
  color: #fff;
}

.mk-spark {
  width: 100%;
  height: 26px;
  margin-top: 3px;
  display: block;
}

.mk-spark polyline {
  fill: none;
  stroke-width: 1.6;
  vector-effect: non-scaling-stroke;
}

.spark-up {
  stroke: #00ff88;
  filter: drop-shadow(0 0 2px rgba(0, 255, 136, 0.6));
}

.spark-down {
  stroke: #ff3366;
  filter: drop-shadow(0 0 2px rgba(255, 51, 102, 0.6));
}

.mk-pills {
  display: flex;
  gap: 3px;
  margin-top: 2px;
}

.mk-pill {
  flex: 1;
  text-align: center;
  font-size: 0.55rem;
  font-weight: 700;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 3px 0;
}

.mk-pill.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.features {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.feature {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
}

.feature-icon {
  font-size: 1.05rem;
  color: var(--accent);
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 10px;
  padding: 9px;
  flex-shrink: 0;
}

.feature-title {
  font-weight: 700;
  font-size: 0.92rem;
}

.feature-text {
  font-size: 0.8rem;
  line-height: 1.4;
  margin-top: 2px;
}

/* ── Auth ── */
.auth {
  padding: 1.5rem 1.25rem 2.5rem;
  display: flex;
  justify-content: center;
}
.auth-card {
  width: 100%;
  max-width: 420px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.75rem;
}

.auth-heading {
  font-size: 1.25rem;
  font-weight: 700;
}

.auth-subheading {
  font-size: 0.85rem;
  margin: 2px 0 1.5rem;
}
.auth-form { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }
.field label { font-size: 0.85rem; color: var(--text-secondary); }
.auth-footer { margin-top: 1.5rem; text-align: center; color: var(--text-secondary); font-size: 0.9rem; }
.auth-footer a { color: var(--accent); text-decoration: none; }

/* ── Desktop: side-by-side split ── */
@media (min-width: 900px) {
  .landing {
    flex-direction: row;
    align-items: stretch;
  }

  .hero {
    flex: 1.2;
    display: flex;
    align-items: center;
    padding: 3rem;
    border-right: 1px solid var(--border);
  }

  .hero-title {
    font-size: 2.6rem;
  }

  .hero-sub {
    font-size: 1.05rem;
  }

  .auth {
    flex: 1;
    align-items: center;
    padding: 3rem;
  }
}
</style>
