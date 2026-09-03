import { motion } from 'motion/react'
import { useTaskFenceStore } from '../../lib/store/taskfenceStore'
import { springSoft } from '../../lib/motion/presets'

/**
 * Switch the simulated agent identity.
 *
 * Delegations are keyed by (agent, task), so switching here switches which
 * contract is in force — and demonstrates that a permission granted to one
 * agent is invisible to another. WebMCP cannot yet *verify* an agent's identity
 * (issue #105); this models the scoping such a mechanism would need.
 */
export function AgentSwitcher({ domainId }: { domainId: string }) {
  const agents = useTaskFenceStore((s) => s.agents)
  const activeAgentId = useTaskFenceStore((s) => s.activeAgentId)
  const setActiveAgent = useTaskFenceStore((s) => s.setActiveAgent)
  const contracts = useTaskFenceStore((s) => s.contracts)

  return (
    <div className="switcher">
      <span className="switcher__label">Acting agent</span>
      <div className="switcher__options" role="radiogroup" aria-label="Acting agent">
        {agents.map((a) => {
          const active = a.id === activeAgentId
          const hasContract = Boolean(contracts[`${a.id}::${domainId}`])
          return (
            <motion.button
              key={a.id}
              role="radio"
              aria-checked={active}
              className={`switcher__option ${active ? 'is-active' : ''}`}
              style={{ ['--agent-color' as string]: a.color }}
              onClick={() => setActiveAgent(a.id)}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              transition={springSoft}
              title={a.description}
            >
              {active ? (
                <motion.span layoutId={`switcher-${domainId}`} className="switcher__pill" transition={springSoft} />
              ) : null}
              <span className="switcher__dot" />
              <span className="switcher__name">{a.name}</span>
              <span className={`switcher__state ${hasContract ? 'has-contract' : ''}`}>
                {hasContract ? 'delegated' : 'no delegation'}
              </span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
