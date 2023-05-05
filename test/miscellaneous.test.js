'use strict'

process.env.PEER_ID_S3_BUCKET = 'idBucket'

const { GetObjectCommand } = require('@aws-sdk/client-s3')
const { createFromJSON } = require('peer-id')
const { Readable } = require('stream')
const t = require('tap')
const { getBitswapPeerId } = require('../src/config')
const { logger } = require('../src/logging')
const telemetry = require('../src/telemetry')
const { s3Mock } = require('./utils/mock')
const bsPeer = require('./fixtures/peerId.json')

t.test('config - download the peerId from S3', async t => {
  t.plan(3)

  s3Mock.on(GetObjectCommand).callsFake(async params => {
    t.equal(params.Bucket, 'idBucket')
    t.equal(params.Key, 'peerId.json')

    return { Body: Readable.from(JSON.stringify(bsPeer)) }
  })

  const expected = await createFromJSON(bsPeer)
  const actual = await getBitswapPeerId()
  t.equal(expected.toB58String(), actual.toB58String())
})

t.test('config - fails if PeerId not set', async t => {
  t.plan(3)

  s3Mock.on(GetObjectCommand).callsFake(async params => {
    t.equal(params.Bucket, 'idBucket')
    t.equal(params.Key, 'peerId.json')

    return { Body: Readable.from('INVALID', 'utf-8') }
  })
  try {
    await getBitswapPeerId()
    t.fail('should throw')
  } catch (e) {
    t.pass('did throw')
  }
})

t.test('telemetry', async t => {
  t.plan(3)

  // Reset other metrics
  telemetry.logger = {
    info(arg) {}
  }
  telemetry.flush()

  // Prepare metrics
  telemetry.createMetric('custom', 'Custom', 'count')
  telemetry.createMetric('active', 'Active', 'count')

  telemetry.logger = {
    info(arg) {
      t.strictSame(arg, {
        ipfs_provider_component: 'publisher-content-lambda',
        metrics: { 'custom-count': 1, 'active-count': -1 }
      })
    }
  }

  telemetry.increaseCount('custom')
  telemetry.increaseCount('custom')
  telemetry.decreaseCount('custom')
  telemetry.decreaseCount('active')
  telemetry.flush()

  // Set the logger to check the refresh
  telemetry.logger = {
    info(arg) {
      t.strictSame(arg, {
        ipfs_provider_component: 'publisher-content-lambda',
        metrics: { 'active-count': 0 }
      })
    }
  }

  telemetry.flush()

  // Now check other methods
  t.throws(() => telemetry.decreaseCount('unknown'), 'Metrics unknown not found.')

  // Reset the logger
  telemetry.logger = logger
})
