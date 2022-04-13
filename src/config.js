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
  PEER_ID_DIRECTORY: peerIdJsonDirectory,
  PEER_ID_FILE: peerIdJsonFile,
  S3_BUCKET: s3Bucket,
  SQS_ADVERTISEMENTS_QUEUE_URL: advertisementsQueue
} = process.env

async function downloadPeerIdFile() {
  const file = peerIdJsonFile ?? 'peerId.json'
  logger.info(`Downloading PeerId from s3://${process.env.PEER_ID_S3_BUCKET}/${file}`)

  const contents = await fetchFromS3(process.env.PEER_ID_S3_BUCKET, file)
  return writeFile(module.exports.peerIdJsonPath, contents)
}

async function getPeerId() {
  if (process.env.PEER_ID_S3_BUCKET) {
    await downloadPeerIdFile()
  }

  try {
    const peerIdJson = JSON.parse(await readFile(module.exports.peerIdJsonPath, 'utf-8'))
    return await PeerId.createFromJSON(peerIdJson)
  } catch (e) {
    return PeerId.create()
  }
}

module.exports = {
  advertisementsQueue: advertisementsQueue ?? 'advertisementsQueue',
  awsRegion,
  bitswapPeerMultiaddr,
  getPeerId,
  indexerNodeUrl,
  metadata: Buffer.from(require('varint').encode(0x900)).toString('base64'),
  peerIdJsonPath: join(peerIdJsonDirectory ?? '/tmp', peerIdJsonFile ?? 'peerId.json'),
  s3Bucket: s3Bucket ?? 'advertisements'
}
