/**
 * Session persistence — the whole "database" layer, in one file.
 *
 * Restores the rules you set, what your agent did, and what is currently on the
 * form, so a refresh does not throw the session away. It writes to
 * `localStorage` on the device and nowhere else.
 *
 * Deliberately NOT persisted:
 *   - uploaded document text. It can be megabytes, it is the most private thing
 *     on the page, and the built-in samples re-seed on every load anyway.
 *   - pending approvals. Those hold live promise resolvers for a paused tool
 *     call; a resolver cannot survive a reload, so restoring one would leave an
 *     agent waiting on a promise that will never settle.
 */

import { useApplicationStore, type FieldRecord } from './applicationStore'
import { useTaskFenceStore } from './taskfenceStore'
import { clearSession, loadSession, saveSession } from './persist'
import type { DelegationContract, LedgerEntry } from '../policy/types'

interface Snapshot {
  sessionId: string
  startedAt: number
  activeAgentId: string
  contracts: Record<string, DelegationContract>
  ledger: LedgerEntry[]
  application: {
    values: Record<string, FieldRecord>
    submitted: boolean
    submittedAt: number | null
    reference: string | null
  }
}

/** Keeps the write cheap while an agent is firing calls in quick succession. */
let timer: number | null = null
let enabled = false

function snapshot(): Snapshot {
  const tf = useTaskFenceStore.getState()
  const app = useApplicationStore.getState()
  return {
    sessionId: tf.sessionId,
    startedAt: tf.startedAt,
    activeAgentId: tf.activeAgentId,
    contracts: tf.contracts,
    // A very long run is not worth a quota error; the tail is what matters.
    ledger: tf.ledger.slice(-250),
    application: {
      values: app.values,
      submitted: app.submitted,
      submittedAt: app.submittedAt,
      reference: app.reference,
    },
  }
}

function scheduleSave() {
  if (!enabled) return
  if (timer !== null) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = null
    saveSession(snapshot())
  }, 400)
}

/** Call once, from main.tsx, before React renders. */
export function initSessionPersistence(): { restored: boolean; savedAt: number | null } {
  const stored = loadSession<Snapshot>()

  if (stored?.data) {
    const d = stored.data
    try {
      useTaskFenceStore.setState({
        sessionId: d.sessionId,
        startedAt: d.startedAt,
        activeAgentId: d.activeAgentId,
        contracts: d.contracts ?? {},
        ledger: d.ledger ?? [],
        // Never restore these two — see the note at the top of the file.
        approvals: [],
        drafts: {},
      })
      if (d.application?.values) {
        useApplicationStore.setState({
          values: d.application.values,
          submitted: d.application.submitted,
          submittedAt: d.application.submittedAt,
          reference: d.application.reference,
        })
      }
    } catch {
      clearSession()
    }
  }

  enabled = true
  useTaskFenceStore.subscribe(scheduleSave)
  useApplicationStore.subscribe(scheduleSave)

  return { restored: Boolean(stored), savedAt: stored?.savedAt ?? null }
}

/** Wipe the stored session as well as the in-memory one. */
export function forgetSession(): void {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
  clearSession()
}
