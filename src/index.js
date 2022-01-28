'use strict'

const { SQSClient, DeleteMessageBatchCommand } = require('@aws-sdk/client-sqs')
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler')
const { BufferList } = require('bl')
const { Agent } = require('https')
const { base58btc: base58 } = require('multiformats/bases/base58')
const { CID } = require('multiformats/cid')
const { decode: digestDecode } = require('multiformats/hashes/digest')
const { request } = require('undici')

const { bitswapPeerId, hydraRootUrl, publishingQueue, idGenerator } = require('./config')
const { logger, elapsed } = require('./logging')

const agent = new Agent({ keepAlive: true, keepAliveMsecs: 60000 })
const sqsClient = new SQSClient({
  requestHandler: new NodeHttpHandler({ httpsAgent: agent })
})

async function main(event) {
  const start = process.hrtime.bigint()

  const providerRecords = []
  const receiptsToDelete = []

  for (const { body: multihash, receiptHandle } of event.Records) {
    const cid = CID.create(1, 0x55, digestDecode(base58.decode(multihash)))

    providerRecords.push({ CID: cid.toString(), PeerID: bitswapPeerId })
    receiptsToDelete.push({ Id: idGenerator(), ReceiptHandle: receiptHandle })
  }

  // Call the API
  const {
    statusCode,
    headers,
    body: rawBody
  } = await request(`${hydraRootUrl}/records/add`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(providerRecords)
  })

  // Some error occurred, return with an error
  if (statusCode !== 202) {
    const buffer = new BufferList()

    for await (const chunk of rawBody) {
      buffer.append(chunk)
    }

    const body = buffer.slice().toString('utf-8')

    logger.error(
      { body: (headers['content-type'] || '').startsWith('application/json') ? JSON.parse(body) : body, statusCode },
      `Publishing records failed with status code ${statusCode}.`
    )

    throw new Error(`Publishing records failed with status code ${statusCode} and body: ${body}.`)
  }

  // Delete messages on SQS
  const response = await sqsClient.send(
    new DeleteMessageBatchCommand({
      QueueUrl: publishingQueue,
      Entries: receiptsToDelete
    })
  )

  if (response.Failed) {
    logger.error({ failed: response.Failed }, 'Cannot delete messages from SQS.')
  }

  // Show event progress
  logger.info({ elapsed: elapsed(start), records: event.Records.length }, `Published ${event.Records.length} records.`)
}

exports.handler = main
