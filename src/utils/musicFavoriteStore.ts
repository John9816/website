type Snapshot = {
  liked: Record<string, boolean>
  pending: Record<string, boolean>
}

/** A shared, account-scoped optimistic store for the list and player controls. */
export class MusicFavoriteStore {
  private scope: string | null = null
  private snapshot: Snapshot = { liked: {}, pending: {} }
  private listeners = new Set<() => void>()
  private requests = new Map<string, Promise<boolean>>()
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(snapshot: Snapshot) {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener())
  }
  setScope(scope: string | null) {
    if (scope === this.scope) return
    this.scope = scope
    this.requests.clear()
    this.publish({ liked: {}, pending: {} })
  }
  hydrate(scope: string | null, values: { key: string; liked: boolean }[]) {
    if (scope !== this.scope) return
    const liked = { ...this.snapshot.liked }
    for (const value of values)
      if (!(value.key in liked)) liked[value.key] = value.liked
    this.publish({ ...this.snapshot, liked })
  }
  toggle(
    scope: string,
    key: string,
    write: (liked: boolean) => Promise<unknown>,
  ): Promise<boolean> {
    if (scope !== this.scope) return Promise.resolve(false)
    const existing = this.requests.get(key)
    if (existing) return existing
    const previous = !!this.snapshot.liked[key]
    this.publish({
      liked: { ...this.snapshot.liked, [key]: !previous },
      pending: { ...this.snapshot.pending, [key]: true },
    })
    let work: Promise<unknown>
    try {
      work = write(!previous)
    } catch (error) {
      work = Promise.reject(error)
    }
    const task = work
      .then(
        () => !previous,
        (error) => {
          if (this.scope === scope)
            this.publish({
              ...this.snapshot,
              liked: { ...this.snapshot.liked, [key]: previous },
            })
          throw error
        },
      )
      .finally(() => {
        if (this.requests.get(key) !== task) return
        this.requests.delete(key)
        const pending = { ...this.snapshot.pending }
        delete pending[key]
        this.publish({ ...this.snapshot, pending })
      })
    this.requests.set(key, task)
    return task
  }
}
