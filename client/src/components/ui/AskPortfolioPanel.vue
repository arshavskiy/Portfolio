<script setup>
import {computed, nextTick, onMounted, ref} from 'vue'
import {storeToRefs} from 'pinia'
import {useI18n} from '@/composables/useI18n'
import {useAiChatStore} from '@/stores/aiChat'
import {usePortfolioStore} from '@/stores/portfolio'
import {useWatchlistStore} from '@/stores/watchlist'

const {t} = useI18n()
const chat = useAiChatStore()
const portfolio = usePortfolioStore()
const watchlist = useWatchlistStore()
const {messages, sending, loaded} = storeToRefs(chat)

const askQuestion = ref('')
const chatBox = ref(null)
const expanded = ref(true)

const promptChips = computed(() => [
  t('insights.askPromptPerformance'),
  t('insights.askPromptRisk'),
  t('insights.askPromptIncome'),
])

// Tickers the user actually tracks — only these get linkified in chat text,
// so we never turn a stray capitalized word (e.g. "OK", "IT") into a link.
const knownTickers = computed(() => {
  const map = new Map()
  for (const p of portfolio.positions) {
    if (p.ticker) map.set(p.ticker.toUpperCase(), p.ticker.toUpperCase())
  }
  for (const w of watchlist.items) {
    if (w.ticker) map.set(w.ticker.toUpperCase(), w.ticker.toUpperCase())
  }
  return map
})

// Splits a message into {text} / {ticker} segments so the template can
// render known tickers as links to their position page and everything else
// as plain text. Matches whole-word uppercase-ish symbols only (1-6 chars,
// optional leading ^ for indices) to avoid false hits inside normal words.
function splitTickers(text) {
  if (!knownTickers.value.size) return [{text}]
  const pattern = /(^|[^A-Z0-9.^-])(\^?[A-Z0-9]{1,8}(?:[.-][A-Z0-9]{1,5})?)(?![A-Z0-9.-])/gi
  const segments = []
  let lastIndex = 0
  let match
  while ((match = pattern.exec(text))) {
    const prefix = match[1]
    const label = match[2]
    const tickerStart = match.index + prefix.length
    const candidate = label.toUpperCase()
    const ticker = knownTickers.value.get(candidate)
    if (!ticker) continue
    if (tickerStart > lastIndex) segments.push({text: text.slice(lastIndex, tickerStart)})
    segments.push({ticker, label})
    lastIndex = tickerStart + label.length
  }
  if (lastIndex < text.length) segments.push({text: text.slice(lastIndex)})
  return segments.length ? segments : [{text}]
}

async function scrollToBottom() {
  await nextTick()
  if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight
}

async function submitAskQuestion() {
  const question = askQuestion.value.trim()
  if (!question || sending.value) return
  expanded.value = true
  askQuestion.value = ''
  scrollToBottom()
  try {
    await chat.sendMessage(question, {errorText: t('insights.askError'), limitText: t('insights.askLimitReached')})
  } catch {
    // error message already appended to the chat by the store
  } finally {
    scrollToBottom()
  }
}

function askPrompt(prompt) {
  askQuestion.value = prompt
  submitAskQuestion()
}

async function clearChat() {
  if (sending.value) return
  await chat.clearHistory()
}

onMounted(() => {
  if (!loaded.value) chat.fetchHistory().then(() => { if (messages.value.length) scrollToBottom() }).catch(() => {})
  if (!portfolio.positions.length && !portfolio.loading) portfolio.fetchPortfolio().catch(() => {})
  if (!watchlist.items.length) watchlist.fetchWatchlist().catch(() => {})
})
</script>

