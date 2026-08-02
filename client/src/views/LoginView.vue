<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "@/stores/auth";
import InputText from "primevue/inputtext";
import Password from "primevue/password";
import Button from "primevue/button";
import ThemeToggle from "@/components/ui/ThemeToggle.vue";
import PremiumBadge from "@/components/ui/PremiumBadge.vue";
import { useI18n } from "@/composables/useI18n";

const PASSWORD_RULE = /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const router = useRouter();
const route = useRoute();
const toast = useToast();
const auth = useAuthStore();
const { locale, t } = useI18n();

const mode = ref("login");
const name = ref("");
const identifier = ref("");
const password = ref("");
const loading = ref(false);
const magicLinkLoading = ref(false);
const showAuthModal = ref(false);
const googleButtonLogin = ref(null);
const googleButtonRegister = ref(null);
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const pageUrl = "/login";
const pageTitle = computed(() => t("login.metaTitle"));
const pageDescription = computed(() => t("login.metaDescription"));
const passwordValid = computed(() => PASSWORD_RULE.test(password.value));
const loginEnabled = computed(() => identifier.value.trim() && password.value);
const registerEnabled = computed(
  () =>
    name.value.trim() &&
    identifier.value.trim() &&
    password.value &&
    passwordValid.value,
);

const previousHead = {
  title: "",
  description: "",
  robots: "",
  ogTitle: "",
  ogDescription: "",
  ogUrl: "",
  twitterTitle: "",
  twitterDescription: "",
  canonicalHref: "",
};

function ensureMeta(selector, attrs) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement("meta");
    document.head.appendChild(node);
  }

  Object.entries(attrs).forEach(([key, value]) =>
    node.setAttribute(key, value),
  );
  return node;
}

function ensureCanonical() {
  let node = document.head.querySelector('link[rel="canonical"]');
  if (!node) {
    node = document.createElement("link");
    node.setAttribute("rel", "canonical");
    document.head.appendChild(node);
  }
  return node;
}

function updateLoginHead() {
  const canonicalUrl = new URL(pageUrl, window.location.origin).toString();
  document.title = pageTitle.value;
  ensureMeta('meta[name="description"]', {
    name: "description",
    content: pageDescription.value,
  });
  ensureMeta('meta[name="robots"]', {
    name: "robots",
    content: "index,follow",
  });
  ensureMeta('meta[property="og:title"]', {
    property: "og:title",
    content: pageTitle.value,
  });
  ensureMeta('meta[property="og:description"]', {
    property: "og:description",
    content: pageDescription.value,
  });
  ensureMeta('meta[property="og:type"]', {
    property: "og:type",
    content: "website",
  });
  ensureMeta('meta[property="og:url"]', {
    property: "og:url",
    content: canonicalUrl,
  });
  ensureMeta('meta[name="twitter:card"]', {
    name: "twitter:card",
    content: "summary_large_image",
  });
  ensureMeta('meta[name="twitter:title"]', {
    name: "twitter:title",
    content: pageTitle.value,
  });
  ensureMeta('meta[name="twitter:description"]', {
    name: "twitter:description",
    content: pageDescription.value,
  });
  ensureCanonical().setAttribute("href", canonicalUrl);
}

// ── Animated phone slideshow ──
const SLIDE_COUNT = 10;
const slide = ref(0);
let slideTimer = null;

onMounted(() => {
  previousHead.title = document.title;
  previousHead.description =
    document.head
      .querySelector('meta[name="description"]')
      ?.getAttribute("content") || "";
  previousHead.robots =
    document.head
      .querySelector('meta[name="robots"]')
      ?.getAttribute("content") || "";
  previousHead.ogTitle =
    document.head
      .querySelector('meta[property="og:title"]')
      ?.getAttribute("content") || "";
  previousHead.ogDescription =
    document.head
      .querySelector('meta[property="og:description"]')
      ?.getAttribute("content") || "";
  previousHead.ogUrl =
    document.head
      .querySelector('meta[property="og:url"]')
      ?.getAttribute("content") || "";
  previousHead.twitterTitle =
    document.head
      .querySelector('meta[name="twitter:title"]')
      ?.getAttribute("content") || "";
  previousHead.twitterDescription =
    document.head
      .querySelector('meta[name="twitter:description"]')
      ?.getAttribute("content") || "";
  previousHead.canonicalHref =
    document.head
      .querySelector('link[rel="canonical"]')
      ?.getAttribute("href") || "";

  updateLoginHead();

  // Always cycle the content; CSS disables the slide transition under
  // prefers-reduced-motion (so it just swaps instead of fully stopping).
  slideTimer = setInterval(() => {
    slide.value = (slide.value + 1) % SLIDE_COUNT;
  }, 2600);

  loadGoogleScript();

  const magicToken = route.query.magic;
  if (magicToken) consumeMagicLink(magicToken);
});
onUnmounted(() => {
  clearInterval(slideTimer);

  document.title = previousHead.title || "StockFolio";
  ensureMeta('meta[name="description"]', {
    name: "description",
    content:
      previousHead.description ||
      "Track stocks, crypto, holdings, and market moves with StockFolio.",
  });
  ensureMeta('meta[name="robots"]', {
    name: "robots",
    content: previousHead.robots || "index,follow",
  });
  ensureMeta('meta[property="og:title"]', {
    property: "og:title",
    content: previousHead.ogTitle || document.title,
  });
  ensureMeta('meta[property="og:description"]', {
    property: "og:description",
    content: previousHead.ogDescription || previousHead.description || "",
  });
  ensureMeta('meta[property="og:url"]', {
    property: "og:url",
    content: previousHead.ogUrl || window.location.origin,
  });
  ensureMeta('meta[name="twitter:title"]', {
    name: "twitter:title",
    content: previousHead.twitterTitle || document.title,
  });
  ensureMeta('meta[name="twitter:description"]', {
    name: "twitter:description",
    content: previousHead.twitterDescription || previousHead.description || "",
  });
  ensureCanonical().setAttribute(
    "href",
    previousHead.canonicalHref || window.location.origin,
  );
});


