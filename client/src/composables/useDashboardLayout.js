import {ref, watch} from 'vue'

const STORAGE_KEY = 'dashboard-layout'

const DEFAULT_CARDS = [
  {id: 'stats',      label: 'Portfolio Stats',    visible: true,  alwaysOn: true},
  {id: 'ai-summary', label: 'AI Daily Summary',   visible: true},
  {id: 'markets',    label: 'Markets',             visible: true},
  {id: 'movers',     label: 'Top Movers',          visible: true},
  {id: 'breakdown',  label: 'Portfolio Breakdown',  visible: true},
  {id: 'history',    label: 'Portfolio Value',     visible: true},
  {id: 'compare',    label: 'Compare',             visible: true},
  {id: 'income',     label: 'Income Projection',   visible: true},
  {id: 'calendar',   label: 'Dividend Calendar',   visible: true},
]

function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!Array.isArray(saved)) return DEFAULT_CARDS.map(c => ({...c}))
    const savedMap = Object.fromEntries(saved.map(c => [c.id, c]))
    const merged = DEFAULT_CARDS.map(def => ({
      ...def,
      visible: savedMap[def.id]?.visible ?? def.visible,
    }))
    const savedOrder = saved.map(s => s.id).filter(id => merged.find(c => c.id === id))
    const newCards = merged.filter(c => !savedOrder.includes(c.id))
    return [
      ...savedOrder.map(id => merged.find(c => c.id === id)),
      ...newCards,
    ]
  } catch {
    return DEFAULT_CARDS.map(c => ({...c}))
  }
}

const cards = ref(loadLayout())
const editMode = ref(false)

watch(cards, val => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(val.map(({id, visible}) => ({id, visible}))))
}, {deep: true})

export function useDashboardLayout() {
  function toggleCard(id) {
    const card = cards.value.find(c => c.id === id)
    if (card && !card.alwaysOn) card.visible = !card.visible
  }

  function toggleEditMode() {
    editMode.value = !editMode.value
  }

  function resetLayout() {
    localStorage.removeItem(STORAGE_KEY)
    cards.value = DEFAULT_CARDS.map(c => ({...c}))
  }

  return {cards, editMode, toggleCard, toggleEditMode, resetLayout}
}
