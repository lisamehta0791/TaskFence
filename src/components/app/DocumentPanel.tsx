import { useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useRecordStore } from '../../lib/domains'
import type { DomainSpec } from '../../lib/domains/types'
import { extractText, guessFields, humanSize, summarise } from '../../lib/documents/extract'
import { deriveFormFromText, looksLikeAForm } from '../../lib/documents/deriveForm'
import type { DocumentSpec } from '../../lib/domains/types'
import { Badge } from '../ui/Badge'
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
 */
export function DocumentPanel({ domain }: { domain: DomainSpec }) {
  const store = useRecordStore(domain.id)
  const documents = store((s) => s.documents)
  const attached = store((s) => s.attached)
  const addDocument = store((s) => s.addDocument)
  const removeDocument = store((s) => s.removeDocument)
  const addField = store((s) => s.addField)

  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [derivedNote, setDerivedNote] = useState<string | null>(null)

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
            extracted: guessFields(result.text),
          }

          if (buildsForm && result.readable) {
            const derived = deriveFormFromText(result.text)
            if (derived.fields.length) {
              derived.fields.forEach(addField)
              // Anything the document already answers becomes material the
              // agent can cite — never an answer written behind your back.
              doc.extracted = { ...derived.answers, ...doc.extracted }
              setDerivedNote(
                looksLikeAForm(derived)
                  ? `Read ${derived.fields.length} fields out of ${file.name}. They are on the form below — set your rules, then let an agent fill them.`
                  : `Found ${derived.fields.length} fields in ${file.name}, and ${Object.keys(derived.answers).length} values the agent can use to fill them.`,
              )
            } else {
              setDerivedNote(
                `No labelled fields found in ${file.name}. Add them by hand below, or upload a document with lines like "Full name: ______".`,
              )
            }
          }

          addDocument(doc)
        } finally {
          setBusy(null)
        }
      }
    },
    [addDocument],
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
            : 'Drop a file here or click to choose. PDFs with selectable text and .txt / .csv files are read properly; images and scans are flagged as unreadable so the agent has to ask you.'}
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
                    <p className="docs__extracted">Values found: {found.join(', ')}</p>
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
