'use strict'

const dagJson = require('@ipld/dag-json')
const dagCbor = require('@ipld/dag-cbor')
const { BufferList } = require('bl')
const p2pCrypto = require('libp2p-crypto')
const { sha256 } = require('multiformats/hashes/sha2')
const { CID } = require('multiformats/cid')
const Block = require('multiformats/block')
const { multiaddr } = require('multiaddr')
const { request } = require('undici')

const { awsRegion, getBitswapPeerId, getHttpPeerId, s3Bucket, bitswapPeerMultiaddr, httpPeerMultiaddr, indexerNodeUrl } = require('../config')
const { logger, serializeError } = require('../logging')
const { uploadToS3 } = require('../storage')
const telemetry = require('../telemetry')

// see: https://github.com/elastic-ipfs/publisher-lambda/pull/27
const SPECIAL_MESSAGE_ANNOUNCE_HTTP_PROVIDER = 'AnnounceHTTP'

async function fetchHeadCid() {
  try {
    telemetry.increaseCount('http-head-cid-fetchs')

    const { statusCode, headers, body: rawBody } = await telemetry.trackDuration(
      'http-head-cid-fetchs',
      request(`https://${s3Bucket}.s3.${awsRegion}.amazonaws.com/head`)
    )

    const buffer = new BufferList()

    for await (const chunk of rawBody) {
      buffer.append(chunk)
    }

    let body = buffer.slice().toString('utf-8')
    if ((headers['content-type'] || '').startsWith('application/json')) {
      body = JSON.parse(body)
    }

    // Some error occurred, return with an error
    if (statusCode === 200) {
      return body.head
      // S3 can also give 403 when the file does not exist
    } else if (statusCode !== 403 && statusCode !== 404) {
      logger.error({ body, statusCode }, `Downloading previous head failed with status code ${statusCode}.`)

      const error = new Error(`Downloading previous head failed with status code ${statusCode} and body: ${body}.`)
      error.handled = true
      throw error
    }

    return undefined
  } catch (e) {
    if (!e.handled) {
      logger.error(`Downloading previous head failed: ${serializeError(e)}`)
    }

    throw e
  }
}

/**
 * @param {CID} head
 * @param {import('@web3-storage/ipni/dist/advertisement').PeerId} peerId
 */
async function updateHead(head, peerId) {
  const pubkey = peerId.publicKey
  const key = await p2pCrypto.keys.unmarshalPrivateKey(peerId.privateKey)
  const sig = await key.sign(head.bytes)
  const bytes = dagJson.encode({ head, pubkey, sig })
  return uploadToS3(s3Bucket, 'head', bytes)
}

/**
 * @param {CID} cid
 * @param {import('@web3-storage/ipni/dist/advertisement').PeerId} peerId
 */
async function notifyIndexer(cid, peerId) {
  try {
    telemetry.increaseCount('http-indexer-announcements')

    const indexerURL = `${indexerNodeUrl}/ingest/announce`
    logger.info(`notifyIndexer at ${indexerURL}`)

    const addr = multiaddr(`/dns4/${s3Bucket}.s3.${awsRegion}.amazonaws.com/tcp/443/https/p2p/${peerId.toString()}`)

    // the request is a cbor encoded array. The extra data field must be sent even if empty
    // see: https://github.com/ipni/go-libipni/blob/b6e9a9def00b2db19aa4a3bc5fc33b3b1575530e/announce/message/message.go#L14-L29
    // see: https://github.com/ipni/go-libipni/blob/b6e9a9def00b2db19aa4a3bc5fc33b3b1575530e/announce/message/cbor_message.go#L111-L113
    const addrs = [addr.bytes]
    const extraData = new Uint8Array()
    const requestBody = dagCbor.encode([cid, addrs, extraData])

    const { statusCode, headers, body: rawBody } = await telemetry.trackDuration(
      'http-indexer-announcements',
      request(indexerURL, {
        method: 'PUT',
        headers: {
          'content-type': 'application/cbor; charset=utf-8'
        },
        body: requestBody
      })
    )

    // Some error occurred, return with an error
    if (statusCode !== 204) {
      const buffer = new BufferList()

      for await (const chunk of rawBody) {
        buffer.append(chunk)
      }

      const body = buffer.slice().toString('utf-8')

      logger.error(
        { body: (headers['content-type'] || '').startsWith('application/json') ? JSON.parse(body) : body, statusCode },
        `Announcing to the indexer node failed with status code ${statusCode}.`
      )

      const error = new Error(`Announcing to the indexer node failed with status code ${statusCode} and body: ${body}.`)
      error.handled = true
      throw error
    }
  } catch (e) {
    logger.error(`Announcing to the indexer node failed: ${serializeError(e)}`)
    if (e.handled) {
      return
    }
    throw e
  }
}

let bitsPeerId

async function main(event) {
  try {
    const { Advertisement, Provider, createExtendedProviderAd } = await import('@web3-storage/ipni') // sry

    let headCid = await fetchHeadCid() ?? null

    const bits = new Provider({
      protocol: 'bitswap',
      addresses: [bitswapPeerMultiaddr],
      peerId: bitsPeerId ?? await getBitswapPeerId()
    })

    for (const record of event.Records) {
      let ad

      if (record.body === SPECIAL_MESSAGE_ANNOUNCE_HTTP_PROVIDER) {
        const http = new Provider({
          protocol: 'http',
          addresses: [httpPeerMultiaddr],
          peerId: await getHttpPeerId()
        })
        ad = createExtendedProviderAd({
          previous: headCid,
          providers: [bits, http]
        })
      } else {
        const entries = CID.parse(record.body)
        const context = Buffer.from(entries.toString())
        ad = new Advertisement({
          previous: headCid,
          providers: [bits],
          context,
          entries
        })
      }

      const value = await ad.encodeAndSign()
      const block = await Block.encode({ value, codec: dagJson, hasher: sha256 })

      // Upload the file to S3
      await uploadToS3(s3Bucket, block.cid.toString(), block.bytes)
      headCid = block.cid

      telemetry.flush()
    }

    // Update the head
    await updateHead(headCid, bits.peerId)

    // Notify the indexer-node
    await notifyIndexer(headCid, bits.peerId)

    // Return a empty object to signal we have consumed all the messages
    return {}
  } catch (e) {
    logger.error(`Cannot publish an advertisement: ${serializeError(e)}`)

    throw e
    /* c8 ignore next */
  } finally {
    telemetry.flush()
  }
}

exports.handler = main
