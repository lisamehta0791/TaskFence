import { useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useRecordStore } from '../../lib/domains'
import type { DomainSpec, FieldSpec } from '../../lib/domains/types'
import { extractText, humanSize, summarise } from '../../lib/documents/extract'
import { deriveFormFromText, looksLikeAForm } from '../../lib/documents/deriveForm'
import { matchDocumentToFields, type FieldMatch } from '../../lib/documents/matchFields'
import type { DocumentSpec } from '../../lib/domains/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { readDocumentWithAi } from '../../lib/documents/aiAssist'
import { uid } from '../../lib/util/id'
import { springSoft } from '../../lib/motion/presets'

const ACCEPT = '.pdf,.txt,.md,.csv,.tsv,.json,.log,.png,.jpg,.jpeg,.webp'

/**
 * Your documents — really yours.
 *
 * Files are read in the browser (FileReader + pdf.js) and kept in memory for
 * the session. Nothing is uploaded: there is no server in this project. The
 * agent then reads what you added through the `readDocument` WebMCP tool, and
 * gets your actual text.
 *
 * Files TaskFence cannot read — images, scanned PDFs with no text layer — are
 * reported as unreadable rather than quietly skipped. An agent that hits one
 * has to come back and ask you what it says, which is the whole point.
 *
 * Two things happen on upload, and they are deliberately different:
 *
 *  - On the blank workspace, a document with labelled blanks (deriveForm) can
 *    become the form itself — new fields get created from it.
 *  - On EVERY workspace, including the ones with a fixed field list, the
 *    document is matched against whatever fields already exist (matchFields).
 *    This is the generic "read the document, work out which of the site's real
 *    fields it answers" step — the same function whether the field list is a
 *    scholarship's, a job application's, or one you typed in yourself.
 *
 * Neither step writes anything. They only produce a proposal, shown below, for
 * the agent (or you) to act on. The actual write still goes through the site's
 * update tool, which the delegation guard checks like any other call.
 */
