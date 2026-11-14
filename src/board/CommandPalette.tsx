import { useEffect, useMemo, useRef, useState } from 'react'

export type Command = { id: string; label: string; hint?: string; run: () => void }

/** Cmd/Ctrl+K palette. Every board action (and every voice command, as they land) registers here. */
export function CommandPalette({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o) }
      else if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { if (open) { setQuery(''); setActive(0); input.current?.focus() } }, [open])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? commands.filter(c => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q)) : commands
  }, [commands, query])

  if (!open) return null
  const run = (c?: Command) => { if (!c) return; setOpen(false); c.run() }
  return (
    <div className="palette-backdrop" onPointerDown={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-label="Command palette" onPointerDown={e => e.stopPropagation()}>
        <input
          ref={input} value={query} placeholder="Type a command…" aria-label="Command"
          onChange={e => { setQuery(e.target.value); setActive(0) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, shown.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
            else if (e.key === 'Enter') run(shown[active])
          }}
        />
        <ul role="listbox">
          {shown.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active} onPointerEnter={() => setActive(i)} onClick={() => run(c)}>
              <span>{c.label}</span>{c.hint && <kbd>{c.hint}</kbd>}
            </li>
          ))}
          {!shown.length && <li className="palette-empty">No matching command</li>}
        </ul>
      </div>
    </div>
  )
}
