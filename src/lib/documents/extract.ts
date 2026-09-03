/**
 * In-browser document reading.
 *
 * Nothing leaves the machine: the file is read with FileReader, parsed here,
 * and kept in memory for the session. There is no upload endpoint anywhere in
 * this project.
 *
 * What can actually be read:
 *   - text/csv/markdown/json  -> read directly
 *   - PDF with a text layer   -> pdf.js, loaded on demand (it is ~1MB, so it is
 *                                never in the initial bundle)
 *   - images, scanned PDFs    -> honestly reported as unreadable
 *
 * That last case is not a gap to paper over. An agent that cannot read a file
 * has to come back and ask the human what is in it — which is exactly the
 * behaviour TaskFence exists to make safe.
 */

export interface ExtractResult {
  text: string
  readable: boolean
  /** Why it could not be read, in language an agent can relay to a human. */
  note?: string
  pages?: number
}

const TEXTY = /^(text\/|application\/(json|xml|csv))/i
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|log|rtf)$/i

export async function extractText(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase()

  if (TEXTY.test(file.type) || TEXT_EXT.test(name)) {
    const text = await file.text()
    return { text: text.trim(), readable: text.trim().length > 0 }
  }

  if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
    return extractPdf(file)
  }

  if (file.type.startsWith('image/')) {
    return {
      text: '',
      readable: false,
      note: 'This is an image. TaskFence does not run OCR, so the agent cannot read what it says — it will have to ask you what is in it.',
    }
  }

  return {
    text: '',
    readable: false,
    note: `TaskFence cannot read "${file.name}" (${file.type || 'unknown type'}). Upload a PDF with selectable text, or a .txt/.csv file.`,
  }
}

/* ------------------------------------------------------------------ *
 * PDF
 * ------------------------------------------------------------------ */

type PdfModule = typeof import('pdfjs-dist')
let pdfjs: PdfModule | null = null

async function loadPdfJs(): Promise<PdfModule> {
  if (pdfjs) return pdfjs
  const mod = await import('pdfjs-dist')
  // The worker ships with the package; Vite resolves this to a real URL at build
  // time, so there is no CDN dependency and it works offline.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  mod.GlobalWorkerOptions.workerSrc = workerUrl
  pdfjs = mod
  return mod
}

/** The subset of a pdf.js text item this module actually reads. */
export interface PdfTextItemLike {
  str: string
  hasEOL?: boolean
  transform?: number[]
  width?: number
}

/** The subset of a pdf.js annotation this module actually reads. */
export interface PdfAnnotationLike {
  subtype?: string
  fieldValue?: unknown
  contentsObj?: { str?: string }
  contents?: string
  rect?: number[]
  hidden?: boolean
}

/**
 * Two fragments this close together are one word that pdf.js happened to split
 * ("Intern" + "ational"), so they are joined with no space.
 */
const NO_SPACE_GAP = 1.2

/**
 * A gap this wide is a column break, not a word space. Printed forms put two
 * fields on one line all the time — "Nationality - ____   Passport Number - ____"
 * — and the deriver has to be able to tell them apart. A tab marks the break;
 * everything downstream treats a tab as "a new field may start here".
 */
const COLUMN_GAP = 18

/**
 * Rebuild real lines from pdf.js text items.
 *
 * pdf.js hands text back as positioned fragments, not lines. The old code
 * joined a whole page into ONE line — which silently broke everything
 * downstream, because both the form-deriver and the field-matcher read
 * documents line by line and skip anything absurdly long. A three-page
 * scholarship PDF produced three 200+-word "lines", every one of them
 * discarded, and the user saw "no fields found" on a perfectly good form.
 *
 * A new line starts when pdf.js says so (`hasEOL`) or when the fragment's
 * vertical position moves — two fragments on the same printed line share
 * (almost exactly) one Y coordinate.
 */
export function linesFromTextItems(items: PdfTextItemLike[]): string[] {
  const lines: string[] = []
  let current = ''
  let lastY: number | null = null
  let lastRight: number | null = null

  const flush = () => {
    const line = current.replace(/[ ]{2,}/g, ' ').replace(/\t[ \t]+/g, '\t').trim()
    if (line.replace(/\t/g, '').trim()) lines.push(line)
    current = ''
    lastRight = null
  }

  for (const item of items) {
    const x = Array.isArray(item.transform) ? item.transform[4] : undefined
    const y = Array.isArray(item.transform) ? item.transform[5] : undefined

    if (typeof y === 'number' && lastY !== null && Math.abs(y - lastY) > 3) flush()

    if (item.str) {
      // How far this fragment sits from the end of the previous one decides
      // whether it continues a word, starts a new one, or begins a new column.
      const gap = typeof x === 'number' && lastRight !== null ? x - lastRight : null
      if (current) {
        if (gap === null) current += ' '
        else if (gap >= COLUMN_GAP) current += '\t'
        else if (gap > NO_SPACE_GAP) current += ' '
      }
      current += item.str
    }

    if (typeof y === 'number') lastY = y
    // Without a width there is no way to know where this fragment ends, so the
    // next gap is unmeasurable and the next join falls back to a plain space.
    lastRight = typeof x === 'number' && typeof item.width === 'number' ? x + item.width : null
    if (item.hasEOL) flush()
  }
  flush()

  return lines
}

