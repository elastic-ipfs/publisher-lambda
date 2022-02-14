'use strict'

process.env.PEER_ID_S3_BUCKET = 'idBucket'

const { GetObjectCommand } = require('@aws-sdk/client-s3')
const { readFile } = require('fs/promises')
const { resolve } = require('path')
const { createFromJSON } = require('peer-id')
const { Readable } = require('stream')
const t = require('tap')
const { getPeerId } = require('../src/config')
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
