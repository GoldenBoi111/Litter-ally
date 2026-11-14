import type { Editor } from 'tldraw'
import type { LayoutId } from './layouts'

export const WORKSPACE_FORMAT = 'litterally-workspace'
export const WORKSPACE_VERSION = 1

export type WorkspaceFile = {
  format: typeof WORKSPACE_FORMAT
  version: number
  exportedAt: string
  layout: LayoutId
  camera: { x: number; y: number; z: number }
  snapshot: unknown
}

export function exportWorkspace(editor: Editor, layout: LayoutId): WorkspaceFile {
  const { x, y, z } = editor.getCamera()
  return { format: WORKSPACE_FORMAT, version: WORKSPACE_VERSION, exportedAt: new Date().toISOString(), layout, camera: { x, y, z }, snapshot: editor.getSnapshot() }
}

export function downloadWorkspace(editor: Editor, layout: LayoutId) {
  const blob = new Blob([JSON.stringify(exportWorkspace(editor, layout), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `litterally-workspace-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function parseWorkspace(text: string): WorkspaceFile {
  const data = JSON.parse(text)
  if (data?.format !== WORKSPACE_FORMAT || typeof data.version !== 'number') throw new Error('Not a Litter-ally workspace file')
  if (data.version > WORKSPACE_VERSION) throw new Error('Workspace was saved by a newer version')
  return data
}

export function importWorkspace(editor: Editor, file: WorkspaceFile) {
  editor.loadSnapshot(file.snapshot as Parameters<Editor['loadSnapshot']>[0])
  editor.setCamera(file.camera)
}

export function pickWorkspaceFile(): Promise<WorkspaceFile> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return reject(new Error('No file chosen'))
      try { resolve(parseWorkspace(await f.text())) } catch (e) { reject(e) }
    }
    input.click()
  })
}

/** Clears strings and layout memory; cards are re-synced from the library by the board. */
export function resetWorkspace(editor: Editor) {
  editor.run(() => editor.deleteShapes([...editor.getCurrentPageShapeIds()]))
}
