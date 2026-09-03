import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { DocumentSpec, DomainSpec, FieldSpec } from '../domains/types'

/**
 * One record store per form-shaped workspace.
 *
 * Every workspace — the scholarship, the job application, a blank one you
 * define yourself — runs on this same store. Nothing in here knows what kind of
 * form it is holding, which is the point: TaskFence is a layer, not an app
 * about scholarships.
 *
 * Fields live in the store rather than only in the domain config, because a
 * custom workspace lets you add them at runtime.
 */

export interface FieldRecord {
  value: string
  /** Who last wrote this value. Drives the field-level trust badges. */
  writtenBy: 'human' | 'agent' | null
  sourceDocumentId?: string
  updatedAt?: number
}

export interface RecordState {
  domainId: string
  fields: FieldSpec[]
  values: Record<string, FieldRecord>
  documents: DocumentSpec[]
  attached: string[]
  submitted: boolean
  submittedAt: number | null
  reference: string | null
  /** Field currently being written, used for the highlight pulse in the form. */
  focusField: string | null

  setValue: (field: string, value: string, by: 'human' | 'agent', sourceDocumentId?: string) => void
  addField: (field: FieldSpec) => void
  removeField: (fieldId: string) => void
  attachDocument: (documentId: string) => DocumentSpec | null
  addDocument: (doc: DocumentSpec) => void
  removeDocument: (documentId: string) => void
  submit: () => { reference: string; submittedAt: number }
  setFocusField: (field: string | null) => void
  reset: () => void
}

export type RecordStore = UseBoundStore<StoreApi<RecordState>>

function seedValues(fields: FieldSpec[], seed: Record<string, string>): Record<string, FieldRecord> {
  const out: Record<string, FieldRecord> = {}
  for (const f of fields) {
    const v = seed[f.id] ?? ''
    out[f.id] = { value: v, writtenBy: v ? 'human' : null }
  }
  return out
}

function referenceFor(domainId: string, at: number): string {
  const tag = domainId.slice(0, 3).toUpperCase()
  return `${tag}-${new Date(at).getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`
}

export function createRecordStore(domain: DomainSpec): RecordStore {
  const form = domain.form
  if (!form) throw new Error(`Domain "${domain.id}" has no form definition.`)

  const initialFields = domain.fields
  const initialDocs = form.documents

  return create<RecordState>((set, get) => ({
    domainId: domain.id,
    fields: [...initialFields],
    values: seedValues(initialFields, form.seed),
    documents: [...initialDocs],
    attached: [],
    submitted: false,
    submittedAt: null,
    reference: null,
    focusField: null,

    setValue: (field, value, by, sourceDocumentId) =>
      set((s) => ({
        values: {
          ...s.values,
          [field]: { value, writtenBy: by, sourceDocumentId, updatedAt: Date.now() },
        },
        focusField: field,
      })),

    addField: (field) =>
      set((s) =>
        s.fields.some((f) => f.id === field.id)
          ? s
          : {
              fields: [...s.fields, field],
              values: { ...s.values, [field.id]: { value: '', writtenBy: null } },
            },
      ),

    removeField: (fieldId) =>
      set((s) => {
        const values = { ...s.values }
        delete values[fieldId]
        return { fields: s.fields.filter((f) => f.id !== fieldId), values }
      }),

    attachDocument: (documentId) => {
      const doc = get().documents.find((d) => d.id === documentId)
      if (!doc) return null
      set((s) => (s.attached.includes(documentId) ? s : { attached: [...s.attached, documentId] }))
      return doc
    },

    addDocument: (doc) =>
      set((s) => ({ documents: [...s.documents, doc], attached: [...s.attached, doc.id] })),

    removeDocument: (documentId) =>
      set((s) => ({
        documents: s.documents.filter((d) => d.id !== documentId),
        attached: s.attached.filter((id) => id !== documentId),
      })),

    submit: () => {
      const submittedAt = Date.now()
      const reference = referenceFor(domain.id, submittedAt)
      set({ submitted: true, submittedAt, reference })
      return { reference, submittedAt }
    },

    setFocusField: (field) => set({ focusField: field }),

    reset: () =>
      set({
        fields: [...initialFields],
        values: seedValues(initialFields, form.seed),
        documents: [...initialDocs],
        attached: [],
        submitted: false,
        submittedAt: null,
        reference: null,
        focusField: null,
      }),
  }))
}

/* ------------------------------------------------------------------ *
 * Registry
 *
 * The guard needs to ask "is this field already answered?" without knowing
 * which workspace it is policing. This is that lookup.
 * ------------------------------------------------------------------ */

const stores = new Map<string, RecordStore>()

export function registerRecordStore(domainId: string, store: RecordStore): void {
  stores.set(domainId, store)
}

export function getRecordStore(domainId: string): RecordStore | undefined {
  return stores.get(domainId)
}

export function allRecordStores(): RecordStore[] {
  return [...stores.values()]
}

/**
 * The site's own truth about which fields hold an answer. An agent cannot forge
 * this — it is read straight from the record, never from what the agent claims.
 */
export function recordFieldStates(domainId: string): Record<string, 'answered' | 'empty'> {
  const store = stores.get(domainId)
  if (!store) return {}
  const out: Record<string, 'answered' | 'empty'> = {}
  for (const [k, v] of Object.entries(store.getState().values)) {
    out[k] = v.value.trim().length > 0 ? 'answered' : 'empty'
  }
  return out
}
