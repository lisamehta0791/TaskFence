/**
 * @vitest-environment jsdom
 *
 * The agent's story, checked.
 *
 * "Fill the blanks from my documents" is a narrow permission that hangs
 * entirely on the agent's own `source: "document"` declaration. These tests
 * cover the case that permission was always vulnerable to: an agent inventing
 * a value and labelling it as something it read.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { valueAppearsIn, verifyDocumentClaim } from './provenance'
import type { DocumentSpec } from '../domains/types'
import { callTool, registerTools } from '../webmcp/adapter'
import { allTools } from '../webmcp'
import { scholarshipDomain } from '../domains/scholarship'
import { useApplicationStore } from '../store/applicationStore'
import { useTaskFenceStore } from '../store/taskfenceStore'

const doc = (over: Partial<DocumentSpec>): DocumentSpec => ({
  id: 'doc_a',
  name: 'transcript.pdf',
  kind: 'pdf',
  sizeKb: 10,
  extracted: {},
  summary: '',
  readable: true,
  origin: 'uploaded',
  text: 'GPA: 3.82 / 4.0\nHousehold income: 31,400\nInstitution: Northgate State University',
  ...over,
})

describe('valueAppearsIn', () => {
  const text = doc({}).text as string

  it('matches through differences in punctuation and spacing', () => {
    expect(valueAppearsIn('3.82 / 4.0', text)).toBe(true)
    expect(valueAppearsIn('3.82/4.0', text)).toBe(true)
    expect(valueAppearsIn('Northgate State University', text)).toBe(true)
  })

  it('matches a number written with or without separators', () => {
    expect(valueAppearsIn('31,400', text)).toBe(true)
    expect(valueAppearsIn('31400', text)).toBe(true)
  })

  it('does not match something that is simply not there', () => {
    expect(valueAppearsIn('4,500', text)).toBe(false)
    expect(valueAppearsIn('Riverside Community College', text)).toBe(false)
  })
})

describe('verifyDocumentClaim', () => {
  const documents = [doc({})]

  it('accepts a claim the document actually supports', () => {
    const check = verifyDocumentClaim({ source: 'document', value: '3.82 / 4.0', documentId: 'doc_a', documents })
    expect(check.verified).toBe(true)
    expect(check.source).toBe('document')
  })

  it('demotes an invented value to a guess', () => {
    const check = verifyDocumentClaim({ source: 'document', value: '4.0 / 4.0', documentId: 'doc_a', documents })
    expect(check.verified).toBe(false)
    expect(check.source).toBe('inference')
    expect(check.note).toMatch(/does not appear/i)
  })

  it('demotes a claim about a document that is not on the page', () => {
    const check = verifyDocumentClaim({ source: 'document', value: 'anything', documentId: 'doc_ghost', documents })
    expect(check.source).toBe('inference')
    expect(check.note).toMatch(/not on this page/i)
  })

  it('demotes a claim about a file nothing can be read out of', () => {
    const scan = [doc({ id: 'doc_scan', name: 'id-card.png', readable: false, text: undefined })]
    const check = verifyDocumentClaim({ source: 'document', value: 'Amara Okonjo', documentId: 'doc_scan', documents: scan })
    expect(check.source).toBe('inference')
    expect(check.note).toMatch(/no text can be read/i)
  })

  it('checks every document when the agent names none', () => {
    expect(verifyDocumentClaim({ source: 'document', value: '31,400', documents }).verified).toBe(true)
    expect(verifyDocumentClaim({ source: 'document', value: '99,999', documents }).source).toBe('inference')
  })

  it('leaves an honest "inference" or "human" claim alone', () => {
    expect(verifyDocumentClaim({ source: 'inference', value: 'x', documents }).source).toBe('inference')
    expect(verifyDocumentClaim({ source: 'human', value: 'x', documents }).source).toBe('human')
  })

  it('does not accuse the agent over a value too short to check', () => {
    const check = verifyDocumentClaim({ source: 'document', value: '5', documents })
    expect(check.checkable).toBe(false)
    expect(check.source).toBe('document')
  })
})

describe('the fence, when an agent lies about where a value came from', () => {
  beforeEach(() => {
    registerTools(allTools)
    useApplicationStore.getState().reset()
    useTaskFenceStore.getState().resetSession()
  })

  const STATEMENT =
    "Complete my scholarship application using my documents. Don't change anything I've already answered. If something is missing, ask me. Ask before you submit."

  it('lets a genuine document value straight through', async () => {
    useTaskFenceStore.getState().startDelegation(STATEMENT, scholarshipDomain)
    const result: any = await callTool('updateApplication', {
      field: 'gpa',
      value: '3.82 / 4.0',
      source: 'document',
      documentId: 'doc_transcript',
    })
    expect(result.ok).toBe(true)
    expect(result.data.sourceUsed).toBe('document')
    expect(result.data.verifiedAgainst).toBeTruthy()
  })

  it('stops an invented value that claims to come from a document', async () => {
    useTaskFenceStore.getState().startDelegation(STATEMENT, scholarshipDomain)

    // "Fill the blanks from my documents" would allow this outright if the
    // site simply believed the agent. The figure is nowhere in the transcript.
    const call = callTool('updateApplication', {
      field: 'fundingGap',
      value: '9,999',
      source: 'document',
      documentId: 'doc_transcript',
    })

    // It is now a guess, and "if something is missing, ask me" catches guesses.
    let pending
    for (let i = 0; i < 50; i += 1) {
      pending = useTaskFenceStore.getState().approvals.find((a) => a.status === 'pending')
      if (pending) break
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(pending).toBeTruthy()
    expect(pending!.request.source).toBe('inference')
    expect(pending!.request.intent).toMatch(/does not appear in it/i)

    useTaskFenceStore.getState().resolveApproval(pending!.id, { approved: false })
    expect(((await call) as any).ok).toBe(false)
    expect(useApplicationStore.getState().values.fundingGap.value).toBe('')
  })

  it('does not credit a document for a value it did not supply', async () => {
    useTaskFenceStore.getState().startDelegation(STATEMENT, scholarshipDomain)
    const call = callTool('updateApplication', {
      field: 'fundingGap',
      value: '9,999',
      source: 'document',
      documentId: 'doc_transcript',
    })
    for (let i = 0; i < 50; i += 1) {
      const pending = useTaskFenceStore.getState().approvals.find((a) => a.status === 'pending')
      if (pending) {
        useTaskFenceStore.getState().resolveApproval(pending.id, { approved: true, scope: 'exact', uses: 1 })
        break
      }
      await new Promise((r) => setTimeout(r, 5))
    }
    const result: any = await call
    expect(result.ok).toBe(true)
    // The human allowed it — but it is not recorded as having come from the file.
    expect(result.data.claimRejected).toMatch(/does not appear/i)
    expect(useApplicationStore.getState().values.fundingGap.sourceDocumentId).toBeUndefined()
  })
})