/* ------------------------------------------------------------------ *
 * Values typed into the PDF itself
 * ------------------------------------------------------------------ */

function annotationValue(a: PdfAnnotationLike): string {
  if (a.hidden) return ''
  const raw = Array.isArray(a.fieldValue) ? a.fieldValue.join(', ') : a.fieldValue
  const text = typeof raw === 'string' && raw.trim() ? raw : (a.contentsObj?.str ?? a.contents ?? '')
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
}

/**
 * Read the answers someone typed into the PDF.
 *
 * This is the bug that made TaskFence look broken on a real form: a filled-in
 * PDF keeps its answers in form-field *annotations*, not in the page's text
 * layer. `getTextContent()` returns the blank template and nothing else — so a
 * form the human had half-completed arrived here looking entirely empty, and
 * every field they had already answered was offered up as "blank, agent may
 * fill it". The values were on the screen; we simply were not looking where
 * they live.
 *
 * Each annotation becomes a text fragment positioned at its box, so it lands on
 * the printed line it belongs to and reads in the right order.
 */
export function annotationTextItems(
  annotations: PdfAnnotationLike[],
  textItems: PdfTextItemLike[],
): PdfTextItemLike[] {
  const baselines = textItems
    .map((i) => (Array.isArray(i.transform) ? i.transform[5] : undefined))
    .filter((y): y is number => typeof y === 'number')

  const out: PdfTextItemLike[] = []
  for (const a of annotations) {
    const value = annotationValue(a)
    if (!value || !Array.isArray(a.rect) || a.rect.length < 4) continue

    const [x1, y1, x2, y2] = a.rect
    // A widget's box is taller than the text in it, so snap to the nearest
    // printed baseline — otherwise the value lands on a line of its own.
    const mid = (y1 + y2) / 2
    let y = y1
    let best = Infinity
    for (const b of baselines) {
      const d = Math.abs(b - mid)
      if (d < best) {
        best = d
        y = b
      }
    }
    if (best > 12) y = mid

    out.push({ str: value, transform: [1, 0, 0, 1, x1, y], width: Math.max(0, x2 - x1) })
  }
  return out
}

/**
 * Text fragments and typed-in answers, in reading order.
 *
 * `hasEOL` is dropped once annotations are in play: it marks the end of the
 * *text* run, and an answer sitting to the right of it would otherwise be
 * pushed onto its own line.
 */
export function mergePageItems(
  textItems: PdfTextItemLike[],
  annotations: PdfAnnotationLike[],
): PdfTextItemLike[] {
  const extra = annotationTextItems(annotations, textItems)
  if (!extra.length) return textItems

  return [...textItems.map((i) => ({ ...i, hasEOL: false })), ...extra].sort((a, b) => {
    const ay = Array.isArray(a.transform) ? a.transform[5] : 0
    const by = Array.isArray(b.transform) ? b.transform[5] : 0
    if (Math.abs(ay - by) > 3) return by - ay
    const ax = Array.isArray(a.transform) ? a.transform[4] : 0
    const bx = Array.isArray(b.transform) ? b.transform[4] : 0
    return ax - bx
  })
}

async function extractPdf(file: File): Promise<ExtractResult> {
  try {
    const lib = await loadPdfJs()
    const buffer = await file.arrayBuffer()
    const doc = await lib.getDocument({ data: buffer }).promise

    const parts: string[] = []
    const maxPages = Math.min(doc.numPages, 25)
    for (let i = 1; i <= maxPages; i += 1) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const items = content.items.filter((it) => 'str' in it) as unknown as PdfTextItemLike[]
      // Answers typed into the PDF live in annotations, not in the text layer.
      const annotations = (await page.getAnnotations().catch(() => [])) as unknown as PdfAnnotationLike[]
      const pageLines = linesFromTextItems(mergePageItems(items, annotations))
      if (pageLines.length) parts.push(pageLines.join('\n'))
    }

    const text = parts.join('\n\n').trim()

    if (!text) {
      return {
        text: '',
        readable: false,
        pages: doc.numPages,
        note: 'This PDF has no selectable text — it is almost certainly a scan. TaskFence does not run OCR, so the agent will have to ask you what it says.',
      }
    }

    return { text, readable: true, pages: doc.numPages }
  } catch (err) {
    return {
      text: '',
      readable: false,
      note: `Could not open this PDF: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Matching an extracted document against a form's actual fields lives in
 * `matchFields.ts` — generic across every workspace, not tied to one domain's
 * vocabulary. There used to be a fixed regex list here (`guessFields`) keyed to
 * scholarship-shaped words like "GPA" and "household income", which is exactly
 * the kind of hardcoding that made document matching fail silently on any other
 * kind of form.
 */

export function summarise(file: File, result: ExtractResult): string {
  if (!result.readable) return result.note ?? 'Could not be read.'
  const words = result.text.split(/\s+/).length
  const pages = result.pages ? `${result.pages} page${result.pages === 1 ? '' : 's'}, ` : ''
  return `${pages}${words.toLocaleString()} words of readable text from ${file.name}.`
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
