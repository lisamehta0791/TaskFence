import { motion, useScroll, useTransform } from 'motion/react'
import { useRef } from 'react'
import { PageTransition } from '../components/layout/PageTransition'
import { ScrollReveal } from '../components/layout/ScrollReveal'
import { LazyHeroScene } from '../components/three/Lazy3D'
import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { CountUp } from '../components/ui/CountUp'
import { allTools } from '../lib/webmcp'
import { FORM_DOMAINS } from '../lib/domains'
import { staggerParent, revealChild, springSoft } from '../lib/motion/presets'
import { usePrefersReducedMotion } from '../lib/motion/useReducedMotion'

const STEPS = [
  {
    n: '01',
    title: 'You say what you want',
    body: 'One sentence, in your own words — including the bits you care about. “Fill it in from my documents, don’t touch what I already wrote, ask before you send it.”',
  },
  {
    n: '02',
    title: 'You see what that means',
    body: 'Before anything runs, it shows you the rules it read out of your sentence — and, honestly, any part it could not turn into a rule.',
  },
  {
    n: '03',
    title: 'The agent gets on with it',
    body: 'It reads your documents and fills the form. Every single action is checked against your rules first, so it never has to interrupt you for the ordinary parts.',
  },
  {
    n: '04',
    title: 'You decide the hard bits',
    body: 'When it wants to cross a line you drew, it stops. You see what and why, you can correct its answer, and what you allow lasts exactly one action.',
  },
]

