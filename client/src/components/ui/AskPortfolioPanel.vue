<script setup>
import {nextTick, onMounted, ref} from 'vue'
import {storeToRefs} from 'pinia'
import {useI18n} from '@/composables/useI18n'
import {useAiChatStore} from '@/stores/aiChat'

const {t} = useI18n()
const chat = useAiChatStore()
const {sending, loading, loaded, days, activeDay, activeDayMessages} = storeToRefs(chat)

const askQuestion = ref('')
const chatBox = ref(null)

async function scrollToBottom() {
  await nextTick()
  if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight
}

async function submitAskQuestion() {
  const question = askQuestion.value.trim()
  if (!question || sending.value) return
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

function pickDay(day) {
  chat.selectDay(day)
  scrollToBottom()
}

onMounted(() => {
  if (!loaded.value) chat.fetchHistory().then(scrollToBottom).catch(() => {})
})
</script>

<template>
  <article class="ask-panel">
    <div class="section-heading">
      <h2>{{ t('insights.portfolioReview') }}</h2>
      <p>{{ t('insights.portfolioReviewText') }}</p>
    </div>

    <div v-if="days.length > 1" class="ask-day-picker">
      <div class="ask-day-pills">
        <button
            v-for="d in days"
            :key="d.day"
            :class="{active: (activeDay || days[days.length - 1].day) === d.day}"
            type="button"
            @click="pickDay(d.day)"
        >
          {{ d.label }}
        </button>
      </div>
      <select
          :value="activeDay || days[days.length - 1].day"
          class="ask-day-select"
          @change="pickDay($event.target.value)"
      >
        <option v-for="d in days" :key="d.day" :value="d.day">{{ d.label }}</option>
      </select>
    </div>

    <div v-if="activeDayMessages.length || sending" ref="chatBox" class="ask-chat">
      <div v-for="(msg, i) in activeDayMessages" :key="i" :class="`chat-msg chat-msg-${msg.role}`">
        <p>{{ msg.text }}</p>
        <span v-if="msg.usage?.promptTokens != null" class="chat-msg-tokens">
          {{ t('insights.askTokens', {inTok: msg.usage.promptTokens, outTok: msg.usage.completionTokens}) }}
        </span>
      </div>
      <div v-if="sending" class="chat-msg chat-msg-assistant chat-msg-thinking">
        <span class="thinking-dots"><span/><span/><span/></span>
      </div>
    </div>

    <form class="ask-form" @submit.prevent="submitAskQuestion">
      <input
          v-model="askQuestion"
          :disabled="sending"
          :placeholder="t('insights.askPlaceholder')"
          type="text"
      >
      <button :class="{thinking: sending}" :disabled="sending || !askQuestion.trim()" type="submit">
        <i class="pi pi-send"/>
      </button>
    </form>
  </article>
</template>

<style scoped>
.ask-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  padding: 1rem;
  margin-bottom: 1rem;
}

.ask-day-picker {
  display: flex;
}

.ask-day-pills {
  display: none;
}

.ask-day-select {
  flex: 1;
  min-height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 0.6rem;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.78rem;
  font-weight: 600;
}

@media (min-width: 760px) {
  .ask-day-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .ask-day-select {
    display: none;
  }

  .ask-day-pills button {
    flex: 0 0 auto;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.3rem 0.75rem;
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition: color 0.2s, border-color 0.2s, background 0.2s;
  }

  .ask-day-pills button:hover {
    color: var(--text-primary);
  }

  .ask-day-pills button.active {
    color: var(--neon-blue);
    border-color: rgba(0, 207, 255, 0.45);
    background: rgba(0, 207, 255, 0.1);
  }
}

.ask-chat {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 280px;
  overflow-y: auto;
  border-radius: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  padding: 0.75rem 0.85rem;
  scroll-behavior: smooth;
}

.chat-msg {
  max-width: 85%;
  animation: ask-fade-in 0.25s ease;
}

.chat-msg p {
  margin: 0;
  padding: 0.5rem 0.7rem;
  border-radius: 10px;
  font-size: 0.85rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.chat-msg-tokens {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.68rem;
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
  min-height: 42px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 0.7rem;
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.ask-form button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 42px;
  width: 42px;
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
</style>
