'use strict'

const { readFile, writeFile } = require('fs/promises')
const { join, resolve } = require('path')
const PeerId = require('peer-id')

/* c8 ignore next */
require('dotenv').config({ path: process.env.ENV_FILE_PATH || resolve(process.cwd(), '.env') })

const { logger } = require('./logging')
const { fetchFromS3 } = require('./storage')

const {
  AWS_REGION: awsRegion,
  BITSWAP_PEER_MULTIADDR: bitswapPeerMultiaddr,
  INDEXER_NODE_URL: indexerNodeUrl,
  PEER_ID_FILE: peerIdJsonPath,
  S3_BUCKET: s3Bucket,
  SQS_ADVERTISEMENTS_QUEUE_URL: advertisementsQueue
} = process.env

async function downloadPeerIdFile() {
  logger.info(`Downloading PeerId from s3://${process.env.PEER_ID_S3_BUCKET}/${process.env.PEER_ID_FILE}`)

  const contents = await fetchFromS3(process.env.PEER_ID_S3_BUCKET, process.env.PEER_ID_FILE)
  return writeFile(join('/tmp', process.env.PEER_ID_FILE), contents)
}

async function getPeerId() {
  if (process.env.PEER_ID_S3_BUCKET) {
    await downloadPeerIdFile()
  }

  try {
    const peerIdJson = JSON.parse(await readFile(join('/tmp', peerIdJsonPath), 'utf-8'))
    return await PeerId.createFromJSON(peerIdJson)
  } catch (e) {
    return PeerId.create()
  }
}

module.exports = {
  awsRegion,
  bitswapPeerMultiaddr,
  advertisementsQueue: advertisementsQueue ?? 'advertisementsQueue',
  getPeerId,
  indexerNodeUrl,
  // To regenerate: Buffer.from(require('varint').encode(0x300000)).toString('base64')
  metadata: Buffer.from('gIDAAQ==', 'base64'),
  s3Bucket: s3Bucket ?? 'ads'
}
