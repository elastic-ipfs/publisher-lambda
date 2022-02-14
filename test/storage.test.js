'use strict'

process.env.LOG_LEVEL = 'fatal'

const t = require('tap')
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const { SendMessageCommand } = require('@aws-sdk/client-sqs')
const { fetchFromS3, uploadToS3, publishToSQS } = require('../src/storage')
const { s3Mock, sqsMock } = require('./utils/mock')

t.test('fetchFromS3 - error handling', async t => {
  t.plan(1)

  const error = new Error('FAILED')
  s3Mock.on(GetObjectCommand, { Bucket: 'bucket', Key: 'error' }).rejects(error)

  t.rejects(fetchFromS3('bucket', 'error'), 'FAILED')
})

t.test('uploadToS3 - error handling', async t => {
  t.plan(1)

  const error = new Error('FAILED')
  s3Mock
    .on(PutObjectCommand, { Bucket: 'bucket', Key: 'error', Body: 'content', ContentType: 'application/json' })
    .rejects(error)

  t.rejects(uploadToS3('bucket', 'error', 'content'), 'FAILED')
})

t.test('publishToSQS - error handling', async t => {
  t.plan(1)

  const error = new Error('FAILED')
  sqsMock.on(SendMessageCommand, { QueueUrl: 'queue', MessageBody: 'data', key: 'value' }).rejects(error)

  t.rejects(publishToSQS('queue', 'data', { key: 'value' }), 'FAILED')
})
