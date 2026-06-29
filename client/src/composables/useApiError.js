// Show an API error as a toast, unless it was flagged `silent` (e.g. 429s,
// which useApi suppresses and logs to console instead). Centralizes the
// "don't surface rate-limit errors" rule so call sites don't repeat it.
export function notifyError(toast, err, summary = 'Error', life = 3000) {
  if (err?.silent) return
  toast.add({severity: 'error', summary, detail: err?.message, life})
}
