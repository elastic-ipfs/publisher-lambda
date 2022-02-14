'use strict'

const { encode: encodeDAG, code: dagCode } = require('@ipld/dag-json')
const { base58btc: base58 } = require('multiformats/bases/base58')
const { sha256 } = require('multiformats/hashes/sha2')
const { CID } = require('multiformats/cid')

const { advertisementsQueue, s3Bucket } = require('../config')
const { logger, elapsed } = require('../logging')
const { uploadToS3, publishToSQS } = require('../storage')

async function main(event) {
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
  logger.info({ elapsed: elapsed(start), records: event.Records.length }, `Published ${event.Records.length} records.`)

  // Return a empty object to signal we have consumed all the messages
  return {}
}

exports.handler = main
