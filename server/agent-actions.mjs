const colors = ['black', 'grey', 'light-violet', 'violet', 'blue', 'light-blue', 'yellow', 'orange', 'green', 'light-green', 'light-red', 'red', 'white']
const shapeKinds = ['box', 'ellipse', 'diamond', 'note', 'text']
const strokeSizes = ['s', 'm', 'l']
const textSizes = ['s', 'm', 'l', 'xl']
export const widgetKinds = ['table', 'bar', 'line', 'pie', 'stats', 'timeline']
const shortText = { type: 'string', maxLength: 60 }
// One data shape for every widget kind (strict structured outputs need a fixed shape); see validateWidget for how each kind reads it.
const widgetActionSchema = {
  type: 'object', additionalProperties: false,
  required: ['_type', 'id', 'atMs', 'kind', 'x', 'y', 'w', 'h', 'title', 'labels', 'series', 'rows', 'unit'],
  properties: {
    _type: { type: 'string', const: 'widget' }, id: { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,47}$' }, atMs: { type: 'integer', minimum: 0, maximum: 12000 },
    kind: { type: 'string', enum: widgetKinds },
    x: { type: 'number', minimum: 0, maximum: 1200 }, y: { type: 'number', minimum: 0, maximum: 700 },
    w: { type: 'number', minimum: 220, maximum: 1200 }, h: { type: 'number', minimum: 140, maximum: 700 },
    title: { type: 'string', minLength: 1, maxLength: 80 },
    labels: { type: 'array', maxItems: 12, items: shortText },
    series: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['name', 'values'], properties: { name: shortText, values: { type: 'array', maxItems: 12, items: { type: 'number' } } } } },
    rows: { type: 'array', maxItems: 10, items: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 120 } } },
    unit: { type: 'string', maxLength: 12 },
  },
}
const beatPointSchema = {
  type: 'object', additionalProperties: false, required: ['x', 'y'],
  properties: { x: { type: 'number', minimum: 0, maximum: 1200 }, y: { type: 'number', minimum: 0, maximum: 700 } },
}

export const diagramPlanSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['actions'],
  properties: {
    actions: {
      type: 'array', minItems: 4, maxItems: 40,
      items: {
        anyOf: [
          {
            type: 'object', additionalProperties: false,
            required: ['_type', 'id', 'shape', 'text', 'color'],
            properties: {
              _type: { type: 'string', const: 'create' }, id: { type: 'string' }, shape: { type: 'string', enum: shapeKinds },
              text: { type: 'string', maxLength: 72 }, color: { type: 'string', enum: colors },
            },
          },
          {
            type: 'object', additionalProperties: false,
            required: ['_type', 'id', 'fromId', 'toId', 'label', 'color'],
            properties: {
              _type: { type: 'string', const: 'connect' }, id: { type: 'string' }, fromId: { type: 'string' }, toId: { type: 'string' },
              label: { type: 'string', maxLength: 40 }, color: { type: 'string', enum: colors },
            },
          },
          {
            type: 'object', additionalProperties: false,
            required: ['_type', 'id', 'atMs', 'points', 'color', 'size', 'closed'],
            properties: {
              _type: { type: 'string', const: 'stroke' }, id: { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,47}$' }, atMs: { type: 'integer', minimum: 0, maximum: 12000 },
              points: { type: 'array', minItems: 2, maxItems: 96, items: beatPointSchema }, color: { type: 'string', enum: colors }, size: { type: 'string', enum: strokeSizes }, closed: { type: 'boolean' },
            },
          },
          {
            type: 'object', additionalProperties: false,
            required: ['_type', 'id', 'atMs', 'x', 'y', 'text', 'color', 'size'],
            properties: {
              _type: { type: 'string', const: 'text' }, id: { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,47}$' }, atMs: { type: 'integer', minimum: 0, maximum: 12000 },
              x: { type: 'number', minimum: 0, maximum: 1200 }, y: { type: 'number', minimum: 0, maximum: 700 }, text: { type: 'string', minLength: 1, maxLength: 180 },
              color: { type: 'string', enum: colors }, size: { type: 'string', enum: textSizes },
            },
          },
        ],
      },
    },
  },
}

