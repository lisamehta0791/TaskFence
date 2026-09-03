import { createRecordStore, registerRecordStore, type RecordStore } from '../store/recordStore'
import { customDomain } from './custom'
import { jobApplicationDomain } from './jobApplication'
import { scholarshipDomain } from './scholarship'
import { subscriptionsDomain } from './subscriptions'
import type { DomainSpec } from './types'

/**
 * Every workspace this site offers.
 *
 * Adding one is adding a config object to this list. The policy engine, the
 * guard, the ledger, the approval flow and the whole workspace UI are untouched
 * — which is the claim TaskFence exists to make, made checkable.
 *
 * `subscriptions` is deliberately not form-shaped: it proves the fence is not
 * secretly a form library either.
 */
export const FORM_DOMAINS: DomainSpec[] = [customDomain, scholarshipDomain, jobApplicationDomain]

export const ALL_DOMAINS: DomainSpec[] = [...FORM_DOMAINS, subscriptionsDomain]

/**
 * You land on the blank, document-driven workspace — not on an example.
 * The first thing anyone should see is "bring your own form", because that is
 * what this actually is. The worked examples are one click away.
 */
export const DEFAULT_DOMAIN_ID = customDomain.id

/** One record store per form-shaped workspace, created once at module load. */
const recordStores = new Map<string, RecordStore>()

for (const domain of FORM_DOMAINS) {
  const store = createRecordStore(domain)
  recordStores.set(domain.id, store)
  registerRecordStore(domain.id, store)
}

export function domainById(id: string): DomainSpec | undefined {
  return ALL_DOMAINS.find((d) => d.id === id)
}

export function formDomainById(id: string): DomainSpec {
  return FORM_DOMAINS.find((d) => d.id === id) ?? customDomain
}

export function useRecordStore(domainId: string): RecordStore {
  const store = recordStores.get(domainId)
  if (!store) throw new Error(`No record store for domain "${domainId}".`)
  return store
}

export function resetAllRecords(): void {
  recordStores.forEach((store) => store.getState().reset())
}

export { scholarshipDomain, jobApplicationDomain, customDomain, subscriptionsDomain }

/**
 * Human-readable label for a field, wherever it lives.
 *
 * The approval prompt has to name the field it is asking about without knowing
 * which workspace raised it.
 */
export function fieldLabel(fieldId: string, domainId?: string): string {
  if (domainId) {
    const store = recordStores.get(domainId)
    const found = store?.getState().fields.find((f) => f.id === fieldId)
    if (found) return found.label
  }
  for (const store of recordStores.values()) {
    const found = store.getState().fields.find((f) => f.id === fieldId)
    if (found) return found.label
  }
  for (const domain of ALL_DOMAINS) {
    const found = domain.fields.find((f) => f.id === fieldId)
    if (found) return found.label
  }
  return fieldId
}
