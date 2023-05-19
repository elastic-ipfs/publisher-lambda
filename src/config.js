'use strict'

const { resolve } = require('path')

/* c8 ignore next */
require('dotenv').config({ path: process.env.ENV_FILE_PATH || resolve(process.cwd(), '.env') })

const { logger } = require('./logging')
const { fetchFromS3 } = require('./storage')

const {
  AWS_REGION: awsRegion,
  BITSWAP_PEER_MULTIADDR: bitswapPeerMultiaddr,
  HTTP_PEER_MULTIADDR: httpPeerMultiaddr,
  INDEXER_NODE_URL: indexerNodeUrl,
  PEER_ID_S3_BUCKET: peerIdBucket,
  S3_BUCKET: s3Bucket,
  SQS_ADVERTISEMENTS_QUEUE_URL: advertisementsQueue
} = process.env

async function fetchPeerId (file) {
  const { createFromJSON } = await import('@libp2p/peer-id-factory')
  if (!peerIdBucket) {
    throw new Error('PEER_ID_S3_BUCKET must be set in ENV')
  }
  logger.info(`Downloading PeerId from s3://${peerIdBucket}/${file}`)
  const contents = await fetchFromS3(peerIdBucket, file)
  const json = JSON.parse(contents)
  return await createFromJSON(json)
}

async function getHttpPeerId () {
  return fetchPeerId('peerId-http.json')
}

async function getBitswapPeerId () {
  return fetchPeerId('peerId.json')
}

module.exports = {
  advertisementsQueue: advertisementsQueue ?? 'advertisementsQueue',
  awsRegion,
  bitswapPeerMultiaddr,
  httpPeerMultiaddr,
  getBitswapPeerId,
  getHttpPeerId,
  indexerNodeUrl,
  peerIdBucket,
  s3Bucket: s3Bucket ?? 'advertisements'
}