async function submit() {
  loading.value = true;
  try {
    await auth.login(identifier.value, password.value);
    router.push("/");
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("login.loginFailed"),
      detail: err.message,
      life: 3000,
    });
  } finally {
    loading.value = false;
  }
}

async function register() {
  if (!passwordValid.value) {
    toast.add({
      severity: "warn",
      summary: t("login.weakPassword"),
      detail: t("login.weakPasswordDetail"),
      life: 3000,
    });
    return;
  }

  loading.value = true;
  try {
    await auth.register(name.value, identifier.value, password.value);
    router.push("/");
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("login.registrationFailed"),
      detail: err.message,
      life: 3000,
    });
  } finally {
    loading.value = false;
  }
}

function switchMode(nextMode) {
  mode.value = nextMode;
  password.value = "";
  loading.value = false;
}

async function consumeMagicLink(magicToken) {
  magicLinkLoading.value = true;
  try {
    await auth.loginWithMagicLink(magicToken);
    router.replace("/");
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("login.loginFailed"),
      detail: err.message,
      life: 3000,
    });
    router.replace("/login");
  } finally {
    magicLinkLoading.value = false;
  }
}

async function handleGoogleCredential(response) {
  loading.value = true;
  try {
    await auth.loginWithGoogle(response.credential);
    router.push("/");
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("login.googleFailed"),
      detail: err.message,
      life: 3000,
    });
  } finally {
    loading.value = false;
  }
}

function renderGoogleButtons() {
  if (!GOOGLE_CLIENT_ID || !window.google?.accounts?.id) return;
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential,
  });
  if (googleButtonLogin.value) {
    window.google.accounts.id.renderButton(googleButtonLogin.value, {
      theme: "filled_blue",
      size: "large",
      width: "100%",
    });
  }
  if (googleButtonRegister.value) {
    window.google.accounts.id.renderButton(googleButtonRegister.value, {
      theme: "filled_blue",
      size: "large",
      width: "100%",
    });
  }
}

function loadGoogleScript() {
  if (!GOOGLE_CLIENT_ID) return;
  if (window.google?.accounts?.id) {
    renderGoogleButtons();
    return;
  }
  if (document.querySelector("script[data-google-identity]")) return;
  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  script.dataset.googleIdentity = "true";
  script.onload = renderGoogleButtons;
  document.head.appendChild(script);
}

watch(mode, () => nextTick(renderGoogleButtons));
watch(showAuthModal, (open) => {
  if (open) nextTick(renderGoogleButtons);
});
watch(locale, updateLoginHead);
</script>

