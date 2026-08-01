<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "@/stores/auth";
import InputText from "primevue/inputtext";
import Password from "primevue/password";
import Button from "primevue/button";
import LanguageSelect from "@/components/ui/LanguageSelect.vue";
import { useI18n } from "@/composables/useI18n";

const router = useRouter();
const toast = useToast();
const auth = useAuthStore();
const { t } = useI18n();

const name = ref("");
const identifier = ref("");
const password = ref("");
const loading = ref(false);
const PASSWORD_RULE = /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const passwordValid = computed(() => PASSWORD_RULE.test(password.value));
const submitEnabled = computed(
  () =>
    name.value.trim() &&
    identifier.value.trim() &&
    password.value &&
    passwordValid.value,
);

const features = computed(() => [
  {
    icon: "pi pi-chart-line",
    title: t("register.trackEverythingTitle"),
    text: t("register.trackEverythingText"),
  },
  {
    icon: "pi pi-bell",
    title: t("login.features.priceAlertsTitle"),
    text: t("login.features.priceAlertsText"),
  },
  {
    icon: "pi pi-folder-open",
    title: t("register.groupsLotsTitle"),
    text: t("register.groupsLotsText"),
  },
]);

async function submit() {
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
</script>

<template>
  <div class="landing">
    <main class="landing-main">
      <section aria-labelledby="register-hero-title" class="hero">
        <div class="hero-inner">
          <div class="brand">
            <!-- <span class="brand-mark">📈</span> -->
            <span class="brand-name gradient-title">StockFolio</span>
            <LanguageSelect class="hero-language" />
          </div>

          <h1 id="register-hero-title" class="hero-title">
            {{ t("register.heroTitleLine1") }}<br />
            <span class="gradient-title">{{
              t("register.heroTitleLine2")
            }}</span>
          </h1>
          <p class="hero-sub">
            {{ t("register.heroSubtitle") }}
          </p>

          <div class="hero-panel">
            <div class="hero-panel-grid">
              <div class="hero-stat">
                <span class="hero-kicker">{{ t("register.coverage") }}</span>
                <strong>{{ t("register.coverageValue") }}</strong>
              </div>
              <div class="hero-stat">
                <span class="hero-kicker">{{ t("alerts.title") }}</span>
                <strong>{{ t("register.alertsValue") }}</strong>
              </div>
              <div class="hero-stat">
                <span class="hero-kicker">{{ t("register.detail") }}</span>
                <strong>{{ t("register.detailValue") }}</strong>
              </div>
            </div>
          </div>

          <div :aria-label="t('register.featuresLabel')" class="features">
            <div v-for="f in features" :key="f.title" class="feature">
              <i :class="f.icon" aria-hidden="true" class="feature-icon" />
              <div>
                <div class="feature-title">{{ f.title }}</div>
                <div class="feature-text text-muted">{{ f.text }}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="register-form-title" class="auth">
        <div class="auth-card">
          <h2 id="register-form-title" class="auth-heading">
            {{ t("login.createAccount") }}
          </h2>
          <p class="auth-subheading text-muted">
            {{ t("login.startTracking") }}
          </p>

          <form class="auth-form" @submit.prevent="submit">
            <div class="field">
              <label for="register-name">{{ t("login.name") }}</label>
              <InputText
                id="register-name"
                v-model="name"
                :placeholder="t('login.namePlaceholder')"
                autocomplete="name"
                fluid
                required
              />
            </div>
            <div class="field">
              <label for="register-email">{{
                t("login.emailOrUsername")
              }}</label>
              <InputText
                id="register-email"
                v-model="identifier"
                autocomplete="username"
                fluid
                :placeholder="t('login.identifierPlaceholder')"
                required
              />
            </div>
            <div class="field">
              <label for="register-password">{{ t("login.password") }}</label>
              <Password
                v-model="password"
                :feedback="false"
                autocomplete="new-password"
                fluid
                inputId="register-password"
                :placeholder="t('login.passwordPlaceholder')"
                required
                toggleMask
              />
              <small
                :class="{ invalid: password && !passwordValid }"
                class="password-hint"
              >
                {{ t("login.passwordHint") }}
              </small>
            </div>
            <Button
              :disabled="!submitEnabled || loading"
              :loading="loading"
              class="register-button"
              fluid
              icon="pi pi-arrow-right"
              iconPos="right"
              :label="t('login.createStockFolioAccount')"
              type="submit"
            />
            <p class="disclaimer-note text-muted">
              {{ t("login.disclaimerNote") }}
              <RouterLink to="/disclaimer">{{
                t("login.readDisclaimer")
              }}</RouterLink>
            </p>
          </form>

          <p class="auth-footer">
            {{ t("login.alreadyHaveAccount") }}
            <RouterLink to="/login">{{ t("login.signIn") }}</RouterLink>
          </p>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.landing {
  min-height: 100dvh;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
}

.landing-main {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.hero {
  position: relative;
  padding: 2.5rem 1.25rem 1.5rem;
  overflow: hidden;
}

.hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      60% 50% at 20% 0%,
      rgba(0, 207, 255, 0.12),
      transparent 70%
    ),
    radial-gradient(
      50% 50% at 90% 20%,
      rgba(168, 85, 247, 0.12),
      transparent 70%
    );
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

.hero-language {
  margin-left: auto;
}

.brand-mark {
  font-size: 1.6rem;
}

.brand-name {
  font-size: 1.35rem;
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
  margin-bottom: 1.5rem;
  max-width: 460px;
}

.hero-panel {
  margin-bottom: 1.6rem;
}

.hero-panel-grid {
  display: grid;
  gap: 0.65rem;
}

.hero-stat {
  background: rgba(15, 23, 42, 0.66);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  padding: 0.9rem 1rem;
}

.hero-kicker {
  display: block;
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin-bottom: 0.2rem;
}

.hero-stat strong {
  font-size: 0.92rem;
  color: var(--text-primary);
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

.auth {
  padding: 1.5rem 1.25rem 2.5rem;
  display: flex;
  justify-content: center;
}

.auth-card {
  width: 100%;
  max-width: 420px;
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  align-items: center;
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

@media (min-width: 900px) {
  .landing-main {
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
