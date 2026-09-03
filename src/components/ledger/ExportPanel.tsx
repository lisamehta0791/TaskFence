import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '../ui/Button'
import { buildExport, download, toPlainLanguage } from '../../lib/policy/export'
import { useTaskFenceStore } from '../../lib/store/taskfenceStore'
import type { DelegationContract } from '../../lib/policy/types'

export function ExportPanel({ contract }: { contract: DelegationContract }) {
  const ledger = useTaskFenceStore((s) => s.ledger)
  const [format, setFormat] = useState<'plain' | 'json'>('plain')
  const [copied, setCopied] = useState(false)

  const plain = useMemo(() => toPlainLanguage(contract, ledger), [contract, ledger])
  const json = useMemo(() => JSON.stringify(buildExport(contract, ledger), null, 2), [contract, ledger])
  const text = format === 'plain' ? plain : json

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="export">
      <p className="muted">
        A record of exactly what you allowed, what you refused, and what your agent actually did — generated from
        the enforcement log itself.
      </p>

      <div className="export__switch" role="tablist">
        {(['plain', 'json'] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={format === f}
            className={`export__switch-btn ${format === f ? 'is-active' : ''}`}
            onClick={() => setFormat(f)}
          >
            {format === f ? <motion.span layoutId="export-switch" className="export__switch-pill" /> : null}
            <span>{f === 'plain' ? 'Readable' : 'JSON'}</span>
          </button>
        ))}
      </div>

      <pre className="export__preview">{text}</pre>

      <div className="export__actions">
        <Button size="sm" variant="secondary" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            format === 'plain'
              ? download('taskfence-delegation.txt', plain)
              : download('taskfence-delegation.json', json, 'application/json')
          }
        >
          Download
        </Button>
      </div>
    </div>
  )
}
