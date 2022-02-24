'use strict'

const { readFileSync } = require('fs')
const { join } = require('path')
const { load } = require('js-yaml')
const { MeterProvider, UngroupedProcessor } = require('@opentelemetry/sdk-metrics-base')
const { hrTime } = require('@opentelemetry/core')

const { logger } = require('./logging')

class Aggregator {
  constructor(sum = true) {
    this.sum = sum

    this.reset([0, 0])
  }

  update(value) {
    this.lastUpdate = hrTime()

    if (this.sum) {
      this.value += value
    } else {
      this.value.push(value)
    }
  }

  reset(time) {
    this.value = this.sum ? 0 : []
    this.lastUpdate = time || hrTime()
  }

  toPoint() {
    const point = {
      value: this.value,
      timestamp: this.lastUpdate
    }

    this.reset()

    return point
  }
}

class Processor extends UngroupedProcessor {
  aggregatorFor(metricDescriptor) {
    return new Aggregator(!metricDescriptor.name.endsWith('-durations'))
  }
}

class Telemetry {
  constructor() {
    const { component, interval, metrics } = load(readFileSync(join(process.cwd(), 'metrics.yml'), 'utf-8'))

    this.component = component
    this.logger = logger
    this.meter = new MeterProvider({ exporter: this, interval, processor: new Processor() }).getMeter(component)
    this.metrics = {}
    for (const [category, description] of Object.entries(metrics)) {
      this.createMetric(category, description, 'count')
      this.createMetric(category, description, 'durations')
    }
  }

  increaseCount(category, amount = 1) {
    const metric = this.ensureMetric(category, 'count')
    metric.add(amount)
  }

  decreaseCount(category, amount = 1) {
    const metric = this.ensureMetric(category, 'count')
    metric.add(-1 * amount)
  }

  async trackDuration(category, promise) {
    const metric = this.ensureMetric(category, 'durations')
    const startTime = process.hrtime.bigint()

    try {
      return await promise
    } finally {
      metric.add(Number(process.hrtime.bigint() - startTime) / 1e6)
    }
  }

  async flush() {
    await this.meter.collect()
    this.export(this.meter.getProcessor().checkPointSet())
  }

  createMetric(category, description, metric, creator = 'createCounter') {
    const tag = `${category}-${metric}`
    this.metrics[tag] = this.meter[creator](tag, { description: `${description} (${metric})` })
  }

  ensureMetric(category, metric) {
    const metricObject = this.metrics[`${category}-${metric}`]

    if (!metricObject) {
      throw new Error(`Metric ${category} not found`)
    }

    return metricObject
  }

  // Implements https://github.com/open-telemetry/opentelemetry-js/blob/v0.26.0/experimental/packages/opentelemetry-sdk-metrics-base/src/export/types.ts#L100
  export(records, done) {
    this.logger.info(
      {
        ipfs_provider_component: this.component,
        metrics: Object.fromEntries(records.map(r => [r.descriptor.name, r.aggregator.toPoint().value]))
      },
      'Dumping metrics ...'
    )

    if (done) {
      done('SUCCESS')
    }
  }

  // Implements https://github.com/open-telemetry/opentelemetry-js/blob/v0.26.0/experimental/packages/opentelemetry-sdk-metrics-base/src/export/types.ts#L100
  async shutdown() {
    // No-op
  }
}

module.exports = new Telemetry()
