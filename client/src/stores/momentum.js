import {defineStore} from 'pinia'
import {reactive} from 'vue'

// Shared store so WatchRow can publish its combined score (momentum + wave)
// and the grouping sort can read it without re-computing async wave data.
export const useMomentumStore = defineStore('momentum', () => {
  const scores = reactive({}) // ticker → combinedScore

  function setScore(ticker, score) {
    scores[ticker.toUpperCase()] = score
  }

  function getScore(ticker) {
    return scores[ticker.toUpperCase()] ?? null
  }

  return {scores, setScore, getScore}
})
