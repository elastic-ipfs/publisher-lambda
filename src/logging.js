'use strict'

const pino = require('pino')
let destination
let level = 'info'

try {
  if (process.env.NODE_ENV !== 'production') {
    destination = require('pino-pretty')()
  }
  /* c8 ignore next 3 */
} catch (e) {
  // No-op
}

if (process.env.LOG_LEVEL) {
  level = process.env.LOG_LEVEL
  /* c8 ignore next */
} else if ((process.env.NODE_DEBUG ?? '').includes('aws-ipfs')) {
  level = 'debug'
}

const durationUnits = {
  milliseconds: 1e6,
  seconds: 1e9
}

const logger = pino(
  {
    level,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime
  },
  destination
)

function elapsed(startTime, precision = 3, unit = 'milliseconds') {
  const dividend = durationUnits[unit] ?? durationUnits.milliseconds
  return (Number(process.hrtime.bigint() - startTime) / dividend).toFixed(precision)
}

function serializeError(e) {
  return `[${e.code || e.constructor.name}] ${e.message}`
}

module.exports = {
  logger,
  elapsed,
  serializeError
}