export function DocumentPanel({ domain }: { domain: DomainSpec }) {
  const store = useRecordStore(domain.id)
  const documents = store((s) => s.documents)
  const attached = store((s) => s.attached)
  const fields = store((s) => s.fields)
  const values = store((s) => s.values)
  const addDocument = store((s) => s.addDocument)
  const removeDocument = store((s) => s.removeDocument)
  const addField = store((s) => s.addField)

  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [derivedNote, setDerivedNote] = useState<string | null>(null)
  const [proposal, setProposal] = useState<{ file: string; matches: FieldMatch[] } | null>(null)

  // The optional second reader. The deterministic one always runs first; this
  // is offered afterwards, because a label in one table cell with its answer in
  // the next has no punctuation for a pattern rule to find.
  const [aiOffer, setAiOffer] = useState<{ name: string; text: string; found: number } | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNote, setAiNote] = useState<string | null>(null)
  const [aiProposal, setAiProposal] = useState<{ name: string; fields: FieldSpec[]; answers: Record<string, string> } | null>(
    null,
  )

  const readWithAi = useCallback(async () => {
    if (!aiOffer) return
    setAiBusy(true)
    setAiNote(null)
    try {
      const result = await readDocumentWithAi(aiOffer.text)
      if (!result.ok) {
        setAiNote(result.note ?? 'That did not work.')
        return
      }
      const existing = new Set(store.getState().fields.map((f) => f.id))
      const fresh = result.fields.filter((f) => !existing.has(f.id))
      if (!fresh.length) {
        setAiNote('The AI reader found the same fields already on the form — nothing new to add.')
        return
      }
      setAiProposal({ name: aiOffer.name, fields: fresh, answers: result.answers })
    } finally {
      setAiBusy(false)
    }
  }, [aiOffer, store])

  const acceptAiProposal = useCallback(() => {
    if (!aiProposal) return
    const { addField, setValue } = store.getState()
    aiProposal.fields.forEach(addField)
    // Same rule as the deterministic path: a value already in the form you
    // uploaded is your answer, not material for an agent to write.
    for (const f of aiProposal.fields) {
      const v = aiProposal.answers[f.id]
      if (v) setValue(f.id, v, 'human')
    }
    setAiNote(`Added ${aiProposal.fields.length} more fields from ${aiProposal.name}.`)
    setAiProposal(null)
    setAiOffer(null)
  }, [aiProposal, store])

  // On a workspace you define yourself, the document *is* the form: whatever
  // labelled blanks it contains become the fields to fill.
  const buildsForm = Boolean(domain.form?.userDefined)

  const ingest = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        setBusy(file.name)
        try {
          const result = await extractText(file)
          const doc: DocumentSpec = {
            id: uid('doc'),
            name: file.name,
            kind: file.type.startsWith('image/')
              ? 'image'
              : file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
                ? 'pdf'
                : /^(text\/|application\/(json|csv|xml))/i.test(file.type)
                  ? 'text'
                  : 'other',
            sizeKb: Math.max(1, Math.round(file.size / 1024)),
            origin: 'uploaded',
            readable: result.readable,
            text: result.text || undefined,
            note: result.note,
            summary: summarise(file, result),
            extracted: {},
          }

          if (result.readable) {
            if (buildsForm) {
              // The blank workspace: the document can create the fields too.
              const derived = deriveFormFromText(result.text)
              if (derived.fields.length) {
                derived.fields.forEach(addField)

                // Whose answers are these? It depends on what the document is.
                //
                // If you uploaded the form itself — half-filled, as people
                // normally do — the values in it are YOUR answers, and they go
                // straight onto the record as yours. That is what makes "don't
                // change anything I've already answered" mean anything: your
                // rules protect them, and the agent has to ask.
                //
                // If it is a source document (a CV, a transcript), the values
                // are material the agent may write, subject to the same rules.
                const isTheFormItself = looksLikeAForm(derived)
                const answered = Object.entries(derived.answers)
                if (isTheFormItself) {
                  const setValue = store.getState().setValue
                  answered.forEach(([id, v]) => setValue(id, v, 'human'))
                  doc.extracted = {}
                } else {
                  doc.extracted = { ...derived.answers }
                }

                setDerivedNote(
                  isTheFormItself
                    ? `Read ${derived.fields.length} fields out of ${file.name}${
                        answered.length
                          ? `, and kept the ${answered.length} you had already filled in as your own answers`
                          : ''
                      }. Set your rules, then let an agent fill the rest.`
                    : `Found ${derived.fields.length} fields in ${file.name}, and ${answered.length} values the agent can use to fill them.`,
                )
                // Pattern rules cannot see a field whose label and answer sit
                // in adjacent table cells, so offer the other reader too.
                setAiOffer({ name: file.name, text: result.text, found: derived.fields.length })
                setAiNote(null)
              } else {
                setDerivedNote(
                  `The built-in reader found no labelled fields in ${file.name}. That usually means the form uses a table layout, where a pattern rule has no punctuation to work from.`,
                )
                setAiOffer({ name: file.name, text: result.text, found: 0 })
                setAiNote(null)
              }
            } else {
              // A fixed-field workspace: match the document against the fields
              // that already exist here, whatever this workspace turns out to
              // be — no field name from any one domain is hardcoded into this.
              const currentFields = store.getState().fields
              const matches = matchDocumentToFields(result.text, currentFields)
              doc.extracted = Object.fromEntries(matches.map((m) => [m.fieldId, m.value]))
              setProposal(matches.length ? { file: file.name, matches } : null)
              setDerivedNote(
                matches.length
                  ? null
                  : `Nothing in ${file.name} matched a field on this form by its label. The agent can still read the full text — see it below.`,
              )
            }
          } else {
            setDerivedNote(null)
          }

          addDocument(doc)
        } finally {
          setBusy(null)
        }
      }
    },
    [addDocument, addField, buildsForm, store],
  )

  return (
    <div className="docs">
      <header className="docs__head">
        <h3>Your documents</h3>
        <span className="muted">
          {documents.length} file{documents.length === 1 ? '' : 's'} · read in your browser, never uploaded
        </span>
      </header>

      <div
        className={`docs__drop ${dragging ? 'is-over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (e.dataTransfer.files?.length) void ingest(e.dataTransfer.files)
        }}
        role="button"
        tabIndex={0}
      >
        <span className="docs__drop-title">
          {busy ? `Reading ${busy}…` : 'Add your own document'}
        </span>
        <span className="docs__drop-sub">
          {buildsForm
            ? 'Drop the form you actually need filled — a job application, a competition entry, anything with labelled blanks. TaskFence reads the fields out of it and builds the record from them.'
            : 'Drop a transcript, CV or certificate. TaskFence reads it and works out which of the fields below it answers.'}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={(e) => {
            if (e.target.files?.length) void ingest(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {derivedNote ? (
        <motion.p
          className="docs__derived"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSoft}
        >
          {derivedNote}
        </motion.p>
      ) : null}

      <AnimatePresence>
        {aiOffer && !aiProposal ? (
          <motion.div
            className="docs__ai"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={springSoft}
          >
            <div className="docs__ai-copy">
              <strong>
                {aiOffer.found ? 'Some fields missing?' : 'Try reading it with AI'}
              </strong>
              <span className="muted">
                The built-in reader works on punctuation, so it cannot see a field whose label and answer sit in
                separate table cells. An AI reader can. It only <em>proposes</em> fields — you decide what gets
                added, and it never fills anything in for you.
              </span>
              <span className="docs__ai-privacy">
                This is the one thing on this page that leaves your browser: the text of {aiOffer.name} is sent to
                the model. Everything else stays in this tab.
              </span>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void readWithAi()} disabled={aiBusy}>
              {aiBusy ? 'Reading…' : 'Read it with AI'}
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {aiNote ? <p className="docs__derived">{aiNote}</p> : null}

      <AnimatePresence>
        {aiProposal ? (
          <motion.div
            className="docs__proposal"
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={springSoft}
          >
            <header className="docs__proposal-head">
              <span>
                AI reader proposes {aiProposal.fields.length} more field
                {aiProposal.fields.length === 1 ? '' : 's'} from {aiProposal.name}
              </span>
              <button className="docs__remove" onClick={() => setAiProposal(null)} aria-label="Discard">
                discard
              </button>
            </header>
            <ul className="docs__proposal-list">
              {aiProposal.fields.map((f) => (
                <li key={f.id}>
                  <span className="docs__proposal-check">+</span>
                  <span className="docs__proposal-label">{f.label}</span>
                  {aiProposal.answers[f.id] ? (
                    <>
                      <span className="docs__proposal-arrow">→</span>
                      <span className="docs__proposal-value">“{aiProposal.answers[f.id]}”</span>
                    </>
                  ) : (
                    <span className="docs__proposal-note">blank</span>
                  )}
                </li>
              ))}
            </ul>
            <div className="docs__proposal-actions">
              <Button size="sm" variant="primary" onClick={acceptAiProposal}>
                Add these fields
              </Button>
              <span className="muted">
                Values shown are what the reader says are already written in your form — they become your answers,
                which your rules then protect.
              </span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {proposal ? (
          <motion.div
            className="docs__proposal"
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={springSoft}
          >
            <header className="docs__proposal-head">
              <span>Detected in {proposal.file}</span>
              <button className="docs__remove" onClick={() => setProposal(null)} aria-label="Dismiss">
                dismiss
              </button>
            </header>
            <ul className="docs__proposal-list">
              {proposal.matches.map((m) => {
                const already = (values[m.fieldId]?.value ?? '').trim()
                return (
                  <li key={m.fieldId} className={already ? 'is-existing' : ''}>
                    <span className="docs__proposal-check">{already ? '⚠' : '✓'}</span>
                    <span className="docs__proposal-label">{m.fieldLabel}</span>
                    <span className="docs__proposal-arrow">→</span>
                    <span className="docs__proposal-value">“{m.value}”</span>
                    {already ? (
                      <span className="docs__proposal-note">you already answered this — the agent must ask</span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            <p className="muted docs__proposal-foot">
              Nothing here has been written yet. This is what the agent can propose once you set your rules —
              writing it still goes through the same fence as everything else.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ul className="docs__list">
        <AnimatePresence initial={false}>
          {documents.map((d) => {
            const isAttached = attached.includes(d.id)
            const found = Object.keys(d.extracted)
            return (
              <motion.li
                key={d.id}
                className={`docs__item ${isAttached ? 'is-attached' : ''}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={springSoft}
                layout
              >
                <span className="docs__icon" aria-hidden="true">
                  {d.kind === 'pdf' ? 'PDF' : d.kind === 'image' ? 'IMG' : d.kind === 'text' ? 'TXT' : 'FILE'}
                </span>

                <div className="docs__meta">
                  <p className="docs__name">{d.name}</p>
                  <p className="docs__summary">
                    {d.summary} · {humanSize(d.sizeKb * 1024)}
                  </p>
                  {found.length ? (
                    <p className="docs__extracted">
                      Matched fields: {found.map((id) => fields.find((f) => f.id === id)?.label ?? id).join(', ')}
                    </p>
                  ) : null}
                  {!d.readable && d.note ? <p className="docs__unreadable">{d.note}</p> : null}
                </div>

                <div className="docs__actions">
                  {d.readable ? (
                    isAttached ? (
                      <Badge tone="allow">attached</Badge>
                    ) : (
                      <span className="muted docs__pending">not attached</span>
                    )
                  ) : (
                    <Badge tone="ask">unreadable</Badge>
                  )}
                  <button
                    className="docs__remove"
                    onClick={() => removeDocument(d.id)}
                    aria-label={`Remove ${d.name}`}
                  >
                    remove
                  </button>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>

      <p className="docs__note">
        Document text is passed to the agent as data, never as instructions — the tool that reads it declares{' '}
        <code>untrustedContentHint: true</code>. Everything here stays in this browser tab.
      </p>
    </div>
  )
}
