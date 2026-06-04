<script setup>
import {ref, watch} from 'vue'
import {useToast} from 'primevue/usetoast'
import {useGroupsStore} from '@/stores/groups'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import AutoComplete from 'primevue/autocomplete'

const props = defineProps({
  visible: Boolean,
  position: {type: Object, default: null}, // { _id, ticker, groups }
})
const emit = defineEmits(['update:visible', 'saved'])

const toast = useToast()
const groupsStore = useGroupsStore()

const groups = ref([])
const groupSuggestions = ref([])
const loading = ref(false)

watch(() => props.visible, (v) => {
  if (v) {
    groups.value = [...(props.position?.groups || [])]
    groupsStore.fetchGroups()
  }
})

function searchGroups(event) {
  const q = (event.query || '').trim().toLowerCase()
  const selected = new Set(groups.value.map((g) => g.toLowerCase()))
  groupSuggestions.value = groupsStore.tags.filter(
      (t) => !selected.has(t.toLowerCase()) && t.toLowerCase().includes(q)
  )
}

// PrimeVue multiple AutoComplete doesn't add free text on Enter — create here.
function addTypedGroup(event) {
  const input = event.target
  const val = (input.value || '').trim().slice(0, 30)
  if (!val) return
  event.preventDefault()
  if (!groups.value.some((g) => g.toLowerCase() === val.toLowerCase())) {
    groups.value = [...groups.value, val]
  }
  input.value = ''
  groupSuggestions.value = []
}

async function save() {
  loading.value = true
  try {
    await groupsStore.updatePositionGroups(props.position._id, groups.value)
    toast.add({severity: 'success', summary: 'Groups updated', life: 2000})
    emit('update:visible', false)
    emit('saved', {ticker: props.position.ticker, groups: groups.value})
  } catch (err) {
    toast.add({severity: 'error', summary: err.message, life: 3000})
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog
      :draggable="false"
      :header="`Groups · ${position?.ticker}`"
      :style="{ width: '95vw', maxWidth: '380px' }"
      :visible="visible"
      modal
      @update:visible="emit('update:visible', $event)"
  >
    <div class="form">
      <div class="field">
        <label>Groups</label>
        <AutoComplete
            v-model="groups"
            :suggestions="groupSuggestions"
            :typeahead="false"
            complete-on-focus
            fluid
            multiple
            placeholder="Tech, Long-term…"
            @complete="searchGroups"
            @keydown.enter="addTypedGroup"
        />
        <span class="text-muted hint">Type to create a new group or pick an existing one</span>
      </div>
      <Button :loading="loading" fluid label="Save" outlined @click="save"/>
    </div>
  </Dialog>
</template>

<style scoped>
.form {
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

.hint {
  font-size: 0.72rem;
}
</style>
