type Entry = { value: unknown; expires: number; bytes: number }
type Pending = {
  controller: AbortController
  promise: Promise<unknown>
  users: number
}
const canceled = () => new DOMException('请求已取消', 'AbortError')
const copy = <T>(value: T): T =>
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T)

/** Bounded memory only. Readers never share mutable objects or cancellation ownership. */
export class MusicReadCache {
  private values = new Map<string, Entry>()
  private pending = new Map<string, Pending>()
  private bytes = 0
  private now: () => number
  private maxEntries: number
  private maxBytes: number
  constructor(
    options: {
      now?: () => number
      maxEntries?: number
      maxBytes?: number
    } = {},
  ) {
    this.now = options.now || Date.now
    this.maxEntries = options.maxEntries ?? 120
    this.maxBytes = options.maxBytes ?? 8 * 1024 * 1024
  }
  clear() {
    for (const pending of this.pending.values()) pending.controller.abort()
    this.pending.clear()
    this.values.clear()
    this.bytes = 0
  }
  evict(key: string) {
    this.remove(key)
  }
  private remove(key: string) {
    const entry = this.values.get(key)
    if (entry) this.bytes -= entry.bytes
    this.values.delete(key)
  }
  read<T>(
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    ttl: number,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(canceled())
    for (const [id, value] of this.values)
      if (value.expires <= this.now()) this.remove(id)
    const cached = this.values.get(key)
    if (cached) {
      this.values.delete(key)
      this.values.set(key, cached)
      return Promise.resolve(copy(cached.value as T))
    }
    let task = this.pending.get(key)
    if (!task) {
      const controller = new AbortController()
      task = { controller, users: 0, promise: Promise.resolve() }
      const active = task
      this.pending.set(key, active)
      // Start synchronously so the first subscriber owns the same request as later readers.
      try {
        active.promise = load(controller.signal)
      } catch (error) {
        active.promise = Promise.reject(error)
      }
      active.promise = active.promise
        .then((value) => {
          if (controller.signal.aborted) throw canceled()
          const bytes = JSON.stringify(value).length * 2
          if (bytes <= this.maxBytes && ttl > 0) {
            this.remove(key)
            this.values.set(key, {
              value: copy(value),
              bytes,
              expires: this.now() + ttl,
            })
            this.bytes += bytes
            while (
              this.values.size > this.maxEntries ||
              this.bytes > this.maxBytes
            )
              this.remove(this.values.keys().next().value!)
          }
          return value
        })
        .finally(() => {
          if (this.pending.get(key) === active) this.pending.delete(key)
        })
      void active.promise.catch(() => {})
    }
    const active = task
    active.users++
    return new Promise<T>((resolve, reject) => {
      let done = false
      const finish = () => {
        if (done) return false
        done = true
        signal?.removeEventListener('abort', abort)
        active.users--
        return true
      }
      const abort = () => {
        if (!finish()) return
        reject(canceled())
        if (!active.users && this.pending.get(key) === active) {
          active.controller.abort()
          this.pending.delete(key)
        }
      }
      signal?.addEventListener('abort', abort, { once: true })
      active.promise.then(
        (value) => {
          if (finish()) resolve(copy(value as T))
        },
        (error) => {
          if (finish()) reject(error)
        },
      )
    })
  }
}