<template>
  <div v-if="magicLinkLoading" class="magic-loading">
    <i class="pi pi-spin pi-spinner" />
    <span>{{ t("login.signingIn") }}</span>
  </div>
  <div v-else class="landing">
    <!-- Top nav -->
    <nav class="top-nav">
      <div class="nav-brand">
        <!-- <span class="brand-mark">📈</span> -->
        <span class="brand-name">StockFolio</span>
      </div>
      <div class="nav-controls">
        <ThemeToggle />
      </div>
    </nav>

    <Teleport to="body">
      <Transition name="auth-modal">
        <div v-if="showAuthModal" class="auth-modal-overlay" @click.self="showAuthModal = false">
          <div class="auth-modal-panel">
            <button class="auth-modal-close" type="button" aria-label="Close" @click="showAuthModal = false">
              <i class="pi pi-times"/>
            </button>
            <div v-if="mode === 'login'" class="auth-card">
              <h2 class="auth-heading">{{ t('login.welcomeBack') }}</h2>
              <p class="auth-subheading text-muted">{{ t('login.signInToPortfolio') }}</p>
              <form class="auth-form" @submit.prevent="submit">
                <div class="field">
                  <label for="modal-login-email">{{ t('login.emailOrUsername') }}</label>
                  <InputText id="modal-login-email" v-model="identifier" autocomplete="username" fluid :placeholder="t('login.identifierPlaceholder')" required/>
                </div>
                <div class="field">
                  <label for="modal-login-password">{{ t('login.password') }}</label>
                  <Password v-model="password" :feedback="false" :placeholder="t('login.password')" autocomplete="current-password" fluid inputId="modal-login-password" required toggleMask/>
                </div>
                <Button :disabled="loading" :loading="loading" class="login-button" fluid iconPos="right" :label="t('login.signIn')" type="submit"/>
              </form>
              <template v-if="GOOGLE_CLIENT_ID">
                <div class="auth-divider"><span>{{ t('common.or') }}</span></div>
                <div ref="googleButtonLogin" class="google-button"/>
              </template>
              <p class="auth-footer">
                {{ t('login.noAccount') }}
                <button class="auth-link" type="button" @click="switchMode('register')">{{ t('login.createFree') }}</button>
              </p>
            </div>
            <div v-else class="register-card">
              <h2 class="auth-heading">{{ t('login.createAccount') }}</h2>
              <p class="auth-subheading text-muted">{{ t('login.startTracking') }}</p>
              <template v-if="GOOGLE_CLIENT_ID">
                <p class="google-hint text-muted">{{ t('login.googleHint') }}</p>
                <div ref="googleButtonRegister" class="google-button"/>
                <div class="auth-divider"><span>{{ t('login.signUpWithIdentifier') }}</span></div>
              </template>
              <form class="auth-form" @submit.prevent="register">
                <div class="field">
                  <label for="modal-register-name">{{ t('login.name') }}</label>
                  <InputText id="modal-register-name" v-model="name" :placeholder="t('login.namePlaceholder')" autocomplete="name" fluid required/>
                </div>
                <div class="field">
                  <label for="modal-register-email">{{ t('login.emailOrUsername') }}</label>
                  <InputText id="modal-register-email" v-model="identifier" autocomplete="username" fluid :placeholder="t('login.identifierPlaceholder')" required/>
                </div>
                <div class="field">
                  <label for="modal-register-password">{{ t('login.password') }}</label>
                  <Password inputId="modal-register-password" v-model="password" :feedback="false" autocomplete="new-password" fluid :placeholder="t('login.passwordPlaceholder')" required toggleMask/>
                  <small class="password-hint" :class="{ invalid: password && !passwordValid }">{{ t('login.passwordHint') }}</small>
                </div>
                <Button :disabled="!registerEnabled || loading" :loading="loading" class="register-button" fluid icon="pi pi-arrow-right" iconPos="right" :label="t('login.createStockFolioAccount')" type="submit"/>
                <p class="disclaimer-note text-muted">
                  {{ t('login.disclaimerNote') }}
                  <RouterLink to="/disclaimer">{{ t('login.readDisclaimer') }}</RouterLink>
                </p>
              </form>
              <p class="auth-footer">
                {{ t('login.alreadyHaveAccount') }}
                <button class="auth-link" type="button" @click="switchMode('login')">{{ t('login.signIn') }}</button>
              </p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <main class="landing-main">
      <!-- Hero / marketing -->
      <section class="hero" aria-labelledby="login-hero-title">
        <div class="hero-inner">
          <h1 id="login-hero-title" class="hero-title">
            {{ t("login.heroTitleLine1") }}<br />
            <span class="gradient-title">{{ t("login.heroTitleLine2") }}</span>
          </h1>
          <p class="hero-sub">
            {{ t("login.heroSubtitle") }}
          </p>

          <div :aria-label="t('login.appPreview')" class="app-preview">
            <div aria-hidden="true" class="mockup">
              <div class="phone">
                <div class="phone-btn phone-btn-power" />
                <div class="phone-btn phone-btn-vol-up" />
                <div class="phone-btn phone-btn-vol-down" />
                <div class="phone-notch">
                  <span class="phone-camera" />
                </div>
                <div class="phone-screen">
                  <div class="slides">
                    <!-- 0 · Portfolio -->
                    <div v-show="slide === 0" class="slide">
                      <div class="mk-header">
                        <span class="mk-title gradient-title">{{
                          t("login.slides.portfolio")
                        }}</span
                        ><span class="mk-total">$48,210</span>
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
                        <svg
                          class="mk-spark"
                          preserveAspectRatio="none"
                          viewBox="0 0 200 40"
                        >
                          <polyline
                            class="spark-up"
                            points="0,32 20,28 40,30 60,22 80,24 100,16 120,18 140,10 160,12 180,6 200,4"
                          />
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
                        <svg
                          class="mk-spark"
                          preserveAspectRatio="none"
                          viewBox="0 0 200 40"
                        >
                          <polyline
                            class="spark-down"
                            points="0,8 20,10 40,6 60,14 80,12 100,20 120,18 140,26 160,24 180,30 200,34"
                          />
                        </svg>
                      </div>
                    </div>

                    <!-- 1 · Global Markets -->
                    <div v-show="slide === 1" class="slide">
                      <div class="mk-header">
                        <span class="mk-title gradient-title">{{
                          t("login.slides.markets")
                        }}</span
                        ><span class="mk-tabs">US · Crypto</span>
                      </div>
                      <div class="mk-grid">
                        <div class="mk-tile">
                          <div class="mk-tname">S&amp;P 500</div>
                          <div class="mk-tprice">7,595</div>
                          <span class="mk-badge up">+0.6%</span>
                        </div>
                        <div class="mk-tile">
                          <div class="mk-tname">Nasdaq</div>
                          <div class="mk-tprice">26,895</div>
                          <span class="mk-badge up">+0.2%</span>
                        </div>
                        <div class="mk-tile">
                          <div class="mk-tname">Gold</div>
                          <div class="mk-tprice">4,506</div>
                          <span class="mk-badge up">+0.9%</span>
                        </div>
                        <div class="mk-tile">
                          <div class="mk-tname">BTC</div>
                          <div class="mk-tprice">63.9k</div>
                          <span class="mk-badge down">−2.2%</span>
                        </div>
                      </div>
                    </div>

                    <!-- 2 · Price Alerts -->
                    <div v-show="slide === 2" class="slide">
                      <div class="mk-header">
                        <span class="mk-title gradient-title">{{
                          t("login.slides.alerts")
                        }}</span>
                      </div>
                      <div class="mk-alert">
                        <i class="pi pi-bell" />
                        <div>
                          <div class="mk-aticker">AAPL ↑ $200</div>
                          <div class="mk-name">
                            {{ t("login.slides.notifyAbove") }}
                          </div>
                        </div>
                        <span class="mk-toggle on" />
                      </div>
                      <div class="mk-alert">
                        <i class="pi pi-bell" />
                        <div>
                          <div class="mk-aticker">TSLA ↓ $180</div>
                          <div class="mk-name">
                            {{ t("login.slides.notifyBelow") }}
                          </div>
                        </div>
                        <span class="mk-toggle on" />
                      </div>
                      <div class="mk-pushrow">
                        <i class="pi pi-mobile" />
                        {{ t("login.slides.pushOn") }}
                      </div>
                    </div>

                    <!-- 3 · Allocation -->
                    <div v-show="slide === 3" class="slide">
                      <div class="mk-header">
                        <span class="mk-title gradient-title">{{
                          t("login.slides.breakdown")
                        }}</span>
                      </div>
                      <div class="mk-alloc">
                        <svg class="mk-donut" viewBox="0 0 42 42">
                          <circle class="d-bg" cx="21" cy="21" r="15.9" />
                          <circle
                            class="d-a"
                            cx="21"
                            cy="21"
                            r="15.9"
                            stroke-dasharray="42 58"
                            stroke-dashoffset="0"
                          />
                          <circle
                            class="d-b"
                            cx="21"
                            cy="21"
                            r="15.9"
                            stroke-dasharray="31 69"
                            stroke-dashoffset="-42"
                          />
                          <circle
                            class="d-c"
                            cx="21"
                            cy="21"
                            r="15.9"
                            stroke-dasharray="27 73"
                            stroke-dashoffset="-73"
                          />
                        </svg>
                        <div class="mk-legend">
                          <div><span class="dot a" />AAPL <b>42%</b></div>
                          <div><span class="dot b" />NVDA <b>31%</b></div>
                          <div><span class="dot c" />BTC <b>27%</b></div>
                        </div>
                      </div>
                    </div>

                    <!-- 4 · Groups -->
                    <div v-show="slide === 4" class="slide">
                      <div class="mk-header">
                        <span class="mk-title gradient-title">{{
                          t("login.slides.groups")
                        }}</span>
                      </div>
                      <div class="mk-grouprow">
                        <span class="mk-gtag">{{ t("login.slides.tech") }}</span
                        ><span class="mk-gcount">3</span>
                      </div>
                      <div class="mk-card mk-flat">
                        <div class="mk-ticker">AAPL</div>
                        <span class="mk-badge up">+1.1%</span>
                      </div>
                      <div class="mk-card mk-flat">
                        <div class="mk-ticker">NVDA</div>
                        <span class="mk-badge up">+4.2%</span>
                      </div>
                      <div class="mk-grouprow">
                        <span class="mk-gtag alt">Crypto</span
                        ><span class="mk-gcount">1</span>
                      </div>
                      <div class="mk-card mk-flat">
                        <div class="mk-ticker">ETH-USD</div>
                        <span class="mk-badge down">−1.2%</span>
                      </div>
                    </div>

                    <!-- 5 · News -->
                    <div v-show="slide === 5" class="slide">
                      <div class="mk-header">
                        <span class="mk-title gradient-title">{{
                          t("login.slides.forYou")
                        }}</span>
                        <span class="mk-tabs">AAPL · NVDA</span>
                      </div>
                      <div class="mk-topicrow">
                        <span class="mk-topic active">{{
                          t("login.slides.forYou")
                        }}</span>
                        <span class="mk-topic">{{
                          t("login.slides.tech")
                        }}</span>
                        <span class="mk-topic">{{
                          t("login.slides.markets")
                        }}</span>
                      </div>
                      <div class="mk-news-card">
                        <div class="mk-news-source">CNBC</div>
                        <div class="mk-news-title">
                          {{ t("login.slides.chipStocks") }}
                        </div>
                        <div class="mk-symbols">
                          <span>NVDA</span><span>AMD</span>
                        </div>
                      </div>
                      <div class="mk-news-card">
                        <div class="mk-news-source">Reuters</div>
                        <div class="mk-news-title">
                          {{ t("login.slides.appleSuppliers") }}
                        </div>
                        <div class="mk-symbols"><span>AAPL</span></div>
                      </div>
                    </div>

                    <!-- 6 · Rebalancer -->
                    <div v-show="slide === 6" class="slide">
                      <div class="mk-header">
                        <span class="mk-title gradient-title">{{
                          t("login.slides.rebalance")
                        }}</span>
                      </div>
                      <div class="mk-rebal-row">
                        <span class="mk-ticker">AAPL</span>
                        <div class="mk-rebal-bar-wrap">
                          <div
                            class="mk-rebal-bar"
                            style="width: 62%; background: #3b82f6"
                          />
                          <div class="mk-rebal-target" style="left: 50%" />
                        </div>
                        <span class="mk-badge up">+BUY</span>
                      </div>
                      <div class="mk-rebal-row">
                        <span class="mk-ticker">NVDA</span>
                        <div class="mk-rebal-bar-wrap">
                          <div
                            class="mk-rebal-bar"
                            style="width: 28%; background: #3b82f6"
                          />
                          <div class="mk-rebal-target" style="left: 35%" />
                        </div>
                        <span class="mk-badge up">+BUY</span>
                      </div>
                      <div class="mk-rebal-row">
                        <span class="mk-ticker">TSLA</span>
                        <div class="mk-rebal-bar-wrap">
                          <div
                            class="mk-rebal-bar"
                            style="width: 48%; background: #3b82f6"
                          />
                          <div class="mk-rebal-target" style="left: 30%" />
                        </div>
                        <span class="mk-badge down">SELL</span>
                      </div>
                      <div class="mk-rebal-note">
                        {{ t("login.slides.targetPlan") }}
                      </div>
                    </div>

                    <!-- 7 · Stock Chart -->
                    <div v-show="slide === 7" class="slide">
                      <div class="mk-header">
                        <span class="mk-title gradient-title">NVDA</span
                        ><span class="mk-tabs">1D · line</span>
                      </div>
                      <svg
                        class="mk-chart"
                        viewBox="0 0 200 70"
                        preserveAspectRatio="none"
                      >
                        <defs>
                          <linearGradient
                            id="chartGrad"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stop-color="var(--green)"
                              stop-opacity="0.22"
                            />
                            <stop
                              offset="100%"
                              stop-color="var(--green)"
                              stop-opacity="0"
                            />
                          </linearGradient>
                        </defs>
                        <path
                          d="M0,55 C10,50 20,45 30,48 C40,52 50,42 60,35 C70,28 80,32 90,25 C100,18 110,22 120,15 C130,8 140,12 150,8 C160,5 170,9 180,6 C190,4 195,5 200,4"
                          fill="url(#chartGrad)"
                        />
                        <path
                          d="M0,55 C10,50 20,45 30,48 C40,52 50,42 60,35 C70,28 80,32 90,25 C100,18 110,22 120,15 C130,8 140,12 150,8 C160,5 170,9 180,6 C190,4 195,5 200,4"
                          fill="none"
                          stroke="var(--green)"
                          stroke-width="1.5"
                        />
                        <!-- pre-market gold segment -->
                        <path
                          d="M0,55 C10,50 20,45 30,48"
                          fill="none"
                          stroke="#facc15"
                          stroke-width="1.5"
                        />
                        <!-- after-hours purple -->
                        <path
                          d="M180,6 C190,4 195,5 200,4"
                          fill="none"
                          stroke="#a78bfa"
                          stroke-width="1.5"
                        />
                        <circle cx="200" cy="4" r="2.5" fill="var(--green)" />
                      </svg>
                      <div class="mk-chart-labels">
                        <span class="mk-clabel" style="color: #facc15"
                          >Pre</span
                        >
                        <span class="mk-clabel" style="color: var(--green)"
                          >Market</span
                        >
                        <span class="mk-clabel" style="color: #a78bfa"
                          >After</span
                        >
                      </div>
                      <div class="mk-card mk-flat" style="margin-top: 4px">
                        <span class="mk-name">Δ Delta measure</span>
                        <span class="mk-badge up">+$4.20</span>
                      </div>
                    </div>

                    <!-- 8 · Watchlist movers -->
                    <div v-show="slide === 8" class="slide">
                      <div class="mk-header">
                        <span class="mk-title gradient-title">{{
                          t("common.watchlist")
                        }}</span
                        ><span class="mk-tabs">Gainers</span>
                      </div>
                      <div class="mk-card mk-gain">
                        <div class="mk-row">
                          <div>
                            <div class="mk-ticker">META</div>
                            <div class="mk-name">Meta Platforms</div>
                          </div>
                          <div class="mk-right">
                            <div class="mk-val">$512.30</div>
                            <span class="mk-badge up">+4.2%</span>
                          </div>
                        </div>
                      </div>
                      <div class="mk-card mk-gain">
                        <div class="mk-row">
                          <div>
                            <div class="mk-ticker">AMZN</div>
                            <div class="mk-name">Amazon</div>
                          </div>
                          <div class="mk-right">
                            <div class="mk-val">$188.90</div>
                            <span class="mk-badge up">+3.8%</span>
                          </div>
                        </div>
                      </div>
                      <div class="mk-card mk-loss">
                        <div class="mk-row">
                          <div>
                            <div class="mk-ticker">INTC</div>
                            <div class="mk-name">Intel Corp.</div>
                          </div>
                          <div class="mk-right">
                            <div class="mk-val">$30.14</div>
                            <span class="mk-badge down">−2.1%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 9 · AI Daily Summary -->
                    <div v-show="slide === 9" class="slide">
                      <div class="mk-header">
                        <span class="mk-title gradient-title"
                          ><i
                            class="pi pi-sparkles"
                            style="font-size: 0.9em; margin-right: 6px"
                          />{{ t("login.slides.dailySummary") }}</span
                        >
                      </div>
                      <div class="mk-summary-card">
                        <p class="mk-summary-text">
                          {{ t("login.slides.dailySummarySample") }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- progress dots -->
                  <div class="mk-dots">
                    <span
                      v-for="n in SLIDE_COUNT"
                      :key="n"
                      class="mk-dot"
                      :class="{ active: slide === n - 1 }"
                    />
                  </div>
                </div>
                <div class="phone-home-indicator" />
              </div>
            </div>
          </div>

          <button class="get-started-btn" type="button" @click="showAuthModal = true">
            {{ t('login.signIn') }}
          </button>

          <div class="landing-summary">
            <p class="summary-text">{{ t("login.summary") }}</p>
            <p class="premium-note text-muted">
              <span>{{ t("login.premiumNote") }}</span>
              <PremiumBadge
                :label="t('common.premium')"
                :title="t('common.premiumFeature')"
              />
            </p>
          </div>
        </div>
      </section>

    </main>

    <!-- Footer -->
    <footer class="landing-footer">
      <RouterLink class="footer-link" to="/about">{{
        t("common.about")
      }}</RouterLink>
      <span class="footer-sep">·</span>
      <RouterLink class="footer-link" to="/disclaimer">{{
        t("common.disclaimer")
      }}</RouterLink>
      <span class="footer-sep">·</span>
      © {{ new Date().getFullYear() }} StockFolio ·
      <a alt="www.handcoded.tech" href="//handcoded.tech"> handcoded.tech </a>.
      {{ t("common.allRightsReserved") }}
    </footer>
  </div>
</template>

<style scoped>
.magic-loading {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.magic-loading i {
  font-size: 1.6rem;
  color: var(--accent);
}

.landing {
  min-height: 100dvh;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

/* ── Top nav ── */
.top-nav {
  display: flex;
  align-items: center;
  padding: 0.9rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
}

.brand-mark {
  font-size: 1.4rem;
}

.brand-name {
  font-size: 1.2rem;
}

.get-started-btn {
  display: block;
  margin: 1.5rem auto 2rem;
  padding: 0.65rem 2rem;
  border-radius: 8px;
  border: none;
  background: var(--neon-green);
  color: #000;
  font-size: 1rem;
  cursor: pointer;
  transition: opacity 0.15s;
}

.get-started-btn:hover {
  opacity: 0.85;
}

:root[data-theme="light"] .get-started-btn {
  background: var(--neon-green);
  color: #fff;
}

.auth-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.auth-modal-panel {
  position: relative;
  width: 100%;
  max-width: 420px;
  max-height: 90dvh;
  overflow-y: auto;
  border-radius: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  padding: 2rem 1.75rem 1.5rem;
}

.auth-modal-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1rem;
  cursor: pointer;
  line-height: 1;
  padding: 0.25rem;
}

.auth-modal-close:hover {
  color: var(--text-primary);
}

.auth-modal-enter-active,
.auth-modal-leave-active {
  transition: opacity 0.2s ease;
}

.auth-modal-enter-active .auth-modal-panel,
.auth-modal-leave-active .auth-modal-panel {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.auth-modal-enter-from,
.auth-modal-leave-to {
  opacity: 0;
}

.auth-modal-enter-from .auth-modal-panel,
.auth-modal-leave-to .auth-modal-panel {
  transform: translateY(16px);
  opacity: 0;
}

.landing-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  align-items: center;
}

/* ── Hero ── */
.hero {
  width: 100%;
  max-width: 800px;
  padding: 2.5rem 1.25rem 1.5rem;
}

.hero-inner {
  width: 100%;
}

.hero-title {
  font-size: 2.4rem;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin-bottom: 0.75rem;
}

.hero-sub {
  font-size: 0.95rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 1.75rem;
}

.app-preview {
  min-height: 260px;
}

/* ── Phone mockup ── */
.mockup {
  display: flex;
  justify-content: center;
  margin: 0 0 2rem;
  min-height: 300px;
}

.phone {
  /* This mockup is a fixed dark-mode phone illustration — always render its
     internal .mk-* content with dark-theme colors, regardless of the site's
     active theme, so text/cards never flip to light-theme values and vanish
     against the phone's always-dark screen. */
  --bg-primary: #000000;
  --bg-secondary: #111111;
  --bg-card: #070707;
  --border: #222222;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --green: #00ff88;
  --red: #ff3366;
  --accent: #3b82f6;
  --neon-green: #00ff88;
  --neon-red: #ff3366;
  --neon-blue: #00cfff;
  --purple: #a855f7;
  --gold: #fbbf24;
  /* body sets `color: var(--text-primary)` and its already-resolved computed
     value is what plain inheritance passes down — descendants don't
     re-evaluate the variable on their own, so without this the shadowed
     --text-primary above never actually reaches any .mk-* text. */
  color: var(--text-primary);

  position: relative;
  width: 230px;
  background: linear-gradient(155deg, #1c1c1e 0%, #0a0a0a 55%);
  border: 3px solid #050505;
  border-radius: 38px;
  padding: 14px 10px 20px;
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset,
    0 2px 0 rgba(255, 255, 255, 0.06) inset,
    0 0 60px color-mix(in srgb, var(--neon-blue) 8%, transparent);
  transform: rotate(-3deg);
  transition: transform 0.3s;
}

.phone:hover {
  transform: rotate(0deg);
}

/* Light theme: render the same mockup as a white phone. The .mk-* content all
   reads from these variables, so re-shadowing them here recolors the whole
   slideshow without touching any of its markup or animation. */
:root.light .phone {
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-card: #ffffff;
  --border: #e2e8f0;
  --text-primary: #0f172a;
  --text-secondary: #64748b;
  --green: #059669;
  --red: #e11d48;
  --accent: #2563eb;
  --neon-green: #059669;
  --neon-red: #e11d48;
  --neon-blue: #0284c7;
  --purple: #7c3aed;
  --gold: #d97706;
  color: var(--text-primary);

  background: linear-gradient(155deg, #ffffff 0%, #e9edf3 55%);
  border-color: #d6dbe3;
  box-shadow:
    0 20px 50px rgba(15, 23, 42, 0.18),
    0 0 0 1px rgba(15, 23, 42, 0.06) inset,
    0 2px 0 rgba(255, 255, 255, 0.9) inset;
}

:root.light .phone .phone-btn {
  background: linear-gradient(90deg, #d6dbe3, #b8bfc9);
}

:root.light .phone .phone-notch {
  background: #1f2733;
}

:root.light .phone .phone-camera {
  background: #2b3440;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--neon-blue) 30%, transparent),
    inset 0 0 2px color-mix(in srgb, var(--neon-blue) 45%, transparent);
}

:root.light .phone .phone-home-indicator {
  background: #c3c9d2;
}

/* Neon glow reads as haze on white — drop it for the sparklines. */
:root.light .phone .spark-up,
:root.light .phone .spark-down {
  filter: none;
}

.phone-btn {
  position: absolute;
  background: linear-gradient(90deg, #1a1a1a, #050505);
  border-radius: 2px;
}

.phone-btn-power {
  right: -3px;
  top: 90px;
  width: 3px;
  height: 46px;
}

.phone-btn-vol-up {
  left: -3px;
  top: 70px;
  width: 3px;
  height: 28px;
}

.phone-btn-vol-down {
  left: -3px;
  top: 105px;
  width: 3px;
  height: 28px;
}

.phone-notch {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  width: 84px;
  height: 20px;
  background: #050505;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 10px;
  z-index: 2;
}

.phone-camera {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #1a1a2e;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--neon-blue) 25%, transparent),
    inset 0 0 2px color-mix(in srgb, var(--neon-blue) 40%, transparent);
}

.phone-screen {
  margin-top: 26px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  position: relative;
}

.phone-home-indicator {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 90px;
  height: 4px;
  border-radius: 999px;
  background: #3a3a3c;
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

/* The mockup title reuses .gradient-title, but that class flattens to plain
   text on the site's light theme (see style.css) — restore the rainbow
   gradient look here since the phone mockup always renders dark-mode style. */
.phone .mk-title.gradient-title {
  background: linear-gradient(135deg, #00cfff 0%, #a855f7 50%, #ff3366 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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
  border-color: color-mix(in srgb, var(--green) 40%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--green) 12%, transparent);
}

.mk-loss {
  border-color: color-mix(in srgb, var(--red) 40%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--red) 12%, transparent);
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
  background: var(--green);
  color: #fff;
}

.mk-badge.down {
  background: var(--red);
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
  stroke: var(--green);
  filter: drop-shadow(
    0 0 2px color-mix(in srgb, var(--green) 60%, transparent)
  );
}

.spark-down {
  stroke: var(--red);
  filter: drop-shadow(0 0 2px color-mix(in srgb, var(--red) 60%, transparent));
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

/* ── Slideshow ── */
.slides {
  position: relative;
  min-height: 132px;
}

.slide {
  display: flex;
  flex-direction: column;
  gap: 6px;
  animation: slideIn 0.45s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .slide {
    animation: none;
  }
}

.mk-tabs {
  font-size: 0.55rem;
  color: var(--text-secondary);
  font-weight: 600;
}

/* Markets grid */
.mk-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}

.mk-tile {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 7px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.mk-tname {
  font-size: 0.55rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.mk-tprice {
  font-size: 0.68rem;
  font-weight: 700;
}

/* Alerts */
.mk-alert {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 7px 8px;
}

.mk-alert > i {
  font-size: 0.7rem;
  color: var(--neon-blue);
}

.mk-alert > div {
  flex: 1;
  min-width: 0;
}

.mk-aticker {
  font-size: 0.66rem;
  font-weight: 800;
}

.mk-toggle {
  width: 18px;
  height: 11px;
  border-radius: 6px;
  background: #333;
  position: relative;
  flex-shrink: 0;
}

.mk-toggle.on {
  background: var(--accent);
}

.mk-toggle.on::after {
  content: "";
  position: absolute;
  right: 1px;
  top: 1px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #fff;
}

.mk-pushrow {
  font-size: 0.55rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
}

.mk-pushrow i {
  color: var(--neon-green);
}

/* Allocation donut */
.mk-alloc {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 2px;
}

.mk-donut {
  width: 76px;
  height: 76px;
  transform: rotate(-90deg);
  flex-shrink: 0;
}

.mk-donut circle {
  fill: none;
  stroke-width: 4;
}

.d-bg {
  stroke: var(--border);
}

.d-a {
  stroke: #3b82f6;
}

.d-b {
  stroke: var(--green);
}

.d-c {
  stroke: #f59e0b;
}

.mk-legend {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.62rem;
}

.mk-legend > div {
  display: flex;
  align-items: center;
  gap: 5px;
}

.mk-legend b {
  margin-left: auto;
}

.mk-legend .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.dot.a {
  background: #3b82f6;
}

.dot.b {
  background: var(--green);
}

.dot.c {
  background: #f59e0b;
}

/* Groups */
.mk-grouprow {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 2px;
}

.mk-gtag {
  font-size: 0.55rem;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 9px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.4);
  color: #93c5fd;
}

.mk-gtag.alt {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.4);
  color: #fcd34d;
}

.mk-gcount {
  font-size: 0.5rem;
  color: var(--text-secondary);
}

.mk-flat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 9px;
  box-shadow: none;
  border-color: var(--border);
}

/* News */
.mk-topicrow {
  display: flex;
  gap: 4px;
}

.mk-topic {
  font-size: 0.52rem;
  font-weight: 700;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 6px;
}

.mk-topic.active {
  color: var(--neon-blue);
  border-color: color-mix(in srgb, var(--neon-blue) 55%, transparent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--neon-blue) 16%, transparent);
}

.mk-news-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 7px 6px 9px;
  overflow: hidden;
}

.mk-news-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: linear-gradient(
    180deg,
    var(--neon-blue),
    var(--purple),
    var(--neon-red)
  );
}

.mk-news-source {
  color: var(--neon-blue);
  font-size: 0.48rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.mk-news-title {
  font-size: 0.62rem;
  font-weight: 800;
  line-height: 1.22;
  margin-top: 2px;
}

.mk-symbols {
  display: flex;
  gap: 3px;
  margin-top: 4px;
}

.mk-symbols span {
  color: var(--neon-green);
  border: 1px solid color-mix(in srgb, var(--neon-green) 35%, transparent);
  border-radius: 5px;
  padding: 1px 4px;
  font-size: 0.48rem;
  font-weight: 800;
}

/* progress dots */
.mk-dots {
  display: flex;
  justify-content: center;
  gap: 5px;
  margin-top: 8px;
}

.mk-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--border);
  transition:
    background 0.3s,
    width 0.3s;
}

.mk-dot.active {
  background: var(--accent);
  width: 14px;
  border-radius: 3px;
}

.landing-summary {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-bottom: 2.5rem;
}

.summary-text {
  font-size: 0.92rem;
  line-height: 1.65;
}

.premium-note {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  font-size: 0.8rem;
  line-height: 1.4;
}

/* ── Auth ── */
.auth {
  width: 100%;
  padding: 0 1.25rem 2.5rem;
  display: flex;
  justify-content: center;
}

.auth-card {
  width: 100%;
  max-width: 420px;
  border-radius: 16px;
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.register-card {
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

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

:deep(.login-button) {
  margin-top: 0.25rem;
  border: 0;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #fff;
  box-shadow: 0 18px 36px rgba(34, 197, 94, 0.22);
  font-weight: 800;
  letter-spacing: 0.01em;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    filter 0.18s ease;
}

:deep(.login-button .p-button-label),
:deep(.login-button .p-button-icon) {
  color: #fff;
}

:deep(.login-button:not(.p-disabled):hover) {
  transform: translateY(-1px);
  box-shadow: 0 22px 42px rgba(34, 197, 94, 0.28);
  filter: saturate(1.08);
}

:deep(.login-button.p-disabled) {
  opacity: 0.65;
  box-shadow: none;
}

:deep(.register-button) {
  margin-top: 0.25rem;
  border: 0;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #fff;
  box-shadow: 0 18px 36px rgba(34, 197, 94, 0.22);
  font-weight: 800;
  letter-spacing: 0.01em;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    filter 0.18s ease;
}

:deep(.register-button .p-button-label),
:deep(.register-button .p-button-icon) {
  color: #fff;
}

:deep(.register-button:not(.p-disabled):hover) {
  transform: translateY(-1px);
  box-shadow: 0 22px 42px rgba(34, 197, 94, 0.28);
  filter: saturate(1.08);
}

:deep(.register-button.p-disabled) {
  opacity: 0.65;
  box-shadow: none;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field label {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.password-hint {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.password-hint.invalid {
  color: var(--neon-red);
}

.auth-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 1.25rem 0;
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.auth-divider::before,
.auth-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border);
}

.google-button {
  display: flex;
  justify-content: center;
}

.google-hint {
  text-align: center;
  font-size: 0.82rem;
  margin-bottom: 0.75rem;
}

.auth-footer {
  margin-top: 1.5rem;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.auth-footer a {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 0.18em;
  text-decoration-thickness: 0.08em;
}

.auth-link {
  appearance: none;
  background: transparent;
  border: 0;
  padding: 0;
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 0.18em;
  text-decoration-thickness: 0.08em;
  cursor: pointer;
  font: inherit;
}

.disclaimer-note {
  font-size: 0.76rem;
  line-height: 1.45;
  margin-top: -0.15rem;
}

.disclaimer-note a {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 0.18em;
}

/* ── Desktop: wider column, larger type ── */
@media (min-width: 640px) {
  .top-nav {
    padding: 1rem 2.5rem;
  }

  .hero {
    padding: 3rem 1.25rem 1.5rem;
  }

  .hero-title {
    font-size: 2.6rem;
  }

  .hero-sub {
    font-size: 1.05rem;
  }
}

/* ── Desktop/Import preview sections ── */
/* ── Rebalancer slide ── */
.mk-rebal-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 2px;
}

.mk-rebal-bar-wrap {
  flex: 1;
  height: 6px;
  background: #1a1a1a;
  border-radius: 3px;
  position: relative;
}

.mk-rebal-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}

.mk-rebal-target {
  position: absolute;
  top: -3px;
  width: 2px;
  height: 12px;
  background: #f59e0b;
  border-radius: 1px;
}

.mk-rebal-note {
  font-size: 0.52rem;
  color: var(--text-secondary);
  text-align: center;
  margin-top: 4px;
}

/* ── AI Daily Summary slide ── */
.mk-summary-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 9px 10px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--neon-blue) 8%, transparent) 0%,
    color-mix(in srgb, var(--purple) 8%, transparent) 100%
  );
}

.mk-summary-text {
  margin: 0;
  font-size: 0.62rem;
  line-height: 1.55;
  color: var(--text-primary);
}

/* ── Chart slide ── */
.mk-chart {
  width: 100%;
  height: 60px;
  display: block;
}

.mk-chart-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.5rem;
  font-weight: 700;
  padding: 0 2px;
  margin-top: 2px;
}

.mk-clabel {
  font-size: 0.5rem;
  font-weight: 700;
}

/* ── Footer ── */
.landing-footer {
  text-align: center;
  font-size: 0.72rem;
  color: var(--text-secondary);
  padding: 1.25rem 1rem;
  padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));
}
.footer-link {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 0.18em;
  text-decoration-thickness: 0.08em;
}
.footer-sep {
  margin: 0 0.4rem;
}
</style>
