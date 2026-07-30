<script setup>
import { computed, nextTick, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import DOMPurify from "dompurify";
import { useI18n } from "@/composables/useI18n";
import { useAiChatStore } from "@/stores/aiChat";
import { usePortfolioStore } from "@/stores/portfolio";
import { useWatchlistStore } from "@/stores/watchlist";
import { useTickerLinkify } from "@/composables/useTickerLinkify";

const { t } = useI18n();
const chat = useAiChatStore();
const portfolio = usePortfolioStore();
const watchlist = useWatchlistStore();
const { messages, sending, loaded } = storeToRefs(chat);
const { splitTickers } = useTickerLinkify();

function safeHtml(text) {
  if (!text) return ''
  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: ['p','br','strong','em','b','i','ul','ol','li','table','thead','tbody','tr','th','td','h1','h2','h3','h4','span'],
    ALLOWED_ATTR: [],
  })
}

const askQuestion = ref("");
const chatBox = ref(null);
const showAllHistory = ref(false);
const justSent = ref(false);

// Recent messages shown by default; older turns hidden behind the history toggle.
const RECENT_MESSAGE_COUNT = 6;

const visibleMessages = computed(() => {
  if (showAllHistory.value || messages.value.length <= RECENT_MESSAGE_COUNT)
    return messages.value;
  return messages.value.slice(-RECENT_MESSAGE_COUNT);
});

const hiddenHistoryCount = computed(
  () => messages.value.length - visibleMessages.value.length,
);

function formatMessageDate(createdAt) {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return (
    date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }) +
    " " +
    date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

// Prompt-chip suggestions hidden for now — flip back on when ready to ship again.
const SHOW_PROMPT_CHIPS = false;

const promptChips = computed(() => [
  t("insights.askPromptPerformance"),
  t("insights.askPromptRisk"),
  t("insights.askPromptIncome"),
]);

async function scrollToBottom() {
  await nextTick();
  if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight;
}

async function submitAskQuestion() {
  const question = askQuestion.value.trim();
  if (!question || sending.value) return;
  askQuestion.value = "";
  justSent.value = true;
  setTimeout(() => {
    justSent.value = false;
  }, 500);
  scrollToBottom();
  try {
    await chat.sendMessage(question, {
      errorText: t("insights.askError"),
      limitText: t("insights.askLimitReached"),
    });
  } catch {
    // error message already appended to the chat by the store
  } finally {
    scrollToBottom();
  }
}

function askPrompt(prompt) {
  askQuestion.value = prompt;
  submitAskQuestion();
}

async function clearChat() {
  if (sending.value) return;
  await chat.clearHistory();
}

onMounted(() => {
  if (!loaded.value)
    chat
      .fetchHistory()
      .then(() => {
        if (messages.value.length) scrollToBottom();
      })
      .catch(() => {});
  if (!portfolio.positions.length && !portfolio.loading)
    portfolio.fetchPortfolio().catch(() => {});
  if (!watchlist.items.length) watchlist.fetchWatchlist().catch(() => {});
});
</script>

