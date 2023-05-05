'use strict'

const { encode: encodeDAG, code: dagCode } = require('@ipld/dag-json')
const { encode: encodeCBOR, Token, Type } = require('cborg')
const { BufferList } = require('bl')
const Envelope = require('libp2p/src/record/envelope')
const p2pCrypto = require('libp2p-crypto')
const { sha256 } = require('multiformats/hashes/sha2')
const { CID } = require('multiformats/cid')
const { Multiaddr } = require('multiaddr')
const { request } = require('undici')

const { awsRegion, getBitswapPeerId, getHttpPeerId, s3Bucket, bitswapPeerMultiaddr, httpPeerMultiaddr, indexerNodeUrl } = require('../config')
const { logger, serializeError } = require('../logging')
const { uploadToS3 } = require('../storage')
const telemetry = require('../telemetry')
const varint = require('varint')

// see: https://github.com/ipni/specs/blob/main/IPNI.md#metadata
const BITSWAP_METADATA = Buffer.from(varint.encode(0x900))
const HTTP_METADATA = Buffer.from(varint.encode(0x3D0000))

/**
 * see: https://github.com/ipni/specs/blob/main/IPNI.md#extendedprovider
 * @typedef {object} Provider
 * @prop {string} ID - peerID as string
 * @prop {string[]} Addresses - multiaddrs for peer e.g /dns4/freeway.dag.house/tcp/443/https
 * @prop {Buffer} Metadata - prefixed with varint for http or bitswap
 * @prop {Buffer} [Signature] - signature per
 */

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
 * Create array of signed Providers
 * @param {Provider[]} providers
 * @param {object} previous
 * @param {PeerId} peerId - advertisment peerId
 * @param {CID} cid - entries CID
 * @param {Buffer} contextId - derived from cid
 */
async function signProviders (providers, previous, peerId, cid, contextId) {
  const signed = []
  for (const provider of providers) {
    const Signature = await providerSignature(previous, peerId, cid, contextId, provider)
    signed.push({
      ...provider,
      Signature
    })
  }
  return signed
}

/**
 * Calculate the signature for an Extended Provider
 * see: https://github.com/ipni/go-libipni/blob/afe2d8ea45b86c2a22f756ee521741c8f99675e5/ingest/schema/envelope.go#L125
 * @param {object} previous
 * @param {PeerId} peerId - advertisment peerId
 * @param {CID} cid - entries CID
 * @param {Buffer} contextId - derived from cid
 * @param {Provider} provider - provider to sign
 * @param {boolean} extendedProviderOverride
 */
async function providerSignature (previous, peerId, cid, contextId, provider, extendedProviderOverride = false) {
  const sigBuf = Buffer.concat([
    previous ? Buffer.from(CID.parse(previous['/']).bytes) : Buffer.alloc(0),
    Buffer.from(cid.bytes),
    Buffer.from(peerId.toString(), 'utf-8'),
    contextId,
    Buffer.from(provider.ID, 'utf-8'),
    ...provider.Addresses.map(a => Buffer.from(a, 'utf-8')),
    provider.Metadata,
    extendedProviderOverride ? Buffer.from([1]) : Buffer.from([0])
  ])

  const digest = await sha256.digest(sigBuf)
  const payload = digest.bytes

  const sealed = await Envelope.seal(
    {
      domain: Buffer.from('indexer', 'utf-8'),
      codec: Buffer.from('/indexer/ingest/adSignature', 'utf-8'),
      marshal: () => payload
    },
    peerId
  )

  return sealed.marshal()
}

/**
 * Calculate the signature for an Extended Provider
 * see: https://github.com/ipni/go-libipni/blob/afe2d8ea45b86c2a22f756ee521741c8f99675e5/ingest/schema/envelope.go#L125
 * @param {object} previous
 * @param {PeerId} peerId - advertisment peerId
 * @param {CID} cid - entries CID
 * @param {string[]} addresses - multiaddrs
 * @param {Buffer} metadata - prefixed with varint for http or bitswap
 */
