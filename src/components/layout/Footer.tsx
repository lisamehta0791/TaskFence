import { Link } from 'react-router-dom'
import { Mark } from '../ui/Mark'

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <span className="footer__wordmark">
              <Mark size={18} /> TaskFence
            </span>
            <p className="muted">
              Hand an AI agent the whole job without handing over the keys. Built for the OpenAI WebMCP Challenge.
            </p>
          </div>

          <div>
            <h4>See it</h4>
            <Link to="/demo">The scholarship form</Link>
            <Link to="/subscriptions">The same thing, another site</Link>
            <Link to="/">How it works</Link>
          </div>

          <div>
            <h4>Reference</h4>
            <a href="https://github.com/webmachinelearning/webmcp" target="_blank" rel="noreferrer noopener">
              The WebMCP proposal
            </a>
            <a
              href="https://github.com/webmachinelearning/webmcp/issues/105"
              target="_blank"
              rel="noreferrer noopener"
            >
              Issue #105 — agent identity
            </a>
            <a
              href="https://github.com/webmachinelearning/webmcp/issues/44"
              target="_blank"
              rel="noreferrer noopener"
            >
              Issue #44 — action permissions
            </a>
          </div>
        </div>

        <div className="footer__end">
          <span className="muted">
            MIT licensed. Everything on this site is made up, nothing is ever paid or sent, and your documents never
            leave your browser.
          </span>
        </div>
      </div>
    </footer>
  )
}
