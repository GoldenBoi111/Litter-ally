import test from 'node:test'
import assert from 'node:assert/strict'
import { DiagnosticVoice } from './diagnosticVoice.ts'

test('diagnostic sends an ended microphone turn and accepts only its transcript', () => {
  const texts = []
  const sent = []
  const track = { enabled: true }
  const voice = new DiagnosticVoice(text => texts.push(text), () => {})
  voice.channel = { readyState: 'open', send: value => sent.push(JSON.parse(value)) }
  voice.stream = { getAudioTracks: () => [track] }
  voice.turn = 3
  voice.listening = true

  assert.equal(voice.stop(), true)
  assert.equal(track.enabled, false)
  assert.deepEqual(sent, [{ type: 'speech.end', turn: 3 }])
  voice.onMessage(JSON.stringify({ type: 'transcript', turn: 2, text: 'old' }))
  voice.onMessage(JSON.stringify({ type: 'transcript', turn: 3, text: ' answer ' }))
  assert.deepEqual(texts, ['answer'])
})

test('diagnostic finishes speech after queued audio ends', () => {
  let finished = 0
  const voice = new DiagnosticVoice(() => {}, () => {})
  voice.speechId = 4
  voice.finishSpeech = () => { finished += 1 }
  voice.sources.add({})
  voice.onMessage(JSON.stringify({ type: 'speech.done', id: '4' }))
  assert.equal(finished, 0)
  voice.sources.clear()
  voice.onMessage(JSON.stringify({ type: 'speech.done', id: '4' }))
  assert.equal(finished, 1)
})