<template>
  <article class="ask-panel">
    <button class="ask-panel-header" type="button" @click="expanded = !expanded">
      <div class="ask-panel-heading">
        <div class="ask-title-row">
          <h2>{{ t('insights.portfolioReview') }}</h2>
        </div>
        <p>{{ t('insights.portfolioReviewText') }}</p>
      </div>
      <i :class="expanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="ask-panel-toggle"/>
    </button>

    <div v-show="expanded" class="ask-panel-body">
      <div class="ask-body-top">
        <span>{{ messages.length ? t('insights.askHistoryLabel') : t('insights.askStarterLabel') }}</span>
        <button v-if="messages.length" :disabled="sending" class="ask-clear" type="button" @click="clearChat">
          <i class="pi pi-trash"/>
          <span>{{ t('insights.askClear') }}</span>
        </button>
      </div>

      <div v-if="messages.length || sending" ref="chatBox" class="ask-chat">
        <div v-for="(msg, i) in messages" :key="i" :class="`chat-msg chat-msg-${msg.role}`">
          <p>
            <template v-for="(seg, si) in splitTickers(msg.text)" :key="si">
              <RouterLink v-if="seg.ticker" :to="`/position/${encodeURIComponent(seg.ticker)}`" class="chat-ticker-link">{{ seg.label }}</RouterLink>
              <template v-else>{{ seg.text }}</template>
            </template>
          </p>
          <span v-if="msg.usage?.promptTokens != null" class="chat-msg-tokens">
            {{ t('insights.askTokens', {inTok: msg.usage.promptTokens, outTok: msg.usage.completionTokens}) }}
          </span>
        </div>
        <div v-if="sending" class="chat-msg chat-msg-assistant chat-msg-thinking">
          <span class="thinking-dots"><span/><span/><span/></span>
        </div>
      </div>

      <div v-else class="ask-empty">
        <i class="pi pi-sparkles"/>
        <p>{{ t('insights.askEmptyTitle') }}</p>
        <span>{{ t('insights.askEmptyText') }}</span>
      </div>

      <div class="ask-prompts">
        <button
            v-for="prompt in promptChips"
            :key="prompt"
            :disabled="sending"
            type="button"
            @click="askPrompt(prompt)"
        >
          {{ prompt }}
        </button>
      </div>

      <form class="ask-form" @submit.prevent="submitAskQuestion">
        <input
            v-model="askQuestion"
            :disabled="sending"
            :placeholder="t('insights.askPlaceholderShort')"
            type="text"
        >
        <button :class="{thinking: sending}" :disabled="sending || !askQuestion.trim()" type="submit">
          <i class="pi pi-send"/>
        </button>
      </form>

      <p class="ask-footnote">{{ t('insights.askFootnote') }}</p>
    </div>
  </article>
</template>

<style scoped>
.ask-panel {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  margin-bottom: 1rem;
  overflow: hidden;
}

.ask-panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  border: none;
  background: none;
  padding: 0.85rem 1rem;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.ask-panel-heading {
  flex: 1;
  min-width: 0;
}

.ask-title-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.ask-panel-heading h2 {
  margin: 0;
  font-size: 0.95rem;
}

.ask-panel-heading p {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ask-panel-toggle {
  flex-shrink: 0;
  color: var(--neon-blue);
  font-size: 0.9rem;
}

.ask-panel-body {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0 1rem 1rem;
}

.ask-body-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.ask-clear {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.22rem 0.45rem;
  color: var(--text-secondary);
  background: var(--bg-primary);
  cursor: pointer;
  font: inherit;
  text-transform: none;
}

.ask-clear:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: rgba(0, 207, 255, 0.35);
}

.ask-clear:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ask-chat {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 45vh;
  overflow-y: auto;
  border-radius: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  padding: 0.65rem 0.7rem;
  scroll-behavior: smooth;
}

.ask-empty {
  display: grid;
  place-items: center;
  gap: 0.35rem;
  min-height: 132px;
  border: 1px dashed rgba(0, 207, 255, 0.22);
  border-radius: 8px;
  padding: 1rem;
  text-align: center;
  background: var(--bg-primary);
}

.ask-empty i {
  color: var(--neon-blue);
  font-size: 1.25rem;
}

.ask-empty p {
  margin: 0;
  font-weight: 800;
}

.ask-empty span,
.ask-footnote {
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.4;
}

.ask-prompts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.ask-prompts button {
  border: 1px solid rgba(0, 207, 255, 0.24);
  border-radius: 999px;
  padding: 0.42rem 0.6rem;
  color: var(--text-primary);
  background: rgba(0, 207, 255, 0.08);
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
}

.ask-prompts button:hover:not(:disabled) {
  border-color: rgba(0, 207, 255, 0.45);
  background: rgba(0, 207, 255, 0.14);
}

.ask-prompts button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.chat-msg {
  max-width: 90%;
  animation: ask-fade-in 0.25s ease;
}