export default function HomePage() {
  const heroRef = useRef<HTMLElement>(null)
  const reduced = usePrefersReducedMotion()
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const sceneY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 70])
  const sceneOpacity = useTransform(scrollYProgress, [0, 1], [1, reduced ? 1 : 0.55])
  const copyY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 44])

  return (
    <PageTransition>
      {/* ---------------------------------------------------------------- */}
      <section className="hero" ref={heroRef}>
        <div className="container hero__inner">
          <motion.div
            className="hero__copy"
            style={{ y: copyY }}
            variants={staggerParent(0.08, 0.1)}
            initial="initial"
            animate="animate"
          >
            <motion.span className="eyebrow" variants={revealChild}>
              <span className="eyebrow__dot" /> OpenAI WebMCP Challenge 2026
            </motion.span>

            <motion.h1 variants={revealChild}>
              Let an AI agent do the whole job.
              <br />
              Keep the <span className="gradient-text">say-so</span>.
            </motion.h1>

            <motion.p className="lede hero__lede" variants={revealChild}>
              Websites can now hand an AI agent real buttons to press. TaskFence is the part that decides which of
              those presses you actually agreed to — settled before each one happens, in words you chose.
            </motion.p>

            <motion.div className="hero__actions" variants={revealChild}>
              <ButtonLink to="/demo" size="lg" variant="primary" arrow>
                Try it on a real form
              </ButtonLink>
              <ButtonLink to="/subscriptions" size="lg" variant="secondary" arrow>
                See it on another site
              </ButtonLink>
            </motion.div>

            <motion.div className="hero__proof" variants={revealChild}>
              {/* Read from the live registry, so these can never drift from reality. */}
              <span>
                <strong>
                  <CountUp to={allTools.length} />
                </strong>{' '}
                real actions this site hands to an agent
              </span>
              <span>
                <strong>
                  <CountUp to={0} />
                </strong>{' '}
                of them can run without your say-so
              </span>
              <span>
                <strong>
                  <CountUp to={FORM_DOMAINS.length + 1} />
                </strong>{' '}
                different workspaces, one identical fence
              </span>
            </motion.div>
          </motion.div>

          <motion.div className="hero__scene" style={{ y: sceneY, opacity: sceneOpacity }}>
            <LazyHeroScene />
          </motion.div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="section" id="problem">
        <div className="container">
          <ScrollReveal className="split" stagger={0.1}>
            <ScrollReveal.Item>
              <span className="eyebrow">The problem</span>
              <h2>An agent doesn’t have to go rogue to do something you never agreed to.</h2>
              <p className="lede">
                Give it access to a website and it can use everything on that website. It only takes one sensible-looking
                step — “this answer looks out of date, I’ll fix it” — to go past what you actually meant.
              </p>
              <p className="muted">
                Today you get two options, and both are bad: watch every click yourself, or hand over the keys and hope.
                TaskFence is the third one.
              </p>
            </ScrollReveal.Item>

            <ScrollReveal.Item>
              <Card tone="deny" padded={false} className="drift">
                <div className="drift__row">
                  <Badge tone="allow">fine</Badge>
                  <span>Read the application</span>
                </div>
                <div className="drift__row">
                  <Badge tone="allow">fine</Badge>
                  <span>Read the documents you uploaded</span>
                </div>
                <div className="drift__row">
                  <Badge tone="allow">fine</Badge>
                  <span>Fill in a blank field from them</span>
                </div>
                <div className="drift__row drift__row--bad">
                  <Badge tone="deny">not fine</Badge>
                  <span>“Correct” an answer you wrote yourself</span>
                </div>
                <p className="drift__note">
                  Nothing was hacked. Every step was reasonable. You still ended up somewhere you never agreed to.
                </p>
              </Card>
            </ScrollReveal.Item>
          </ScrollReveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="section section--alt" id="how">
        <div className="container">
          <ScrollReveal className="section__head" stagger={0.06}>
            <ScrollReveal.Item as="span" className="eyebrow">
              How it works
            </ScrollReveal.Item>
            <ScrollReveal.Item as="h2">Four steps, and you only appear in two of them</ScrollReveal.Item>
          </ScrollReveal>

          <ScrollReveal className="steps" stagger={0.09}>
            {STEPS.map((s) => (
              <ScrollReveal.Item key={s.n} className="step">
                <span className="step__n">{s.n}</span>
                <h3 className="card__title">{s.title}</h3>
                <p>{s.body}</p>
              </ScrollReveal.Item>
            ))}
          </ScrollReveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="section" id="enforcement">
        <div className="container">
          <ScrollReveal className="split split--reverse" stagger={0.1}>
            <ScrollReveal.Item>
              <div className="codeblock">
                <div className="codeblock__head">
                  <span>the check that runs before every action</span>
                </div>
                <pre>
{`the agent wants to   change "previous institution"
you already wrote    "Riverside Community College"
your rule said       don't change what I answered

  → stopped, before anything happened

--- you allow it, once ---

allowed    change "previous institution"
for        this agent, this job
uses       1
expires    the instant it is used`}
                </pre>
              </div>
            </ScrollReveal.Item>

            <ScrollReveal.Item>
              <span className="eyebrow">Why you can trust the answer</span>
              <h2>No AI decides whether your rule holds.</h2>
              <p className="lede">
                A language model is used once, at the start, to turn your sentence into rules — and you read those rules
                before they count for anything. After that it is plain matching: the same action against the same rules
                always gives the same answer.
              </p>
              <p className="muted">
                That is the difference between a boundary and a suggestion. It also means a block can always tell you
                exactly which of your own words stopped it.
              </p>
              <div className="hero__actions">
                <ButtonLink to="/demo" variant="secondary" arrow>
                  Watch it stop an agent
                </ButtonLink>
              </div>
            </ScrollReveal.Item>
          </ScrollReveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="section cta">
        <div className="container">
          <motion.div
            className="cta__panel"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={springSoft}
          >
            <h2>Ninety seconds, one form, one agent.</h2>
            <p className="lede">
              Add a document, say what you want, press start. Watch it work, watch it get stopped, and decide for
              yourself what happens next.
            </p>
            <div className="hero__actions">
              <ButtonLink to="/demo" size="lg" variant="primary" arrow>
                Try it
              </ButtonLink>
            </div>
          </motion.div>
        </div>
      </section>
    </PageTransition>
  )
}
