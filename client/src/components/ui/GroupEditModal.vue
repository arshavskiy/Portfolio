<script setup>
import {ref, watch} from 'vue'
import {useToast} from 'primevue/usetoast'
import {useGroupsStore} from '@/stores/groups'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import AutoComplete from 'primevue/autocomplete'

const props = defineProps({
  visible: Boolean,
  item: {type: Object, default: null}, // { _id, ticker, groups }
  mode: {type: String, default: 'position'}, // 'position' | 'watchlist'
})
const emit = defineEmits(['update:visible', 'saved'])

const toast = useToast()
const groupsStore = useGroupsStore()

const groups = ref([])
const groupSuggestions = ref([])
const pending = ref('')        // raw text currently typed in the input
const loading = ref(false)

watch(() => props.visible, (v) => {
  if (v) {
    groups.value = [...(props.item?.groups || [])]
    pending.value = ''
    groupsStore.fetchGroups()
  }
})

function searchGroups(event) {
  pending.value = event.query || ''
  const q = pending.value.trim().toLowerCase()
  const selected = new Set(groups.value.map((g) => g.toLowerCase()))
  groupSuggestions.value = groupsStore.tags.filter(
      (t) => !selected.has(t.toLowerCase()) && t.toLowerCase().includes(q)
  )
}

// Commit whatever's typed as a new tag (if not already present). Returns true
// if something was added. Used on Enter and as a flush before saving.
function commitPending() {
  const val = pending.value.trim().slice(0, 30)
  pending.value = ''
  groupSuggestions.value = []
  if (!val) return false
  if (groups.value.some((g) => g.toLowerCase() === val.toLowerCase())) return false
  groups.value = [...groups.value, val]
  return true
}

// PrimeVue multiple AutoComplete doesn't add free text on Enter — create here.
function addTypedGroup(event) {
  if (pending.value.trim()) {
    event.preventDefault()
    commitPending()
  }
}

async function save() {
  commitPending() // flush any text the user typed but didn't press Enter on
  loading.value = true
  try {
    if (props.mode === 'watchlist') {
      await groupsStore.updateWatchlistGroups(props.item._id, groups.value)
    } else {
      await groupsStore.updatePositionGroups(props.item._id, groups.value)
    }
    toast.add({severity: 'success', summary: 'Groups updated', life: 2000})
    emit('update:visible', false)
    emit('saved', {ticker: props.item.ticker, groups: groups.value})
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
      :header="`Groups · ${item?.ticker}`"
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
            @input="pending = $event.target ? $event.target.value : pending"
            @keydown.enter="addTypedGroup"
        />
        <span class="text-muted hint">Type to create a new group or pick an existing one</span>
      </div>
      <Button :loading="loading" fluid label="Save" @click="save"/>
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
