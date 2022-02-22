'use strict'

const { encode: encodeDAG, code: dagCode } = require('@ipld/dag-json')
const { base58btc: base58 } = require('multiformats/bases/base58')
const { sha256 } = require('multiformats/hashes/sha2')
const { CID } = require('multiformats/cid')
const { setTimeout } = require('timers/promises')

const { advertisementsQueue, s3Bucket } = require('../config')
const { logger, elapsed, serializeError } = require('../logging')
const { uploadToS3, publishToSQS } = require('../storage')
const { storeMetrics } = require('../telemetry')

async function main(event) {
  try {
    const start = process.hrtime.bigint()

    // Create the file content
    const content = Buffer.from(
      encodeDAG({
        Entries: event.Records.map(r => ({ '/': { bytes: Buffer.from(base58.decode(r.body)).toString('base64') } }))
      })
    )

    // Compute the CID of the content
    const cid = await CID.create(1, dagCode, await sha256.digest(content))

    // Upload the file to S3
    await uploadToS3(s3Bucket, cid.toString(), content)

    // Put the CID in the secondary queue
    await publishToSQS(advertisementsQueue, cid.toString())

    // Show event progress
    logger.info(
      { elapsed: elapsed(start), records: event.Records.length },
      `Published ${event.Records.length} records.`
    )

    // Return a empty object to signal we have consumed all the messages
    return {}
    /* c8 ignore next 5 */
  } catch (e) {
    logger.error(`Cannot publish a content: ${serializeError(e)}`)

    throw e
  } finally {
    // Wait a little more to let all metrics being collected
    await setTimeout(200)

    // Output metrics
    logger.info({ metrics: storeMetrics() }, 'Operation has completed.')
  }
}

exports.handler = main
