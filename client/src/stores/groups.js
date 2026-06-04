import {defineStore} from 'pinia'
import {ref} from 'vue'
import api from '@/composables/useApi'

export const useGroupsStore = defineStore('groups', () => {
    const tags = ref([]) // distinct group names across the user's positions
    
    async function fetchGroups() {
        try {
            tags.value = await api.get('/portfolio/groups')
        } catch {
            tags.value = []
        }
    }
    
    async function updatePositionGroups(positionId, groups) {
        return api.put(`/portfolio/position/${positionId}/groups`, {groups})
    }
    
    return {tags, fetchGroups, updatePositionGroups}
})
