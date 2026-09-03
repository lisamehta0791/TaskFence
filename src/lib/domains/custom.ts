import type { DomainSpec } from './types'

/**
 * A blank workspace, for whatever you are actually doing.
 *
 * No fields, no seed data, no sample documents. You add the fields you need —
 * or upload a document and let the page offer you the fields it found in it —
 * and then delegate exactly as you would on any other workspace.
 *
 * This is the honest answer to "does this only work for scholarships?". The
 * fence does not know or care what the record is. Give it a shape at runtime
 * and every rule, every check and every approval works identically.
 */
export const customDomain: DomainSpec = {
  id: 'custom',
  route: '/demo',
  taskTitle: 'Your own form',
  subject: 'record',
  blurb: 'Upload the form you actually need filled. TaskFence reads the blanks out of it.',

  readTools: ['getRecord', 'getRecordRequirements', 'listRecordDocuments', 'readRecordDocument'],
  writeTools: ['updateRecord'],
  uploadTools: ['attachRecordDocument'],
  submitTools: ['submitRecord'],
  deleteTools: [],
  allTools: [
    'getRecord',
    'getRecordRequirements',
    'listRecordDocuments',
    'readRecordDocument',
    'attachRecordDocument',
    'updateRecord',
    'submitRecord',
  ],
  irreversibleTools: ['submitRecord'],
  operationOf: {
    getRecord: 'READ',
    getRecordRequirements: 'READ',
    listRecordDocuments: 'READ',
    readRecordDocument: 'READ',
    attachRecordDocument: 'UPLOAD',
    updateRecord: 'WRITE',
    submitRecord: 'SUBMIT',
  },

  // Nothing to begin with — the point of this workspace.
  fields: [],

  exampleStatement:
    "Fill in the blanks from my documents. Don't change anything I've already answered. If something is missing, ask me. Ask before you submit.",
  altStatements: [
    'Fill in what you can from my documents and stop. Do not submit.',
    'Read everything and tell me what is missing. Change nothing.',
  ],

  form: {
    noun: 'record',
    title: 'Your form',
    subtitle: 'Built from the document you upload — a job application, a competition entry, anything',
    seed: {},
    requirements: [],
    documents: [],
    userDefined: true,
    emptyHint:
      'No fields yet. Upload the form you need filled and TaskFence will read the blanks out of it — or add fields by hand below. Then set your rules and let an agent do the work.',
  },
}