export const teachingBeatSchema = {
  type: 'object', additionalProperties: false,
  required: ['beatId', 'context', 'speech', 'pauseMs', 'waitForLearner', 'placement', 'anchorBeatId', 'actions'],
  properties: {
    beatId: { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,47}$' },
    context: { type: 'string', minLength: 1, maxLength: 300 },
    speech: { type: 'string', minLength: 1, maxLength: 600 },
    pauseMs: { type: 'integer', minimum: 0, maximum: 8000 },
    waitForLearner: { type: 'boolean' },
    placement: { type: 'string', enum: ['new-section', 'continue', 'revisit'] },
    anchorBeatId: { type: 'string', maxLength: 48 },
    actions: {
      type: 'array', minItems: 1, maxItems: 12,
      items: {
        anyOf: [
          {
            type: 'object', additionalProperties: false,
            required: ['_type', 'id', 'atMs', 'points', 'color', 'size', 'closed'],
            properties: {
              _type: { type: 'string', const: 'stroke' }, id: { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,47}$' }, atMs: { type: 'integer', minimum: 0, maximum: 12000 },
              points: { type: 'array', minItems: 2, maxItems: 96, items: beatPointSchema }, color: { type: 'string', enum: colors }, size: { type: 'string', enum: strokeSizes }, closed: { type: 'boolean' },
            },
          },
          {
            type: 'object', additionalProperties: false,
            required: ['_type', 'id', 'atMs', 'x', 'y', 'text', 'color', 'size'],
            properties: {
              _type: { type: 'string', const: 'text' }, id: { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,47}$' }, atMs: { type: 'integer', minimum: 0, maximum: 12000 },
              x: { type: 'number', minimum: 0, maximum: 1200 }, y: { type: 'number', minimum: 0, maximum: 700 }, text: { type: 'string', minLength: 1, maxLength: 180 },
              color: { type: 'string', enum: colors }, size: { type: 'string', enum: textSizes },
            },
          },
          {
            type: 'object', additionalProperties: false,
            required: ['_type', 'id', 'atMs', 'targetId'],
            properties: { _type: { type: 'string', const: 'remove' }, id: { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,47}$' }, atMs: { type: 'integer', minimum: 0, maximum: 12000 }, targetId: { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,47}$' } },
          },
          {
            type: 'object', additionalProperties: false,
            required: ['_type', 'id', 'atMs', 'targetId', 'dx', 'dy'],
            properties: { _type: { type: 'string', const: 'move' }, id: { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,47}$' }, atMs: { type: 'integer', minimum: 0, maximum: 12000 }, targetId: { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,47}$' }, dx: { type: 'number', minimum: -1200, maximum: 1200 }, dy: { type: 'number', minimum: -700, maximum: 700 } },
          },
          widgetActionSchema,
        ],
      },
    },
  },
}

function validId(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,31}$/i.test(value)
}

function validBeatId(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,47}$/.test(value)
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

