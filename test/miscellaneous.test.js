'use strict'

process.env.PEER_ID_S3_BUCKET = 'idBucket'

const { GetObjectCommand } = require('@aws-sdk/client-s3')
const { readFile } = require('fs/promises')
const { resolve } = require('path')
const { createFromJSON } = require('peer-id')
const { Readable } = require('stream')
const t = require('tap')
const { getPeerId } = require('../src/config')
const { logger } = require('../src/logging')
const telemetry = require('../src/telemetry')
const { s3Mock } = require('./utils/mock')

t.test('config - download the peerId from S3', async t => {
  t.plan(3)

  const rawPeer = await readFile(resolve(process.cwd(), 'test/fixtures/peerId.json'))

  s3Mock.on(GetObjectCommand).callsFake(async params => {
    t.equal(params.Bucket, 'idBucket')
    t.equal(params.Key, 'peerId.json')

    return { Body: Readable.from(rawPeer) }
  })

  t.equal((await getPeerId()).toB58String(), (await createFromJSON(JSON.parse(rawPeer))).toB58String())
})

t.test('config - creates a new PeerId if download fails', async t => {
  t.plan(3)

  const rawPeer = await readFile(resolve(process.cwd(), 'test/fixtures/peerId.json'))

  s3Mock.on(GetObjectCommand).callsFake(async params => {
    t.equal(params.Bucket, 'idBucket')
    t.equal(params.Key, 'peerId.json')

    return { Body: Readable.from('INVALID', 'utf-8') }
  })

  t.not((await getPeerId()).toB58String(), (await createFromJSON(JSON.parse(rawPeer))).toB58String())
})

t.test('telemetry - correctly implements interfaces', async t => {
  t.plan(5)

  // Reset other metrics
  telemetry.logger = {
    info(arg) {}
  }
  await telemetry.flush()

  telemetry.createMetric('custom', 'Custom', 'count', 'createUpDownCounter')

  // Set the logger to check the tracking
  telemetry.logger = {
    info(arg) {
      t.strictSame(arg, {
        ipfs_provider_component: 'publisher-lambda',
        metrics: { 's3-fetchs-count': 0, 's3-fetchs-durations': [], 'custom-count': 1 }
      })
    }
  }

  telemetry.increaseCount('custom')
  telemetry.increaseCount('custom')
  telemetry.decreaseCount('custom')
  await telemetry.flush()

  // Set the logger to check the refresh
  telemetry.logger = {
    info(arg) {
      t.strictSame(arg, {
        ipfs_provider_component: 'publisher-lambda',
        metrics: { 's3-fetchs-count': 0, 's3-fetchs-durations': [], 'custom-count': 0 }
      })
    }
  }

  await telemetry.flush()

  // Now check other methods
  telemetry.logger = {
    info(arg) {}
  }

  t.throws(() => telemetry.decreaseCount('unknown'), 'Metrics unknown not found.')
  await t.resolves(() => telemetry.shutdown())

  telemetry.export([], argument => {
    t.equal(argument, 'SUCCESS')
  })

  // Reset the logger
  telemetry.logger = logger
})
