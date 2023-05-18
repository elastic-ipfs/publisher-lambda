'use strict'

process.env.HANDLER = 'advertisement'

const t = require('tap')
const dagJson = require('@ipld/dag-json')
const { MockAgent, setGlobalDispatcher } = require('undici')
const { awsRegion, s3Bucket, indexerNodeUrl } = require('../src/config')
const { handler } = require('../src/index')
const { trackAWSUsages, mockPeerIds } = require('./utils/mock')

t.test('advertisement - creates a new head when none is found and notifies the indexer', async t => {
  t.plan(8)

  const mockAgent = new MockAgent()
  const mockHeadPool = mockAgent.get(`https://${s3Bucket}.s3.${awsRegion}.amazonaws.com`)
  const mockIndexerPool = mockAgent.get(indexerNodeUrl)
  mockPeerIds()

  mockAgent.disableNetConnect()
  mockHeadPool.intercept({ method: 'GET', path: '/head' }).reply(404, '')
  mockIndexerPool
    .intercept({
      method: 'PUT',
      path: '/ingest/announce'
    })
    .reply(204, '')

  trackAWSUsages(t)
  setGlobalDispatcher(mockAgent)

  t.strictSame(
    await handler({
      Records: [
        { body: 'baguqeera4vd5tybgxaub4elwag6v7yhswhflfyopogr7r32b7dpt5mqfmmoq' },
        { body: 'baguqeeramxlkaqnblpdl53ygpu4ackscn7ipm54ra2iwiq5kfolvd6vh6bda' }
      ]
    }),
    {}
  )

  t.equal(t.context.s3.puts[0].Bucket, s3Bucket)
  t.equal(t.context.s3.puts[1].Bucket, s3Bucket)
  t.equal(t.context.s3.puts[2].Bucket, s3Bucket)
  t.ok(t.context.s3.puts[0].Key.startsWith('bagu'))
  t.ok(t.context.s3.puts[0].Key.startsWith('bagu'))
  t.equal(t.context.s3.puts[2].Key, 'head')

  t.notOk(dagJson.decode(t.context.s3.puts[0].Body).PreviousID)
})

t.test('advertisement - links to the previous head and notifies the indexer', async t => {
  t.plan(8)

  const mockAgent = new MockAgent()
  const mockHeadPool = mockAgent.get(`https://${s3Bucket}.s3.${awsRegion}.amazonaws.com`)
  const mockIndexerPool = mockAgent.get(indexerNodeUrl)
  mockPeerIds()

  mockAgent.disableNetConnect()
  mockHeadPool
    .intercept({ method: 'GET', path: '/head' })
    .reply(200, '{"head": {"/": "baguqeeralr4pwxvbcc6voioqyc6aneg4pkoh5rhrfj35gbhrpxpeavsh6vsa"}}', {
      headers: { 'content-type': 'application/json' }
    })
  mockIndexerPool
    .intercept({
      method: 'PUT',
      path: '/ingest/announce'
    })
    .reply(204, '')

  trackAWSUsages(t)
  setGlobalDispatcher(mockAgent)

  t.strictSame(
    await handler({
      Records: [
        { body: 'baguqeera4vd5tybgxaub4elwag6v7yhswhflfyopogr7r32b7dpt5mqfmmoq' },
        { body: 'baguqeeramxlkaqnblpdl53ygpu4ackscn7ipm54ra2iwiq5kfolvd6vh6bda' }
      ]
    }),
    {}
  )

  t.equal(t.context.s3.puts[0].Bucket, s3Bucket)
  t.equal(t.context.s3.puts[1].Bucket, s3Bucket)
  t.equal(t.context.s3.puts[2].Bucket, s3Bucket)
  t.ok(t.context.s3.puts[0].Key.startsWith('bagu'))
  t.ok(t.context.s3.puts[0].Key.startsWith('bagu'))
  t.equal(t.context.s3.puts[2].Key, 'head')

  t.equal(
    dagJson.decode(t.context.s3.puts[0].Body).PreviousID.toString(),
    'baguqeeralr4pwxvbcc6voioqyc6aneg4pkoh5rhrfj35gbhrpxpeavsh6vsa'
  )
})

t.test('advertisement - extended provider', async t => {
  t.plan(10)

  const mockAgent = new MockAgent()
  const mockHeadPool = mockAgent.get(`https://${s3Bucket}.s3.${awsRegion}.amazonaws.com`)
  const mockIndexerPool = mockAgent.get(indexerNodeUrl)
  mockPeerIds()

  const head = 'baguqeeralr4pwxvbcc6voioqyc6aneg4pkoh5rhrfj35gbhrpxpeavsh6vsa'
  mockAgent.disableNetConnect()
  mockHeadPool
    .intercept({ method: 'GET', path: '/head' })
    .reply(200, `{"head": {"/": "${head}"}}`, {
      headers: { 'content-type': 'application/json' }
    })
  mockIndexerPool
    .intercept({
      method: 'PUT',
      path: '/ingest/announce'
    })
    .reply(204, '')

  trackAWSUsages(t)
  setGlobalDispatcher(mockAgent)

  t.strictSame(
    await handler({
      Records: [
        { body: 'AnnounceHTTP' },
        { body: 'baguqeeramxlkaqnblpdl53ygpu4ackscn7ipm54ra2iwiq5kfolvd6vh6bda' }
      ]
    }),
    {}
  )

  t.equal(t.context.s3.puts[0].Bucket, s3Bucket)
  t.equal(t.context.s3.puts[1].Bucket, s3Bucket)
  t.equal(t.context.s3.puts[2].Bucket, s3Bucket)
  t.ok(t.context.s3.puts[0].Key.startsWith('bagu'))
  t.ok(t.context.s3.puts[0].Key.startsWith('bagu'))
  t.equal(t.context.s3.puts[2].Key, 'head')

  const ad = dagJson.decode(t.context.s3.puts[0].Body)
  t.equal(ad.PreviousID.toString(), head)
  t.equal(ad.ExtendedProvider.Providers.length, 2)
  t.equal(ad.ExtendedProvider.Providers[1].Addresses[0], '/dns4/freeway.dag.house/tcp/443/https' )
})