export function validateDiagramPlan(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.actions)) {
    throw new Error('OpenAI returned an invalid diagram plan.')
  }
  if (value.actions.length < 4 || value.actions.length > 40) throw new Error('The diagram action count is outside the supported range.')

  const created = new Set()
  const actionIds = new Set()
  const connectionsSeen = new Set()
  let connections = 0
  let sawConnection = false
  let mode
  for (const action of value.actions) {
    if (!action || typeof action !== 'object' || !validId(action.id) || actionIds.has(action.id)) throw new Error('The diagram contains an invalid or duplicate action id.')
    actionIds.add(action.id)
    const actionMode = ['create', 'connect'].includes(action._type) ? 'nodes' : ['stroke', 'text'].includes(action._type) ? 'freehand' : null
    if (!actionMode) throw new Error(`Unsupported diagram action: ${String(action._type)}`)
    if (mode && mode !== actionMode) throw new Error('A diagram must use either freehand marks or connected shapes, not both.')
    mode = actionMode
    if (action._type === 'create') {
      if (sawConnection) throw new Error('Create all diagram shapes before connecting them.')
      if (!shapeKinds.includes(action.shape) || !colors.includes(action.color) || typeof action.text !== 'string' || !action.text.trim() || action.text.length > 72) {
        throw new Error('The diagram contains an invalid create action.')
      }
      if (created.size === 8) throw new Error('A diagram can contain at most eight shapes.')
      created.add(action.id)
    } else if (action._type === 'connect') {
      sawConnection = true
      if (!validId(action.fromId) || !validId(action.toId) || action.fromId === action.toId || typeof action.label !== 'string' || action.label.length > 40 || !colors.includes(action.color)) {
        throw new Error('The diagram contains an invalid connection action.')
      }
      if (!created.has(action.fromId) || !created.has(action.toId)) throw new Error('A diagram connection must follow both shapes it connects.')
      const connectionId = `${action.fromId}:${action.toId}`
      if (connectionsSeen.has(connectionId)) throw new Error('A diagram cannot repeat the same connection.')
      connectionsSeen.add(connectionId)
      connections += 1
      if (connections > 12) throw new Error('A diagram can contain at most twelve connections.')
    } else if (action._type === 'stroke') {
      if (!validBeatId(action.id) || !Number.isInteger(action.atMs) || action.atMs < 0 || action.atMs > 12000 ||
          !Array.isArray(action.points) || action.points.length < 2 || action.points.length > 96 || !colors.includes(action.color) || !strokeSizes.includes(action.size) || typeof action.closed !== 'boolean' ||
          action.points.some(point => !point || !finiteNumber(point.x) || !finiteNumber(point.y) || point.x < 0 || point.x > 1200 || point.y < 0 || point.y > 700)) {
        throw new Error('The diagram contains an invalid pen stroke.')
      }
    } else if (action._type === 'text') {
      if (!validBeatId(action.id) || !Number.isInteger(action.atMs) || action.atMs < 0 || action.atMs > 12000 ||
          !finiteNumber(action.x) || !finiteNumber(action.y) || action.x < 0 || action.x > 1200 || action.y < 0 || action.y > 700 || typeof action.text !== 'string' || !action.text.trim() || action.text.length > 180 ||
          !colors.includes(action.color) || !textSizes.includes(action.size)) throw new Error('The diagram contains invalid editable text.')
    } else {
      throw new Error(`Unsupported diagram action: ${String(action._type)}`)
    }
  }

  if (mode === 'nodes' && (created.size < 3 || connections < 1)) throw new Error('A diagram needs at least three shapes and one connection.')
  if (mode === 'freehand' && value.actions.filter(action => action._type === 'stroke').length < 2) {
    throw new Error('A freehand diagram needs at least two strokes.')
  }

  return value
}

const shortString = (value, max) => typeof value === 'string' && value.length <= max

/** Checks a widget's fixed data shape against what its kind reads:
 * table: labels = column headers, rows = cells; bar/line: labels = categories along x, series = 1-4 named value lists;
 * pie: labels = slices, series[0].values = sizes; stats: labels = figure names, series[0].values = figures, unit = suffix;
 * timeline: rows = [when, what] pairs in order. */
