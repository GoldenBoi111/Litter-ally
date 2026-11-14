export function shouldInterruptOnSpeechStart(bargeIn, busy) {
  return bargeIn && busy
}

export function canContinueAfterUnrecognizedInterruption(interruptedForInput, closed, paused) {
  return interruptedForInput && !closed && !paused
}
