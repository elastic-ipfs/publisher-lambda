'use strict'

const t = require('tap')
const { MockAgent, setGlobalDispatcher } = require('undici')
const { publishingQueue, hydraRootUrl, idGenerator } = require('../src/config')
const { handler } = require('../src/index')
const { trackSQSDeletions } = require('./utils/mock')

t.test('publishing - correctly push records', async t => {
  t.plan(1)
  const mockAgent = new MockAgent()
  const mockPool = mockAgent.get(hydraRootUrl)

  mockAgent.disableNetConnect()

  mockPool
    .intercept({
      method: 'POST',
      path: '/records/add'
    })
    .reply(202, '')

  trackSQSDeletions(t)
  setGlobalDispatcher(mockAgent)

  await handler({
    Records: [
      {
        receiptHandle: 'RECEIPT1',
        body: 'zQmNccjCLfFE59aK2baZm7MhRXDioPuc5Q8cYsex35nnQaG'
      },
      {
        receiptHandle: 'RECEIPT2',
        body: 'zQmP252tyjk4rdebFh7sss16F7UTAmZrQmvvoPubHBNqrLw'
      }
    ]
  })

  const idPrefix = idGenerator().replace(/\/\d$/, '')
  t.same(t.context.sqsDeletions[0], {
    QueueUrl: publishingQueue,
    Entries: [
      { Id: `${idPrefix}/0`, ReceiptHandle: 'RECEIPT1' },
      { Id: `${idPrefix}/1`, ReceiptHandle: 'RECEIPT2' }
    ]
  })
})

t.test('publishing - handles Hydra nodes rejection (JSON response)', async t => {
  t.plan(2)
  const mockAgent = new MockAgent()
  const mockPool = mockAgent.get(hydraRootUrl)

  mockAgent.disableNetConnect()

  mockPool
    .intercept({
      method: 'POST',
      path: '/records/add'
    })
    .reply(404, { error: 'ERROR' }, { headers: { 'content-type': 'application/json' } })

  trackSQSDeletions(t)
  setGlobalDispatcher(mockAgent)

  await t.rejects(
    () =>
      handler({
        Records: [
          {
            receiptHandle: 'RECEIPT1',
            body: 'zQmNccjCLfFE59aK2baZm7MhRXDioPuc5Q8cYsex35nnQaG'
          },
          {
            receiptHandle: 'RECEIPT2',
            body: 'zQmP252tyjk4rdebFh7sss16F7UTAmZrQmvvoPubHBNqrLw'
          }
        ]
      }),
    { message: 'Publishing records failed with status code 404 and body: {"error":"ERROR"}.' }
  )

  t.equal(t.context.sqsDeletions.length, 0)
})

t.test('publishing - handles Hydra nodes rejection (other responses)', async t => {
  t.plan(2)
  const mockAgent = new MockAgent()
  const mockPool = mockAgent.get(hydraRootUrl)

  mockAgent.disableNetConnect()

  mockPool
    .intercept({
      method: 'POST',
      path: '/records/add'
    })
    .reply(404, 'ERROR')

  trackSQSDeletions(t)
  setGlobalDispatcher(mockAgent)

  await t.rejects(
    () =>
      handler({
        Records: [
          {
            receiptHandle: 'RECEIPT1',
            body: 'zQmNccjCLfFE59aK2baZm7MhRXDioPuc5Q8cYsex35nnQaG'
          },
          {
            receiptHandle: 'RECEIPT2',
            body: 'zQmP252tyjk4rdebFh7sss16F7UTAmZrQmvvoPubHBNqrLw'
          }
        ]
      }),
    { message: 'Publishing records failed with status code 404 and body: ERROR.' }
  )

  t.equal(t.context.sqsDeletions.length, 0)
})

t.test('publishing - handles SQS errors', async t => {
  t.plan(1)
  const mockAgent = new MockAgent()
  const mockPool = mockAgent.get(hydraRootUrl)

  mockAgent.disableNetConnect()

  mockPool
    .intercept({
      method: 'POST',
      path: '/records/add'
    })
    .reply(202, '')

  trackSQSDeletions(t, true)
  setGlobalDispatcher(mockAgent)

  await handler({
    Records: [
      {
        receiptHandle: 'RECEIPT1',
        body: 'zQmNccjCLfFE59aK2baZm7MhRXDioPuc5Q8cYsex35nnQaG'
      },
      {
        receiptHandle: 'RECEIPT2',
        body: 'zQmP252tyjk4rdebFh7sss16F7UTAmZrQmvvoPubHBNqrLw'
      }
    ]
  })

  const idPrefix = idGenerator().replace(/\/\d$/, '')
  t.same(t.context.sqsDeletions[0], {
    QueueUrl: publishingQueue,
    Entries: [
      { Id: `${idPrefix}/7`, ReceiptHandle: 'RECEIPT1' },
      { Id: `${idPrefix}/8`, ReceiptHandle: 'RECEIPT2' }
    ]
  })
})
