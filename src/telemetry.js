'use strict'

const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus')
const { MeterProvider } = require('@opentelemetry/sdk-metrics-base')

const exporter = new PrometheusExporter({ preventServerStart: true })
const meters = {}
const metrics = {}

// Create all the metrics
meters.s3Meter = new MeterProvider({ exporter, interval: 100 }).getMeter('s3')
metrics.s3Fetchs = meters.s3Meter.createCounter('s3-fetchs', { description: 'Fetchs on S3' })
metrics.s3FetchsDurations = meters.s3Meter.createCounter('s3-fetchs-durations', {
  description: 'Fetchs durations on S3'
})
metrics.s3Uploads = meters.s3Meter.createCounter('s3-uploads', { description: 'Uploads on S3' })
metrics.s3UploadsDurations = meters.s3Meter.createCounter('s3-uploads-durations', {
  description: 'Uploads durations on S3'
})

meters.sqsMeter = new MeterProvider({ exporter, interval: 100 }).getMeter('sqs')
metrics.sqsPublishes = meters.sqsMeter.createCounter('sqs-publishes', { description: 'Publishes on SQS' })
metrics.sqsPublishesDurations = meters.sqsMeter.createCounter('sqs-publishes-durations', {
  description: 'Publishes durations on SQS'
})

meters.httpMeter = new MeterProvider({ exporter, interval: 100 }).getMeter('http')
metrics.httpFetchHeadCid = meters.httpMeter.createCounter('http-fetchs-head-id', { description: 'Fetchs of head CID' })
metrics.httpFetchHeadCidDurations = meters.httpMeter.createCounter('http-fetch-head-id-durations', {
  description: 'Fetchs duration of head CID'
})
metrics.indexerNotification = meters.httpMeter.createCounter('http-indexer-notifications', {
  description: 'Notifications of a new head to the Indexer'
})
metrics.indexerNotificationDurations = meters.httpMeter.createCounter('http-indexer-notifications-durations', {
  description: 'Notifications durations of a new head to the Indexer'
})

async function trackDuration(metric, promise) {
  const startTime = process.hrtime.bigint()

  try {
    return await promise
  } finally {
    metric.add(Number(process.hrtime.bigint() - startTime) / 1e6)
  }
}

function storeMetrics() {
  /* c8 ignore next 3 */
  if (!exporter._batcher.hasMetric) {
    return
  }

  return exporter._serializer.serialize(exporter._batcher.checkPointSet())
}

module.exports = {
  meters,
  metrics,
  storeMetrics,
  trackDuration
}