function validateWidget(action) {
  const fail = () => { throw new Error(`The teaching beat contains an invalid ${String(action.kind)} widget.`) }
  if (!widgetKinds.includes(action.kind) || !finiteNumber(action.x) || !finiteNumber(action.y) || !finiteNumber(action.w) || !finiteNumber(action.h) ||
      action.x < 0 || action.y < 0 || action.w < 220 || action.h < 140 || action.x + action.w > 1200 || action.y + action.h > 700 ||
      typeof action.title !== 'string' || !action.title.trim() || action.title.length > 80 || !shortString(action.unit, 12) ||
      !Array.isArray(action.labels) || action.labels.length > 12 || !action.labels.every(label => shortString(label, 60)) ||
      !Array.isArray(action.series) || action.series.length > 4 || !action.series.every(series => series && shortString(series.name, 60) && Array.isArray(series.values) && series.values.length <= 12 && series.values.every(finiteNumber)) ||
      !Array.isArray(action.rows) || action.rows.length > 10 || !action.rows.every(row => Array.isArray(row) && row.length <= 6 && row.every(cell => shortString(cell, 120)))) fail()
  const n = action.labels.length
  const matches = series => series.values.length === n
  if (action.kind === 'table' && (n < 1 || action.rows.length < 1 || action.rows.some(row => row.length !== n))) fail()
  if ((action.kind === 'bar' || action.kind === 'line') && (n < 2 || action.series.length < 1 || !action.series.every(matches))) fail()
  if (action.kind === 'pie' && (n < 2 || action.series.length !== 1 || !matches(action.series[0]) || action.series[0].values.some(v => v < 0) || action.series[0].values.every(v => v === 0))) fail()
  if (action.kind === 'stats' && (n < 1 || n > 6 || action.series.length !== 1 || !matches(action.series[0]))) fail()
  if (action.kind === 'timeline' && (action.rows.length < 2 || action.rows.some(row => row.length !== 2))) fail()
}

export function validateTeachingBeat(value) {
  if (!value || typeof value !== 'object' || !validBeatId(value.beatId) || typeof value.context !== 'string' || !value.context.trim() || value.context.length > 300 ||
      typeof value.speech !== 'string' || !value.speech.trim() || value.speech.length > 600 || !Number.isInteger(value.pauseMs) || value.pauseMs < 0 || value.pauseMs > 8000 ||
      typeof value.waitForLearner !== 'boolean' || !['new-section', 'continue', 'revisit'].includes(value.placement) || typeof value.anchorBeatId !== 'string' || value.anchorBeatId.length > 48 ||
      !Array.isArray(value.actions) || value.actions.length < 1 || value.actions.length > 12) {
    throw new Error('OpenAI returned an invalid teaching beat.')
  }

  const ids = new Set()
  for (const action of value.actions) {
    if (!action || typeof action !== 'object' || !validBeatId(action.id) || ids.has(action.id) || !Number.isInteger(action.atMs) || action.atMs < 0 || action.atMs > 12000) {
      throw new Error('The teaching beat contains an invalid or duplicate action id.')
    }
    ids.add(action.id)
    if (action._type === 'stroke') {
      if (!Array.isArray(action.points) || action.points.length < 2 || action.points.length > 96 || !colors.includes(action.color) || !strokeSizes.includes(action.size) || typeof action.closed !== 'boolean' ||
          action.points.some(point => !point || !finiteNumber(point.x) || !finiteNumber(point.y) || point.x < 0 || point.x > 1200 || point.y < 0 || point.y > 700)) {
        throw new Error('The teaching beat contains an invalid pen stroke.')
      }
    } else if (action._type === 'text') {
      if (!finiteNumber(action.x) || !finiteNumber(action.y) || action.x < 0 || action.x > 1200 || action.y < 0 || action.y > 700 || typeof action.text !== 'string' || !action.text.trim() || action.text.length > 180 ||
          !colors.includes(action.color) || !textSizes.includes(action.size)) throw new Error('The teaching beat contains invalid editable text.')
    } else if (action._type === 'remove') {
      if (!validBeatId(action.targetId)) throw new Error('The teaching beat contains an invalid revision target.')
    } else if (action._type === 'move') {
      if (!validBeatId(action.targetId) || !finiteNumber(action.dx) || Math.abs(action.dx) > 1200 || !finiteNumber(action.dy) || Math.abs(action.dy) > 700) throw new Error('The teaching beat contains an invalid move target or distance.')
    } else if (action._type === 'widget') {
      validateWidget(action)
    } else {
      throw new Error(`Unsupported teaching action: ${String(action._type)}`)
    }
  }
  return value
}
