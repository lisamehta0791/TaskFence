/**
 * The scholarship workspace's record store.
 *
 * There is nothing special about it any more: it is one of several stores
 * produced by `createRecordStore()` from a config object. This module exists so
 * that the scholarship demo — the one in the walkthrough and the video — can be
 * referred to by name, and so older call sites keep working.
 *
 * For anything generic, use `useRecordStore(domainId)` from `lib/domains`.
 */

import { useRecordStore } from '../domains'
import { scholarshipDomain } from '../domains/scholarship'
import { recordFieldStates } from './recordStore'

export type { FieldRecord, RecordState } from './recordStore'

export const useApplicationStore = useRecordStore(scholarshipDomain.id)

/** The site's own truth about which fields hold an answer. Agents cannot forge it. */
export function scholarshipFieldStates(): Record<string, 'answered' | 'empty'> {
  return recordFieldStates(scholarshipDomain.id)
}
