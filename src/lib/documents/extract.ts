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
      const line = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (line) parts.push(line)
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

/* ------------------------------------------------------------------ *
 * Field guessing
 *
 * A small, deterministic pass that spots values an agent would otherwise have
 * to hunt for. It is a convenience for the UI summary only — the agent gets the
 * full text either way and does its own reading.
 * ------------------------------------------------------------------ */

const PATTERNS: Array<{ field: string; re: RegExp }> = [
  { field: 'fullName', re: /(?:name|student|applicant)\s*[:\-]\s*([A-Z][A-Za-z'’.\- ]{2,48})/i },
  { field: 'email', re: /([\w.+-]+@[\w-]+\.[\w.]{2,})/ },
  { field: 'dateOfBirth', re: /(?:date of birth|d\.?o\.?b\.?|born)\s*[:\-]?\s*([\d]{1,4}[\/\-.][\d]{1,2}[\/\-.][\d]{2,4})/i },
  {
    field: 'previousUniversity',
    re: /(?:institution|university|college|school)\s*[:\-]\s*([A-Z][A-Za-z'’.\- ]{3,60})/i,
  },
  { field: 'degreeProgram', re: /(?:programme|program|course|degree|major)\s*[:\-]\s*([A-Za-z'’.\- ]{3,60})/i },
  { field: 'gpa', re: /(?:gpa|grade average|cgpa|average)\s*[:\-]?\s*([\d.]{1,4}\s*(?:\/\s*[\d.]{1,4})?)/i },
  { field: 'expectedGraduation', re: /(?:graduat\w*)\s*[:\-]?\s*((?:[A-Z][a-z]+\s+)?\d{4})/i },
  {
    field: 'familyIncome',
    re: /(?:household income|family income|annual income|total income)\s*[:\-]?\s*[^\d]{0,3}([\d,]{3,12})/i,
  },
  { field: 'dependents', re: /(?:dependents|household size|people in household)\s*[:\-]?\s*(\d{1,2})/i },
  { field: 'fundingGap', re: /(?:funding (?:gap|needed|required)|shortfall)\s*[:\-]?\s*[^\d]{0,3}([\d,]{3,12})/i },
]

/** Best-effort field/value pairs found in the text. Never guesses beyond a match. */
export function guessFields(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!text) return out
  for (const { field, re } of PATTERNS) {
    const m = text.match(re)
    if (m?.[1]) out[field] = m[1].trim().replace(/\s+/g, ' ')
  }
  return out
}

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