.chat-msg p {
  margin: 0;
  padding: 0.5rem 0.65rem;
  border-radius: 10px;
  font-size: 0.82rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-ticker-link {
  color: var(--neon-blue);
  font-weight: 700;
  text-decoration: none;
  border-bottom: 1px solid rgba(0, 207, 255, 0.4);
}

.chat-ticker-link:hover {
  border-bottom-color: var(--neon-blue);
}

.chat-msg-tokens {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.65rem;
  color: var(--text-secondary);
}

.chat-msg-user {
  align-self: flex-end;
}

.chat-msg-user p {
  background: rgba(0, 207, 255, 0.14);
  border: 1px solid rgba(0, 207, 255, 0.3);
  color: var(--text-primary);
  border-bottom-right-radius: 3px;
}

.chat-msg-assistant {
  align-self: flex-start;
}

.chat-msg-assistant p {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-bottom-left-radius: 3px;
}

.chat-msg-error {
  align-self: flex-start;
}

.chat-msg-error p {
  background: rgba(255, 51, 102, 0.1);
  border: 1px solid rgba(255, 51, 102, 0.35);
  color: var(--neon-red);
  border-bottom-left-radius: 3px;
}

.chat-msg-thinking {
  align-self: flex-start;
}

.chat-msg-thinking .thinking-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0.6rem 0.8rem;
  border-radius: 10px;
  border-bottom-left-radius: 3px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
}

@keyframes ask-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ask-form {
  display: flex;
  gap: 0.5rem;
}

.ask-form input {
  flex: 1;
  min-width: 0;
  min-height: 42px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 0.7rem;
  color: var(--text-primary);
  background: var(--bg-secondary);
  font-size: 0.85rem;
}

.ask-form button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 42px;
  width: 42px;
  flex-shrink: 0;
  border: 1px solid rgba(0, 207, 255, 0.45);
  border-radius: 8px;
  color: var(--neon-blue);
  background: rgba(0, 207, 255, 0.1);
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.ask-form button:hover:not(:disabled) {
  background: rgba(0, 207, 255, 0.18);
  box-shadow: 0 0 10px rgba(0, 207, 255, 0.3);
}

.ask-form button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ask-form button.thinking {
  animation: thinking-pulse 1.4s ease-in-out infinite;
}

.ask-footnote {
  margin: -0.2rem 0 0;
}

@keyframes thinking-pulse {
  0%, 100% {
    box-shadow: 0 0 0 rgba(0, 207, 255, 0);
  }
  50% {
    box-shadow: 0 0 10px rgba(0, 207, 255, 0.4);
  }
}

.thinking-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--neon-blue);
  display: inline-block;
  animation: thinking-dot-bounce 1.2s ease-in-out infinite;
}

.thinking-dots span:nth-child(2) {
  animation-delay: 0.15s;
}

.thinking-dots span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes thinking-dot-bounce {
  0%, 60%, 100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

@media (max-width: 760px) {
  .ask-panel {
    margin-bottom: 0.75rem;
  }

  .ask-panel-header {
    align-items: flex-start;
    padding: 0.75rem;
  }

  .ask-panel-heading h2 {
    font-size: 0.9rem;
  }

  .ask-panel-heading p {
    display: -webkit-box;
    margin-top: 0.2rem;
    overflow: hidden;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .ask-panel-toggle {
    margin-top: 0.15rem;
  }

  .ask-panel-body {
    gap: 0.55rem;
    padding: 0 0.75rem 0.75rem;
  }

  .ask-chat {
    max-height: 38vh;
    padding: 0.55rem;
  }

  .ask-body-top {
    font-size: 0.68rem;
  }

  .ask-clear span {
    display: none;
  }

  .ask-prompts {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 0.1rem;
    -webkit-overflow-scrolling: touch;
  }

  .ask-prompts::-webkit-scrollbar {
    display: none;
  }

  .ask-prompts button {
    flex: 0 0 auto;
    max-width: 78%;
    white-space: nowrap;
  }

  .chat-msg {
    max-width: 96%;
  }

  .chat-msg p {
    padding: 0.5rem 0.6rem;
    font-size: 0.8rem;
  }

  .ask-form {
    gap: 0.4rem;
  }

  .ask-form input {
    min-height: 40px;
    font-size: 0.82rem;
  }

  .ask-form button {
    width: 40px;
    min-height: 40px;
  }
}
</style>
