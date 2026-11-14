/**
 * Turns a getUserMedia failure into something the learner can act on.
 * Embedded previews (e.g. an IDE's built-in browser pane) often block the microphone without ever showing a prompt,
 * which surfaces as NotAllowedError or NotSupportedError.
 */
export function microphoneErrorMessage(reason: unknown): string | null {
  const name = reason instanceof DOMException || reason instanceof Error ? reason.name : ''
  const message = reason instanceof Error ? reason.message : String(reason ?? '')
  const openInBrowser = `Open ${window.location.origin} in Chrome or Safari to talk to the tutor.`
  if (!navigator.mediaDevices?.getUserMedia) return `This window can't use a microphone. ${openInBrowser}`
  if (name === 'NotFoundError' || /requested device not found/i.test(message)) return 'No microphone was found. Connect one, then press Start again.'
  if (name === 'NotReadableError') return 'Your microphone is busy in another app. Close it there, then press Start again.'
  if (name === 'NotAllowedError' || name === 'NotSupportedError' || name === 'SecurityError' || /permission|not allowed|not supported|denied/i.test(message)) {
    return window.self !== window.top
      ? `This embedded view blocks the microphone. ${openInBrowser}`
      : `Microphone access is blocked. Allow it from the icon in the address bar (or ${openInBrowser.charAt(0).toLowerCase()}${openInBrowser.slice(1)})`
  }
  return null
}
