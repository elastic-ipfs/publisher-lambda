const { BufferList } = require('bl')
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs')

const { NodeHttpHandler } = require('@aws-sdk/node-http-handler')
const { Agent } = require('https')

const { logger, serializeError } = require('./logging')
const { metrics, trackDuration } = require('./telemetry')

const agent = new Agent({ keepAlive: true, keepAliveMsecs: 60000 })

const sqsClient = new SQSClient({
  requestHandler: new NodeHttpHandler({ httpsAgent: agent })
})

const s3Client = new S3Client({
  requestHandler: new NodeHttpHandler({ httpsAgent: new Agent({ keepAlive: true, keepAliveMsecs: 60000 }) })
})

async function fetchFromS3(bucket, key) {
  try {
    metrics.s3Fetchs.add(1)

    // Download from S3
    const record = await trackDuration(
      metrics.s3FetchsDurations,
      s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    )
    const buffer = new BufferList()

    for await (const chunk of record.Body) {
      buffer.append(chunk)
    }

    return buffer.slice()
  } catch (e) {
    logger.error(`Cannot download file ${key} from S3 bucket ${bucket}: ${serializeError(e)}`)
    throw e
  }
}

async function uploadToS3(bucket, key, content) {
  try {
    metrics.s3Uploads.add(1)

    await trackDuration(
      metrics.s3UploadsDurations,
      s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: content, ContentType: 'application/json' }))
    )
  } catch (e) {
    logger.error(`Cannot upload file ${key} to S3 bucket ${bucket}: ${serializeError(e)}`)

    throw e
  }
}

async function publishToSQS(queue, data, additionalAttributes = {}) {
  try {
    metrics.sqsPublishes.add(1)

    await trackDuration(
      metrics.sqsPublishesDurations,
      sqsClient.send(new SendMessageCommand({ QueueUrl: queue, MessageBody: data, ...additionalAttributes }))
    )
  } catch (e) {
    logger.error(`Cannot publish a block to ${queue}: ${serializeError(e)}`)

    throw e
  }
}

module.exports = { fetchFromS3, uploadToS3, publishToSQS }