t.test('advertisement - handles head fetching HTTP error', async t => {
  t.plan(1)

  const mockAgent = new MockAgent()
  const mockHeadPool = mockAgent.get(`https://${s3Bucket}.s3.${awsRegion}.amazonaws.com`)

  mockPeerIds()
  mockAgent.disableNetConnect()
  mockHeadPool.intercept({ method: 'GET', path: '/head' }).reply(500, 'BODY')

  trackAWSUsages(t)
  setGlobalDispatcher(mockAgent)

  await t.rejects(
    () =>
      handler({
        Records: [
          { body: 'baguqeera4vd5tybgxaub4elwag6v7yhswhflfyopogr7r32b7dpt5mqfmmoq' },
          { body: 'baguqeeramxlkaqnblpdl53ygpu4ackscn7ipm54ra2iwiq5kfolvd6vh6bda' }
        ]
      }),
    { message: 'Downloading previous head failed with status code 500 and body: BODY' }
  )
})

t.test('advertisement - handles head fetching generic error', async t => {
  t.plan(1)

  const mockAgent = new MockAgent()
  const mockHeadPool = mockAgent.get(`https://${s3Bucket}.s3.${awsRegion}.amazonaws.com`)

  mockPeerIds()
  mockAgent.disableNetConnect()
  mockHeadPool.intercept({ method: 'GET', path: '/head' }).replyWithError(new Error('ERROR'))

  trackAWSUsages(t)
  setGlobalDispatcher(mockAgent)

  await t.rejects(
    () =>
      handler({
        Records: [
          { body: 'baguqeera4vd5tybgxaub4elwag6v7yhswhflfyopogr7r32b7dpt5mqfmmoq' },
          { body: 'baguqeeramxlkaqnblpdl53ygpu4ackscn7ipm54ra2iwiq5kfolvd6vh6bda' }
        ]
      }),
    { message: 'ERROR' }
  )
})

t.test('advertisement - handles indexer announcing HTTP error. It should fail silently', async t => {
  t.plan(1)

  const mockAgent = new MockAgent()
  const mockHeadPool = mockAgent.get(`https://${s3Bucket}.s3.${awsRegion}.amazonaws.com`)
  const mockIndexerPool = mockAgent.get(indexerNodeUrl)

  mockPeerIds()
  mockAgent.disableNetConnect()
  mockHeadPool.intercept({ method: 'GET', path: '/head' }).reply(404, '')
  mockIndexerPool
    .intercept({
      method: 'PUT',
      path: '/ingest/announce'
    })
    .reply(500, 'BODY')

  trackAWSUsages(t)
  setGlobalDispatcher(mockAgent)

  t.strictSame(
    await handler({
      Records: [
        { body: 'baguqeera4vd5tybgxaub4elwag6v7yhswhflfyopogr7r32b7dpt5mqfmmoq' },
        { body: 'baguqeeramxlkaqnblpdl53ygpu4ackscn7ipm54ra2iwiq5kfolvd6vh6bda' }
      ]
    }),
    {}
  )
})

t.test('advertisement - handles indexer announcing HTTP+JSON error. It should fail silently', async t => {
  t.plan(1)

  const mockAgent = new MockAgent()
  const mockHeadPool = mockAgent.get(`https://${s3Bucket}.s3.${awsRegion}.amazonaws.com`)
  const mockIndexerPool = mockAgent.get(indexerNodeUrl)

  mockPeerIds()
  mockAgent.disableNetConnect()
  mockHeadPool.intercept({ method: 'GET', path: '/head' }).reply(404, '')
  mockIndexerPool
    .intercept({
      method: 'PUT',
      path: '/ingest/announce'
    })
    .reply(500, '{"error":"ERROR"}', { headers: { 'content-type': 'application/json' } })

  trackAWSUsages(t)
  setGlobalDispatcher(mockAgent)

  t.strictSame(
    await handler({
      Records: [
        { body: 'baguqeera4vd5tybgxaub4elwag6v7yhswhflfyopogr7r32b7dpt5mqfmmoq' },
        { body: 'baguqeeramxlkaqnblpdl53ygpu4ackscn7ipm54ra2iwiq5kfolvd6vh6bda' }
      ]
    }),
    {}
  )
})

t.test('advertisement - handles indexer announcing generic error', async t => {
  t.plan(1)

  const mockAgent = new MockAgent()
  const mockHeadPool = mockAgent.get(`https://${s3Bucket}.s3.${awsRegion}.amazonaws.com`)
  const mockIndexerPool = mockAgent.get(indexerNodeUrl)

  mockPeerIds()
  mockAgent.disableNetConnect()
  mockHeadPool.intercept({ method: 'GET', path: '/head' }).reply(404, '')
  mockIndexerPool
    .intercept({
      method: 'PUT',
      path: '/ingest/announce'
    })
    .replyWithError(new Error('ERROR'))

  trackAWSUsages(t)
  setGlobalDispatcher(mockAgent)

  await t.rejects(
    () =>
      handler({
        Records: [
          { body: 'baguqeera4vd5tybgxaub4elwag6v7yhswhflfyopogr7r32b7dpt5mqfmmoq' },
          { body: 'baguqeeramxlkaqnblpdl53ygpu4ackscn7ipm54ra2iwiq5kfolvd6vh6bda' }
        ]
      }),
    { message: 'ERROR' }
  )
})
