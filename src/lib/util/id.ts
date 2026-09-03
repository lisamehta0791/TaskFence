let counter = 0

/** Short, readable, collision-safe-enough id for a single browser session. */
export function uid(prefix = 'id'): string {
  counter += 1
  const rand = Math.random().toString(36).slice(2, 7)
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`
}

export function shortId(value: string, len = 6): string {
  return value.length <= len ? value : `${value.slice(0, len)}…`
}
