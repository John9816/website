/** Debounce snapshots by document id and serialize each document's remote writes. */
export function createDocumentSaver({ save, onStatus = () => {}, onSaved = () => {}, onError = () => {}, delay = 800 }) {
  const pending = new Map(), timers = new Map(), queues = new Map(), versions = new Map()
  function schedule(doc) {
    const version = (versions.get(doc.id) || 0) + 1
    versions.set(doc.id, version)
    pending.set(doc.id, { doc: { ...doc }, version })
    clearTimeout(timers.get(doc.id))
    timers.set(doc.id, setTimeout(() => { void flush(doc.id) }, delay))
    onStatus(doc.id, 'dirty')
  }
  function flush(id) {
    clearTimeout(timers.get(id)); timers.delete(id)
    const item = pending.get(id)
    if (!item) return queues.get(id) || Promise.resolve(true)
    pending.delete(id)
    const promise = (queues.get(id) || Promise.resolve()).then(async () => {
      if (versions.get(id) === item.version) onStatus(id, 'saving')
      try {
        const result = await save(item.doc)
        onSaved(result)
        if (versions.get(id) === item.version) onStatus(id, 'saved')
        return true
      } catch (error) {
        if (versions.get(id) === item.version) {
          pending.set(id, item)
          onStatus(id, 'error')
          onError(error)
        }
        return false
      }
    }).finally(() => { if (queues.get(id) === promise) queues.delete(id) })
    queues.set(id, promise)
    return promise
  }
  async function flushAll() {
    const ids = [...new Set([...pending.keys(), ...queues.keys()])]
    const results = await Promise.all(ids.map(flush))
    return results.every(Boolean) && pending.size === 0
  }
  return {
    schedule, flush, flushAll,
    hasPending: () => pending.size > 0 || queues.size > 0,
    discard(id) {
      clearTimeout(timers.get(id)); timers.delete(id); pending.delete(id)
      versions.set(id, (versions.get(id) || 0) + 1)
    },
  }
}
