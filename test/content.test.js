'use strict'

process.env.HANDLER = 'content'

const t = require('tap')
const { advertisementsQueue, s3Bucket } = require('../src/config')
const { handler } = require('../src/index')
const { trackAWSUsages } = require('./utils/mock')

t.test('content - uploads the CIDs to a S3 file and publishes to SQS', async t => {
  t.plan(3)

  trackAWSUsages(t)

  t.strictSame(
    await handler({
      Records: [
        { body: 'zQmSHc8o3PxQgMccYgGtuStaNQKXTBX1rTHN5W9cUCwrcHX' },
        { body: 'zQmTgGQZ3ZcbcHxZiFNHs76Y7Ca8DfFGjdsxXDVnr41h339' },
        { body: 'zQmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn' }
      ]
    }),
    {}
  )

  t.strictSame(t.context.s3.puts, [
    {
      Bucket: s3Bucket,
      Key: 'baguqeera4vd5tybgxaub4elwag6v7yhswhflfyopogr7r32b7dpt5mqfmmoq',
      Body: Buffer.from(
        JSON.stringify({
          Entries: [
            { '/': { bytes: 'EiA6pxguVkZ93/KqbDvN1oh1QhtnlQYBmjERXNzGT9AK0g==' } },
            { '/': { bytes: 'EiBPUNVIPdOiuKhoFBf9M995d8RXCdNdlcP9fNBGeSPgpA==' } },
            { '/': { bytes: 'EiBZlIQ5Bl8pYZ70EoDLuTK+UsVtmcWWa2XgERI58Ji77w==' } }
          ]
        })
      ),
      ContentType: 'application/json'
    }
  ])

  t.strictSame(t.context.sqs.sends, [
    {
      QueueUrl: advertisementsQueue,
      MessageBody: 'baguqeera4vd5tybgxaub4elwag6v7yhswhflfyopogr7r32b7dpt5mqfmmoq'
    }
  ])
})
