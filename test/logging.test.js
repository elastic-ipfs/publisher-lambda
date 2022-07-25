'use strict'

process.env.ENV_FILE_PATH = 'dev/null'
process.env.BITSWAP_PEER_CID = 'bafzbeibhqavlasjc7dvbiopygwncnrtvjd2xmryk5laib7zyjor6kf3avm'
process.env.LOG_LEVEL = ''
process.env.NODE_DEBUG = 'indexing-lambda'

require('../src/config')

const t = require('tap')
const { elapsed } = require('../src/logging')

t.test('logging - elapsed times are correctly evaluated', t => {
  t.plan(3)

  const start = process.hrtime.bigint()
  t.not(elapsed(start), '0')
  t.not(elapsed(start, 2, 'nanoseconds'), '0')
  t.equal(elapsed(start, 0, 'seconds'), '0')
})
