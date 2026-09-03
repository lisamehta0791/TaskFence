import { useState } from 'react'
import { motion } from 'motion/react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { WebMCPStatus } from './WebMCPStatus'
import { allTools } from '../../lib/webmcp'
import { springSoft } from '../../lib/motion/presets'

const PROMPTS = [
  {
    title: '1 · Set the rules',
    text: `You are on a WebMCP site called TaskFence. Call getDelegation first. If nothing is active, call proposeDelegationContract with my request and the boundaries you read in it, then tell me it is waiting for my approval on screen. My request is: "Complete my scholarship application from my documents. Don't change anything I've already answered. If something is missing, ask me. Ask before you submit."`,
  },
  {
    title: '2 · Do the work',
    text: `Read the application and requirements, read my documents, and fill every blank field you can support with a document — use source:"document" and pass the documentId. If a value isn't in any document, don't invent it: use source:"inference" so it comes to me. If a call is blocked, explain why in your own words instead of trying another tool.`,
  },
  {
    title: '3 · Hit the boundary',
    text: `My document says a different previous institution to the one on the form. Try to update that field, then tell me exactly what happened and why.`,
  },
]

/**
 * Connecting a real agent, and proving it is connected — in a drawer rather
 * than a page of its own. Most visitors never need it; the ones who do (judges,
 * anyone with WebMCP enabled) need it right where they are.
 */
export function ConnectDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Connect a real agent"
      subtitle="This site registers its tools with the browser. Whether an agent can call them depends on the browser you are in."
    >
      <div className="drawer">
        <WebMCPStatus />

        <div className="drawer__routes">
          <section>
            <h3>ChatGPT’s in-app browser</h3>
            <ol className="connect__steps">
              <li>Open ChatGPT, start a new chat, and ask it to open this site’s URL.</li>
              <li>Wait for the page to finish loading — the tools register on load.</li>
              <li>
                Ask <em>“what tools does this page expose?”</em>. It should list {allTools.length} of them.
              </li>
              <li>Paste the prompts below, in order.</li>
            </ol>
          </section>

          <section>
            <h3>Chrome with WebMCP turned on</h3>
            <ol className="connect__steps">
              <li>Use a recent Chrome (Canary or Dev is most reliable while this is experimental).</li>
              <li>
                In <code>chrome://flags</code>, search <strong>WebMCP</strong>, enable it, relaunch.
              </li>
              <li>
                Confirm in DevTools: <code>navigator.modelContext</code> or <code>document.modelContext</code>{' '}
                should be an object. The status above updates by itself.
              </li>
            </ol>
          </section>
        </div>

        <div className="drawer__prompts">
          <h3>What to say to it</h3>
          {PROMPTS.map((p, i) => (
            <PromptRow key={p.title} {...p} index={i} />
          ))}
        </div>

        <p className="drawer__note">
          No WebMCP in your browser? Nothing here is broken — the same tools are registered in the page, and the
          built-in agent on the demo calls the identical functions. Only the caller changes.
        </p>
      </div>
    </Modal>
  )
}

function PromptRow({ title, text, index }: { title: string; text: string; index: number }) {
  const [copied, setCopied] = useState(false)
  return (
    <motion.div
      className="drawer__prompt"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springSoft, delay: index * 0.05 }}
    >
      <div className="drawer__prompt-head">
        <h4>{title}</h4>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            } catch {
              setCopied(false)
            }
          }}
        >
          {copied ? 'copied' : 'copy'}
        </Button>
      </div>
      <p>{text}</p>
    </motion.div>
  )
}
