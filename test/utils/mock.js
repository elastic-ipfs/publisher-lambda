'use strict'

const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

const { mockClient } = require('aws-sdk-client-mock')
const sqsMock = mockClient(SQSClient)
const s3Mock = mockClient(S3Client)

function trackAWSUsages(t, failed = false) {
  t.context = {
    s3: { puts: [] },
    sqs: { sends: [] }
  }

  s3Mock.on(PutObjectCommand).callsFake(params => {
    t.context.s3.puts.push(params)

    return true
  })

  sqsMock.on(SendMessageCommand).callsFake(params => {
    t.context.sqs.sends.push(params)

    return true
  })
}

module.exports = {
  s3Mock,
  sqsMock,
  trackAWSUsages
}