<template>
  <article class="ask-panel">
    <div class="ask-panel-body">
      <div class="ask-body-top">
        <div class="ask-body-left">
          <span>{{
            messages.length
              ? t("insights.askHistoryLabel")
              : t("insights.askStarterLabel")
          }}</span>
          <button
            v-if="messages.length > RECENT_MESSAGE_COUNT"
            :class="{ active: showAllHistory }"
            class="ask-history-toggle"
            type="button"
            @click="showAllHistory = !showAllHistory"
          >
            <i class="pi pi-history" />
            <span>{{
              showAllHistory
                ? t("insights.askHideHistory")
                : t("insights.askShowHistory")
            }}</span>
          </button>
        </div>
        <button
          v-if="messages.length"
          :disabled="sending"
          class="ask-clear"
          type="button"
          @click="clearChat"
        >
          <i class="pi pi-trash" />
          <span>{{ t("insights.askClear") }}</span>
        </button>
      </div>

      <div v-if="messages.length || sending" ref="chatBox" class="ask-chat">
        <div v-if="hiddenHistoryCount > 0" class="ask-history-hint">
          {{ t("insights.askHiddenHistory", { count: hiddenHistoryCount }) }}
        </div>
        <div
          v-for="(msg, i) in visibleMessages"
          :key="i"
          :class="`chat-row chat-row-${msg.role}`"
        >
          <div class="chat-avatar">
            <i
              :class="
                msg.role === 'user'
                  ? 'pi pi-user'
                  : msg.role === 'error'
                    ? 'pi pi-exclamation-triangle'
                    : 'pi pi-comment'
              "
            />
          </div>
          <div class="chat-bubble-col">
            <p v-if="msg.role === 'user'" class="chat-bubble">{{ msg.text }}</p>
            <div v-else class="chat-bubble chat-bubble-html" v-html="safeHtml(msg.text)" />
            <div class="chat-meta">
              <span v-if="msg.createdAt" class="chat-msg-date">{{
                formatMessageDate(msg.createdAt)
              }}</span>
              <span
                v-if="msg.usage?.promptTokens != null"
                class="chat-msg-tokens"
              >
                {{
                  t("insights.askTokens", {
                    inTok: msg.usage.promptTokens,
                    outTok: msg.usage.completionTokens,
                  })
                }}
              </span>
            </div>
          </div>
        </div>
        <div v-if="sending" class="chat-row chat-row-assistant">
          <div class="chat-avatar">
            <i class="pi pi-comment" />
          </div>
          <div class="chat-bubble-col">
            <p class="chat-bubble chat-bubble-thinking">
              <span class="thinking-dots"><span /><span /><span /></span>
            </p>
          </div>
        </div>
      </div>

      <div v-else class="ask-empty">
        <i class="pi pi-comments" />
        <p>{{ t("insights.askEmptyTitle") }}</p>
        <span>{{ t("insights.askEmptyText") }}</span>
      </div>

      <div v-if="SHOW_PROMPT_CHIPS" class="ask-prompts">
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
        />
        <button
          :class="{ thinking: sending, sent: justSent }"
          :disabled="sending || !askQuestion.trim()"
          type="submit"
        >
          <i class="pi pi-send" />
        </button>
      </form>
    </div>
  </article>
</template>

<style scoped>
.ask-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ask-panel-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
}

.ask-body-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0 0.25rem;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.ask-body-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ask-clear,
.ask-history-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-height: 28px;
  border-radius: 6px;
  padding: 3px 8px;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  font-size: 0.72rem;
  text-transform: none;
  letter-spacing: 0;
  transition:
    border-color 0.15s,
    background 0.15s,
    color 0.15s;
}

.ask-clear {
  border: 0;
  color: var(--text-secondary);
  background: transparent;
}

.ask-clear:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--accent);
}

.ask-history-toggle {
  border: 0;
  color: var(--text-secondary);
  background: transparent;
}

.ask-history-toggle:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.ask-history-toggle i {
  color: inherit;
}

.ask-history-toggle.active {
  border-color: var(--accent);
  color: #fff;
  background: var(--accent);
}

.ask-history-toggle.active i {
  color: inherit;
}

.ask-history-toggle.active:hover {
  background: var(--accent);
  opacity: 0.85;
}

.ask-history-hint {
  text-align: center;
  padding: 0.35rem;
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 600;
  font-style: italic;
}

.ask-clear:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ask-chat {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  min-height: 340px;
  max-height: 64vh;
  overflow-y: auto;
  border-radius: 14px;
  background: transparent;
  border: 0;
  padding: 0.85rem 0.75rem;
  scroll-behavior: smooth;
  box-shadow: none;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.35) transparent;
}

.ask-chat::-webkit-scrollbar {
  width: 6px;
}

.ask-chat::-webkit-scrollbar-track {
  background: transparent;
}

.ask-chat::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.35);
}

.ask-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 300px;
  border: 0;
  border-radius: 14px;
  padding: 1rem;
  text-align: center;
  background: transparent;
}

.ask-empty i {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 8px;
  color: var(--neon-blue);
  background: transparent;
  font-size: 1rem;
}

.ask-empty p {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 700;
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
  gap: 0.45rem;
}

.ask-prompts button {
  min-height: 30px;
  border: 0;
  border-radius: 6px;
  padding: 4px 10px;
  color: var(--text-secondary);
  background: transparent;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.15s,
    color 0.15s;
}

.ask-prompts button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text-primary);
}

.ask-prompts button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.chat-row {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  max-width: min(86%, 820px);
  animation: ask-fade-in 0.25s ease;
}

.chat-row-user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.chat-row-assistant,
.chat-row-error {
  align-self: flex-start;
}

.chat-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 0.66rem;
  border: 0;
  background: transparent;
}

.chat-row-user .chat-avatar {
  color: var(--neon-blue);
}

.chat-row-assistant .chat-avatar {
  color: var(--neon-blue);
}

.chat-row-error .chat-avatar {
  color: var(--neon-red);
}

.chat-bubble-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-row-user .chat-bubble-col {
  align-items: flex-end;
}

