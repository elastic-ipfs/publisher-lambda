'use strict'

const { Readable } = require('stream')
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs')
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')

const { mockClient } = require('aws-sdk-client-mock')
const sqsMock = mockClient(SQSClient)
const s3Mock = mockClient(S3Client)

const bsPeerJson = require('../fixtures/peerId.json')
const httpPeerJson = require('../fixtures/peerId-http.json')

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

function mockPeerIds () {
  s3Mock.on(GetObjectCommand, { Key: 'peerId.json' })
    .callsFake(() => ({ Body: Readable.from(JSON.stringify(bsPeerJson)) }))
  s3Mock.on(GetObjectCommand, { Key: 'peerId-http.json' })
    .callsFake(() => ({ Body: Readable.from(JSON.stringify(httpPeerJson)) }))
}

module.exports = {
  s3Mock,
  sqsMock,
  trackAWSUsages,
  mockPeerIds
}
