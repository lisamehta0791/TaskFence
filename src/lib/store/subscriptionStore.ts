import { create } from 'zustand'
import { SUBSCRIPTION_SEED, type SubscriptionRecord } from '../domains/subscriptions'

interface SubscriptionState {
  subscriptions: SubscriptionRecord[]
  reminders: Record<string, string>
  highlight: string | null
  changePlan: (id: string, plan: string) => SubscriptionRecord | null
  pause: (id: string) => SubscriptionRecord | null
  cancel: (id: string) => SubscriptionRecord | null
  setReminder: (id: string, when: string) => void
  setHighlight: (id: string | null) => void
  reset: () => void
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscriptions: SUBSCRIPTION_SEED.map((s) => ({ ...s })),
  reminders: {},
  highlight: null,

  changePlan: (id, plan) => {
    const sub = get().subscriptions.find((s) => s.id === id)
    if (!sub) return null
    set((s) => ({
      subscriptions: s.subscriptions.map((x) => (x.id === id ? { ...x, plan } : x)),
      highlight: id,
    }))
    return { ...sub, plan }
  },

  pause: (id) => {
    const sub = get().subscriptions.find((s) => s.id === id)
    if (!sub) return null
    set((s) => ({
      subscriptions: s.subscriptions.map((x) => (x.id === id ? { ...x, status: 'paused' } : x)),
      highlight: id,
    }))
    return { ...sub, status: 'paused' }
  },

  cancel: (id) => {
    const sub = get().subscriptions.find((s) => s.id === id)
    if (!sub) return null
    set((s) => ({
      subscriptions: s.subscriptions.map((x) => (x.id === id ? { ...x, status: 'cancelled' } : x)),
      highlight: id,
    }))
    return { ...sub, status: 'cancelled' }
  },

  setReminder: (id, when) => set((s) => ({ reminders: { ...s.reminders, [id]: when }, highlight: id })),

  setHighlight: (id) => set({ highlight: id }),

  reset: () =>
    set({ subscriptions: SUBSCRIPTION_SEED.map((s) => ({ ...s })), reminders: {}, highlight: null }),
}))

/**
 * For the policy engine, an *active* subscription is an "answered" field: it is
 * something the human already decided on, so changing it is the same class of
 * action as overwriting an existing answer.
 */
export function subscriptionFieldStates(): Record<string, 'answered' | 'empty'> {
  const { subscriptions } = useSubscriptionStore.getState()
  const out: Record<string, 'answered' | 'empty'> = {}
  for (const s of subscriptions) out[s.id] = s.status === 'active' ? 'answered' : 'empty'
  return out
}