.chat-bubble {
  margin: 0;
  padding: 0.62rem 0.85rem;
  border-radius: 14px;
  font-size: 0.78rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-bubble-html {
  white-space: normal;
}

.chat-bubble-html :deep(p) {
  margin: 0 0 0.4rem;
}

.chat-bubble-html :deep(p:last-child) {
  margin-bottom: 0;
}

.chat-bubble-html :deep(ul),
.chat-bubble-html :deep(ol) {
  margin: 0.25rem 0 0.4rem 1.2rem;
  padding: 0;
}

.chat-bubble-html :deep(li) {
  margin-bottom: 0.15rem;
}

.chat-bubble-html :deep(table) {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.75rem;
  margin: 0.4rem 0;
  overflow-x: auto;
  display: block;
}

.chat-bubble-html :deep(th),
.chat-bubble-html :deep(td) {
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
}

.chat-bubble-html :deep(th) {
  background: var(--bg-secondary);
  font-weight: 600;
  color: var(--text-secondary);
}

.chat-ticker-link {
  color: var(--neon-blue);
  font-weight: 600;
  text-decoration: none;
  border-bottom: 1px solid rgba(0, 207, 255, 0.4);
}

.chat-ticker-link:hover {
  border-bottom-color: var(--neon-blue);
}

.chat-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.25rem;
  padding-inline: 0.15rem;
}

.chat-row-user .chat-meta {
  justify-content: flex-end;
}

.chat-msg-date,
.chat-msg-tokens {
  font-size: 0.65rem;
  color: var(--text-secondary);
}

.chat-row-user .chat-bubble {
  background: transparent;
  border: 0;
  color: var(--text-primary);
  font-weight: 600;
  border-bottom-right-radius: 5px;
}

.chat-row-assistant .chat-bubble {
  background: transparent;
  border: 0;
  color: var(--text-primary);
  border-bottom-left-radius: 5px;
}

.chat-row-error .chat-bubble {
  background: transparent;
  border: 0;
  color: var(--neon-red);
  border-bottom-left-radius: 5px;
}

.chat-bubble-thinking {
  display: inline-flex;
  padding: 0.6rem 0.8rem;
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
  align-items: center;
  gap: 0.5rem;
  border: 0;
  border-radius: 14px;
  background: transparent;
  padding: 0.4rem;
}

.ask-form input {
  flex: 1;
  min-width: 0;
  min-height: 42px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0 0.8rem;
  color: var(--text-primary);
  background: transparent;
  font-size: 0.78rem;
  outline: none;
}

.ask-form input:focus {
  border-color: var(--neon-blue);
  box-shadow: none;
}

.ask-form button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 42px;
  width: 42px;
  flex-shrink: 0;
  border: 0;
  border-radius: 10px;
  color: var(--neon-blue);
  background: transparent;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.ask-form button:hover:not(:disabled) {
  box-shadow: none;
}

.ask-form button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ask-form button.thinking {
  animation: none;
}

.ask-form button.sent i {
  animation: send-fly 0.5s ease;
}

.ask-footnote {
  margin: -0.25rem 0 0;
  padding-inline: 0.25rem;
}

@keyframes thinking-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 rgba(0, 207, 255, 0);
  }
  50% {
    box-shadow: 0 0 10px rgba(0, 207, 255, 0.4);
  }
}

@keyframes send-fly {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 1;
  }
  55% {
    transform: translate(14px, -14px) scale(0.6);
    opacity: 0;
  }
  56% {
    transform: translate(-14px, 14px) scale(0.6);
    opacity: 0;
  }
  100% {
    transform: translate(0, 0) scale(1);
    opacity: 1;
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
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

@media (max-width: 760px) {
  .ask-panel-body {
    gap: 0.55rem;
  }

  .ask-chat {
    min-height: 300px;
    max-height: 62vh;
    padding: 0.65rem;
  }

  .ask-body-top {
    font-size: 0.68rem;
  }

  .ask-clear span,
  .ask-history-toggle span {
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

  .chat-row {
    max-width: 98%;
    gap: 0.4rem;
  }

  .chat-avatar {
    width: 26px;
    height: 26px;
    font-size: 0.62rem;
  }

  .chat-bubble {
    padding: 0.58rem 0.68rem;
    font-size: 0.8rem;
  }

  .ask-form {
    gap: 0.4rem;
    padding: 0.35rem;
  }

  .ask-form input {
    min-height: 40px;
    font-size: 0.78rem;
  }

  .ask-form button {
    width: 40px;
    min-height: 40px;
  }
}
</style>
