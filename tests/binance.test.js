import test from 'node:test'
import assert from 'node:assert/strict'
import { sign, buildSignedQuery, createBinanceClient } from '../src/services/binance.js'

test('HMAC signing matches the example vector from the Binance API docs', () => {
  const secret = 'NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j'
  const qs = 'symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559'
  assert.equal(sign(qs, secret), 'c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71')
})

test('signed query appends timestamp, recvWindow and signature last', () => {
  const q = buildSignedQuery({ coin: 'USDT' }, 'secret', 1700000000000)
  assert.match(q, /^coin=USDT&recvWindow=5000&timestamp=1700000000000&signature=[a-f0-9]{64}$/)
})

test('client is disabled without keys', () => {
  assert.equal(createBinanceClient({ apiKey: '', apiSecret: '' }).enabled, false)
})

test('findDeposit sends the API key header and matches txId ignoring 0x/case', async () => {
  let seen
  const fetchImpl = async (url, init) => {
    seen = { url, init }
    return { ok: true, status: 200, json: async () => [{ txId: '0xABCD', amount: '5', coin: 'USDT' }, { txId: 'other' }] }
  }
  const client = createBinanceClient({ apiKey: 'KEY', apiSecret: 'SECRET', baseUrl: 'https://example.test' }, fetchImpl)
  const dep = await client.findDeposit('abcd', 'USDT')
  assert.equal(dep.amount, '5')
  assert.equal(seen.init.headers['X-MBX-APIKEY'], 'KEY')
  assert.match(seen.url, /^https:\/\/example\.test\/sapi\/v1\/capital\/deposit\/hisrec\?/)
  assert.match(seen.url, /signature=[a-f0-9]{64}$/)
})

test('API errors surface as exceptions', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ msg: 'Invalid API-key' }) })
  const client = createBinanceClient({ apiKey: 'K', apiSecret: 'S', baseUrl: 'https://x.test' }, fetchImpl)
  await assert.rejects(() => client.getDepositAddress('USDT', 'TRX'), /401/)
})
