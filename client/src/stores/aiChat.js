import {defineStore} from 'pinia'
import {ref} from 'vue'
import api from '@/composables/useApi'

export const useAiChatStore = defineStore('aiChat', () => {
    const messages = ref([])
    const loading = ref(false)
    const sending = ref(false)
    const loaded = ref(false)
    
    async function fetchHistory() {
        loading.value = true
        try {
            const data = await api.get('/stocks/ai-chat')
            messages.value = data.messages || []
            loaded.value = true
        } finally {
            loading.value = false
        }
    }
    
    async function sendMessage(question, {errorText, limitText}) {
        messages.value.push({role: 'user', text: question})
        sending.value = true
        try {
            const {answer, usage} = await api.post('/stocks/ai-ask', {question})
            messages.value.push({role: 'assistant', text: answer, usage})
        } catch (err) {
            messages.value.push({role: 'error', text: err.status === 429 ? limitText : errorText})
            throw err
        } finally {
            sending.value = false
        }
    }
    
    async function clearHistory() {
        await api.delete('/stocks/ai-chat')
        messages.value = []
    }
    
    return {messages, loading, sending, loaded, fetchHistory, sendMessage, clearHistory}
})
