/**
 * Where the data lives.
 *
 * There is no database and no server in this project, and that is a decision
 * rather than an omission:
 *
 *   - Judges open a URL and it works. No login wall, no seeding, no cold start.
 *   - Your uploaded documents are read in the browser and never transmitted.
 *     A server would mean they leave your machine, which for a scholarship
 *     application is exactly the wrong trade.
 *   - The interesting claim of this project is what happens at the WebMCP
 *     tool-call boundary. Persisting rows elsewhere adds nothing to it.
 *
 * What we do keep is the *session record* — the rules you set and everything
 * your agent did — in `localStorage`, so a refresh does not throw your work
 * away. It is per-browser, never leaves the device, and one button clears it.
 *
 * If this ever needed a real backend, the shape below is the seam: swap these
 * two functions for fetch calls and nothing else in the app changes.
 */

const VERSION = 1
const KEY = `taskfence.session.v${VERSION}`

export interface PersistedSession<T> {
  version: number
  savedAt: number
  data: T
}

/** Private browsing and locked-down browsers throw on access, not on write. */
function storage(): Storage | null {
  try {
    const probe = '__tf_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

export function saveSession<T>(data: T): boolean {
  const store = storage()
  if (!store) return false
  try {
    const payload: PersistedSession<T> = { version: VERSION, savedAt: Date.now(), data }
    store.setItem(KEY, JSON.stringify(payload))
    return true
  } catch {
    // Quota exceeded, most likely a very long ledger. Losing the record is
    // better than breaking the page, so drop it and carry on.
    try {
      store.removeItem(KEY)
    } catch {
      /* nothing more to do */
    }
    return false
  }
}

export function loadSession<T>(): { data: T; savedAt: number } | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedSession<T>
    // A version bump means the shape changed; start clean rather than guess.
    if (parsed.version !== VERSION) {
      store.removeItem(KEY)
      return null
    }
    return { data: parsed.data, savedAt: parsed.savedAt }
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    storage()?.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}

export function isStorageAvailable(): boolean {
  return storage() !== null
}
