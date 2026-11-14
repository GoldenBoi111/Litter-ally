import test from 'node:test'
import assert from 'node:assert/strict'
import { safeResponsesVoiceEvents, validSpeechText, validVoiceAudio, validateVoiceRequest } from './voice.mjs'
import { canContinueAfterUnrecognizedInterruption, shouldInterruptOnSpeechStart } from '../src/voice-turn.mjs'

test('speech start only interrupts active assistant output when barge-in is enabled', () => {
  assert.equal(shouldInterruptOnSpeechStart(true, true), true)
  assert.equal(shouldInterruptOnSpeechStart(true, false), false)
  assert.equal(shouldInterruptOnSpeechStart(false, true), false)
  assert.equal(shouldInterruptOnSpeechStart(false, false), false)
})

test('transcription errors resume only a live interrupted lesson', () => {
  assert.equal(canContinueAfterUnrecognizedInterruption(true, false, false), true)
  assert.equal(canContinueAfterUnrecognizedInterruption(false, false, false), false)
  assert.equal(canContinueAfterUnrecognizedInterruption(true, true, false), false)
  assert.equal(canContinueAfterUnrecognizedInterruption(true, false, true), false)
})

test('voice endpoint accepts bounded conversation items, including tool outputs', () => {
  assert.equal(validateVoiceRequest({ title: 'Paper', brief: 'Checkpoint', input: [{ type: 'message', role: 'user', content: 'Explain this.' }, { type: 'function_call_output', call_id: 'c1', output: 'Done.' }] }), true)
  assert.equal(validateVoiceRequest({ title: '', brief: '', input: [{ type: 'message' }] }), false)
  assert.equal(validateVoiceRequest({ title: 'Paper', brief: '', input: [{ type: 'reasoning', encrypted_content: 'opaque' }] }), true)
  assert.equal(validateVoiceRequest({ title: 'Paper', brief: '', input: Array(101).fill({ type: 'message' }) }), false)
})

test('local audio requires bounded base64 payloads', () => {
  assert.equal(validVoiceAudio('AAAA'), true)
  assert.equal(validVoiceAudio('bad!'), false)
  assert.equal(validVoiceAudio(''), false)
  assert.equal(validVoiceAudio('A'.repeat(6_500_000)), true)
  assert.equal(validVoiceAudio('A'.repeat(6_500_004)), false)
})

test('TTS accepts one natural phrase within the server request cap', () => {
  assert.equal(validSpeechText('A clear spoken sentence.'), true)
  assert.equal(validSpeechText('   '), false)
  assert.equal(validSpeechText('x'.repeat(901)), false)
})

test('Responses text, function calls, output history and failures become safe voice events', () => {
  assert.deepEqual(safeResponsesVoiceEvents({ type: 'response.output_text.delta', delta: 'Hello.' }), [{ type: 'text', text: 'Hello.' }])
  const call = { type: 'function_call', call_id: 'c1', name: 'draw_lesson_diagram', arguments: '{"diagramIndex":0}' }
  assert.deepEqual(safeResponsesVoiceEvents({ type: 'response.output_item.done', item: call }), [{ type: 'tool', call }])
  const output = [{ type: 'reasoning', encrypted_content: 'opaque' }, call]
  assert.deepEqual(safeResponsesVoiceEvents({ type: 'response.completed', response: { output } }), [{ type: 'output', output }, { type: 'done' }])
  assert.deepEqual(safeResponsesVoiceEvents({ type: 'response.failed', response: { error: { message: 'Unavailable' } } }), [{ type: 'error', error: 'Unavailable' }])
})
