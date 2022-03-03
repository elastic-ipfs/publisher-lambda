'use strict'

const { readFileSync } = require('fs')
const { join } = require('path')
const { load } = require('js-yaml')
const { build: buildHistogram } = require('hdr-histogram-js')
const { logger } = require('./logging')

const percentiles = [0.001, 0.01, 0.1, 1, 2.5, 10, 25, 50, 75, 90, 97.5, 99, 99.9, 99.99, 99.999]

class SumAggregator {
  constructor() {
    this.reset()
  }

  record(value) {
    this.value += value
  }

  reset() {
    this.value = 0
  }

  current() {
    const value = {
      value: this.value,
      timestamp: Date.now()
    }

    this.reset()

    return value
  }
}

class HistogramAggregator {
  constructor() {
    this.histogram = buildHistogram({
      lowestDiscernibleValue: 1,
      highestTrackableValue: 1e9,
      numberOfSignificantValueDigits: 5
    })
  }

  record(value) {
    this.histogram.recordValue(value)
  }

  reset() {
    this.histogram.reset()
  }

  current() {
    const { minNonZeroValue: min, maxValue: max, mean, stdDeviation: stdDev, totalCount: count } = this.histogram

    const value = {
      value:
        count > 0
          ? {
              count,
              min,
              max,
              mean,
              stdDev,
              stdError: stdDev / Math.sqrt(count),
              percentiles: percentiles.reduce((accu, percentile) => {
                accu[percentile] = this.histogram.getValueAtPercentile(percentile)
                return accu
              }, {})
            }
          : undefined,
      timestamp: Date.now()
    }

    this.reset()

    return value
  }
}

class Telemetry {
  constructor() {
    const { component, interval, metrics } = load(readFileSync(join(process.cwd(), 'metrics.yml'), 'utf-8'))

    // Setup
    this.component = component.replace('-lambda', `-${process.env.HANDLER}-lambda`)
    this.logger = logger
    this.interval = interval
    this.resetExportInterval()

    // Create metrics
    this.metrics = new Map()
    for (const [category, description] of Object.entries(metrics)) {
      this.createMetric(category, description, 'count')
      this.createMetric(category, description, 'durations')
    }
  }

  createMetric(category, description, metric) {
    const tag = `${category}-${metric}`
    const Aggregator = metric.endsWith('durations') ? HistogramAggregator : SumAggregator

    this.metrics.set(tag, new Aggregator())
  }

  ensureMetric(category, metric) {
    const metricObject = this.metrics.get(`${category}-${metric}`)

    if (!metricObject) {
      throw new Error(`Metric ${category} not found`)
    }

    return metricObject
  }

  export() {
    const metrics = {}

    for (const [name, metric] of this.metrics.entries()) {
      const value = metric.current().value

      if (typeof value !== 'undefined' && value !== 0) {
        metrics[name] = value
      }
    }

    this.logger.info({ ipfs_provider_component: this.component, metrics }, 'Dumping metrics ...')
  }

  increaseCount(category, amount = 1) {
    const metric = this.ensureMetric(category, 'count')
    metric.record(amount)
  }

  decreaseCount(category, amount = 1) {
    const metric = this.ensureMetric(category, 'count')
    metric.record(-1 * amount)
  }

  async trackDuration(category, promise) {
    const metric = this.ensureMetric(category, 'durations')
    const startTime = process.hrtime.bigint()

    try {
      return await promise
    } finally {
      metric.record(Number(process.hrtime.bigint() - startTime) / 1e6)
    }
  }

  flush() {
    this.resetExportInterval()
    this.export()
  }

  resetExportInterval() {
    clearInterval(this.intervalHandle)
    this.intervalHandle = setInterval(() => this.export(), this.interval).unref()
  }
}

module.exports = new Telemetry()
