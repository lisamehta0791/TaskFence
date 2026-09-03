import type { Operation } from '../policy/types'

export interface FieldSpec {
  id: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'money'
  group: string
  required: boolean
  help?: string
  options?: string[]
  placeholder?: string
}

export interface DocumentSpec {
  id: string
  name: string
  kind: 'pdf' | 'image' | 'text' | 'other'
  sizeKb: number
  /** Field/value pairs found in the document. */
  extracted: Record<string, string>
  summary: string
  /** Whether TaskFence was able to read any text out of the file. */
  readable: boolean
  /** The real text, for documents the user uploaded. */
  text?: string
  /** Why it could not be read, if it could not. */
  note?: string
  /** A built-in sample, or a file the user added in this session. */
  origin: 'sample' | 'uploaded'
}

/** A block of the form, and which fields have to be filled for it to be met. */
export interface Requirement {
  id: string
  title: string
  detail: string
  fields: string[]
}

/**
 * Everything a form-shaped workspace needs, as data.
 *
 * A domain that carries one of these gets its record store and its whole set of
 * WebMCP tools generated — no bespoke code. That is what makes "this works for
 * any purpose" a demonstrable claim rather than a slogan: the scholarship is
 * config, exactly like every other workspace.
 */
export interface FormDefinition {
  /** What one record is called, in the UI and in the tool descriptions. */
  noun: string
  /** The form's own branding, e.g. "Horizon Futures Scholarship". */
  title: string
  subtitle: string
  /** Values already on the form when you arrive — what the agent must not touch. */
  seed: Record<string, string>
  documents: DocumentSpec[]
  requirements: Requirement[]
  /** Workspaces where the person defines the fields themselves, at runtime. */
  userDefined?: boolean
  /** Shown above the form when there are no fields yet. */
  emptyHint?: string
}

/**
 * A DomainSpec is everything TaskFence needs to police a site generically.
 * Adding a domain requires no policy-engine changes at all — see how many
 * domains now share one engine, one ledger and one approval flow.
 */
export interface DomainSpec {
  id: string
  route: string
  taskTitle: string
  subject: string
  readTools: string[]
  writeTools: string[]
  uploadTools: string[]
  submitTools: string[]
  deleteTools: string[]
  allTools: string[]
  irreversibleTools: string[]
  /** Maps a tool name to the operation it performs. */
  operationOf: Record<string, Operation>
  fields: FieldSpec[]
  exampleStatement: string
  altStatements: string[]
  /** One-line description of the workspace, for the picker. */
  blurb?: string
  /** Present on form-shaped domains; absent on bespoke ones like subscriptions. */
  form?: FormDefinition
}
