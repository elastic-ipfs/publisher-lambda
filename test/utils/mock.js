'use strict'

const { SQSClient, DeleteMessageBatchCommand } = require('@aws-sdk/client-sqs')
const { mockClient } = require('aws-sdk-client-mock')
const sqsMock = mockClient(SQSClient)

function trackSQSDeletions(t, failed = false) {
  t.context.sqsDeletions = []

  sqsMock.on(DeleteMessageBatchCommand).callsFake(params => {
    t.context.sqsDeletions.push(params)

    return { Failed: failed }
  })
}

module.exports = {
  sqsMock,
  trackSQSDeletions
}
