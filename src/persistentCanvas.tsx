import { useEffect, useState } from 'react'
import { Tldraw, getSnapshot, type Editor, type TLEditorSnapshot, type TldrawProps } from 'tldraw'
import { loadCanvas, saveCanvas } from './storage'

const SAVE_DELAY_MS = 800

/** Saves the canvas to the account a moment after edits stop, and once more when it closes. */
function autosave(editor: Editor, key: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let dirty = false
  const save = () => {
    clearTimeout(timer)
    if (!dirty) return
    dirty = false
    saveCanvas(key, getSnapshot(editor.store)).catch(() => { dirty = true })
  }
  const stop = editor.store.listen(() => { dirty = true; clearTimeout(timer); timer = setTimeout(save, SAVE_DELAY_MS) }, { scope: 'document', source: 'user' })
  window.addEventListener('pagehide', save)
  return () => { stop(); window.removeEventListener('pagehide', save); save() }
}

type Props = Omit<TldrawProps, 'persistenceKey' | 'snapshot'> & { canvasKey: string }

export function PersistentTldraw({ canvasKey, onMount, ...props }: Props) {
  const [state, setState] = useState<{ key: string; snapshot: TLEditorSnapshot | null } | { key: string; error: string } | null>(null)

  useEffect(() => {
    let live = true
    loadCanvas<TLEditorSnapshot>(canvasKey)
      .then(snapshot => live && setState({ key: canvasKey, snapshot }))
      .catch(error => live && setState({ key: canvasKey, error: error instanceof Error ? error.message : 'Could not load this canvas.' }))
    return () => { live = false }
  }, [canvasKey])

  if (!state || state.key !== canvasKey) return <div className="canvas-loading" role="status">Opening canvas…</div>
  // Never open a blank editor over a canvas that failed to load: the first autosave would overwrite the real one.
  if ('error' in state) return <div className="canvas-loading" role="alert">{state.error} Reload the page to try again.</div>
  return (
    <Tldraw
      {...props}
      snapshot={state.snapshot ?? undefined}
      onMount={editor => {
        const stopSaving = autosave(editor, canvasKey)
        const cleanup = onMount?.(editor)
        return () => { stopSaving(); if (typeof cleanup === 'function') cleanup() }
      }}
    />
  )
}
