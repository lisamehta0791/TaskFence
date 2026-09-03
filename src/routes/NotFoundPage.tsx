import { PageTransition } from '../components/layout/PageTransition'
import { ButtonLink } from '../components/ui/Button'

export default function NotFoundPage() {
  return (
    <PageTransition className="page">
      <div className="container notfound">
        <span className="eyebrow">404</span>
        <h1>Nothing delegated here.</h1>
        <p className="lede">That route isn’t part of this site. Try the demo instead.</p>
        <div className="hero__actions">
          <ButtonLink to="/demo" variant="primary">
            Open the demo
          </ButtonLink>
          <ButtonLink to="/" variant="secondary">
            Back home
          </ButtonLink>
        </div>
      </div>
    </PageTransition>
  )
}