async function computeAdvertisementSignature(previous, peerId, cid, addresses, metadata) {
  const payload = (
    await sha256.digest(
      Buffer.concat([
        previous ? Buffer.from(CID.parse(previous['/']).bytes) : Buffer.alloc(0),
        Buffer.from(cid.bytes),
        Buffer.from(peerId.toString(), 'utf-8'),
        ...addresses.map(a => Buffer.from(a, 'utf-8')),
        metadata,
        Buffer.alloc(1) // Boolean(IsRm)
      ])
    )
  ).bytes

  const sealed = await Envelope.seal(
    {
      domain: Buffer.from('indexer', 'utf-8'),
      codec: Buffer.from('/indexer/ingest/adSignature', 'utf-8'),
      marshal: () => payload
    },
    peerId
  )

  return sealed.marshal()
}

async function updateHead(advertisementCid, peerId) {
  return uploadToS3(
    s3Bucket,
    'head',
    JSON.stringify({
      head: {
        '/': advertisementCid.toString()
      },
      pubkey: {
        '/': { bytes: p2pCrypto.keys.marshalPublicKey(peerId.pubKey).toString('base64') }
      },
      sig: {
        '/': { bytes: (await peerId.privKey.sign(advertisementCid.bytes)).toString('base64') }
      }
    })
  )
}

async function notifyIndexer(cid, peerId) {
  try {
    telemetry.increaseCount('http-indexer-announcements')

    const indexerURL = `${indexerNodeUrl}/ingest/announce`
    logger.info(`notifyIndexer at ${indexerURL}`)

    const { statusCode, headers, body: rawBody } = await telemetry.trackDuration(
      'http-indexer-announcements',
      request(indexerURL, {
        method: 'PUT',
        headers: {
          'content-type': 'application/cbor; charset=utf-8'
        },
        body: encodeCBOR(
          [
            cid,
            [
              new Multiaddr(`/dns4/${s3Bucket}.s3.${awsRegion}.amazonaws.com/tcp/443/https/p2p/${peerId.toString()}`)
                .bytes
            ],
            Buffer.alloc(0)
          ],
          {
            typeEncoders: {
              Object: function (cid) {
                // CID must be prepended with 0 for historical reason - See: https://github.com/ipld/cid-cbor
                const bytes = new BufferList(Buffer.alloc(1))
                bytes.append(cid.bytes)

                return [new Token(Type.tag, 42), new Token(Type.bytes, bytes.slice())]
              }
            }
          }
        )
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

async function main(event) {
  try {
    const bsPeerId = await getBitswapPeerId()
    const httpPeerId = await getHttpPeerId()

    /** @type {Provider} */
    const httpProvider = {
      ID: bsPeerId.toString(),
      Addresses: [httpPeerMultiaddr],
      Metadata: HTTP_METADATA
    }

    /** @type {Provider} */
    const bitswapProvider = {
      ID: httpPeerId.toString(),
      Addresses: [bitswapPeerMultiaddr],
      Metadata: BITSWAP_METADATA
    }

    // Track the latest read cid and advertisementCid
    let cid
    let advertisementCid

    for (const record of event.Records) {
      const cidString = record.body
      const contextId = Buffer.from(cidString)
      cid = CID.parse(cidString)

      const previous = advertisementCid ? { '/': advertisementCid.toString() } : await fetchHeadCid()

      // Create the advertisement
      const rawAdvertisement = {
        Provider: bsPeerId.toString(),
        Addresses: bitswapProvider.Addresses,
        Entries: { '/': cidString },
        ContextID: contextId,
        Metadata: BITSWAP_METADATA,
        IsRm: false,
        ExtendedProvider: {
          Providers: await signProviders([bitswapProvider, httpProvider], previous, bsPeerId, cid, contextId)
        },
        Signature: await computeAdvertisementSignature(previous, bsPeerId, cid, bitswapProvider.Addresses, BITSWAP_METADATA)
      }

      if (previous) {
        rawAdvertisement.PreviousID = previous
      }

      const advertisement = await encodeDAG(rawAdvertisement)
      advertisementCid = CID.create(1, dagCode, await sha256.digest(advertisement))

      // Upload the file to S3
      await uploadToS3(s3Bucket, advertisementCid.toString(), advertisement)
      telemetry.flush()
    }

    // Update the head
    await updateHead(advertisementCid, bsPeerId)

    // Notify the indexer-node
    await notifyIndexer(advertisementCid, bsPeerId)

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
