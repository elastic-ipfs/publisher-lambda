'use strict'

const hyperid = require('hyperid')
const { resolve } = require('path')

/* c8 ignore next */
require('dotenv').config({ path: process.env.ENV_FILE_PATH || resolve(process.cwd(), '.env') })

const { parse } = require('peer-id')

const {
  BITSWAP_PEER_CID: bitswapPeerCid,
  HYDRA_ROOT_URL: hydraRootUrl,
  SQS_PUBLISHING_QUEUE_URL: publishingQueue
} = process.env

module.exports = {
  bitswapPeerId: parse(bitswapPeerCid).toB58String(),
  hydraRootUrl,
  publishingQueue: publishingQueue ?? 'publishingQueue',
  idGenerator: hyperid()
}
