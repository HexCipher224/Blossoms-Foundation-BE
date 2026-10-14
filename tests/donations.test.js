import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { loadConfig } from '../src/config.js'
import { Store } from '../src/utils/store.js'
import { createDonationService, evaluateDeposit, makeReference } from '../src/services/donations.js'

const silent = { error() {}, info() {}, warn() {} }
const TRC = 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE'
const HASH = 'a'.repeat(64)
const body = {
  name: 'Test Donor', email: 'donor@example.com', phone: '+254700000000',
  amount: 1290, currency: 'KES', country: 'KE', language: 'en', frequency: 'once', network: 'TRC20',
}

async function setup({ env = {}, binance } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'blossoms-'))
  const config = loadConfig({ BINANCE_USDT_TRC20_ADDRESS: TRC, DATA_FILE: path.join(dir, 'db.json'), ...env })
  const store = new Store(config.dataFile)
  const fake = binance || { enabled: false }
  const svc = createDonationService({ store, binance: fake, config, logger: silent })
  return { svc, store, config, dir }
}

test('creates a pending donation with a reference, wallet and USDT amount', async () => {
  const { svc } = await setup()
  const d = await svc.create(body)
  assert.match(d.reference, /^BLS-[A-Z2-9]{8}$/)
  assert.equal(d.status, 'pending')
  assert.equal(d.usdtAmount, 10)
  assert.equal(d.wallet.address, TRC)
  assert.equal(d.wallet.network, 'TRX')
})

test('public donation view never leaks donor email or phone', async () => {
  const { svc } = await setup()
  const d = await svc.create(body)
  const json = JSON.stringify(d)
  assert.ok(!json.includes('donor@example.com'))
  assert.ok(!json.includes('+254700000000'))
})

test('returns 503 wallet_not_configured instead of inventing an address', async () => {
  const { svc } = await setup({ env: { BINANCE_USDT_TRC20_ADDRESS: '' } })
  await assert.rejects(() => svc.create(body), (e) => e.status === 503 && e.code === 'wallet_not_configured')
})

test('validation errors give 400 with details', async () => {
  const { svc } = await setup()
  await assert.rejects(() => svc.create({ ...body, amount: 1 }), (e) => e.status === 400 && e.details.amount === 'below_minimum')
})

test('without Binance API a claimed tx stays "claimed" (never auto-confirmed)', async () => {
  const { svc } = await setup()
  const d = await svc.create(body)
  const c = await svc.claim(d.reference, HASH)
  assert.equal(c.status, 'claimed')
  const again = await svc.get(d.reference)
  assert.equal(again.status, 'claimed')
})

test('admin can confirm manually; invalid status is rejected', async () => {
  const { svc } = await setup()
  const d = await svc.create(body)
  const r = await svc.setStatus(d.reference, 'confirmed')
  assert.equal(r.status, 'confirmed')
  assert.equal(r.verification.manual, true)
  await assert.rejects(() => svc.setStatus(d.reference, 'hacked'), (e) => e.code === 'invalid_status')
})

test('claim rejects malformed hashes and unknown references', async () => {
  const { svc } = await setup()
  const d = await svc.create(body)
  await assert.rejects(() => svc.claim(d.reference, 'nope'), (e) => e.code === 'invalid_tx_hash')
  await assert.rejects(() => svc.claim('BLS-NOTREAL1', HASH), (e) => e.status === 404)
})

test('the same tx hash cannot be used for two donations', async () => {
  const { svc } = await setup()
  const a = await svc.create(body)
  const b = await svc.create(body)
  await svc.claim(a.reference, HASH)
  await assert.rejects(() => svc.claim(b.reference, HASH), (e) => e.status === 409)
})

const goodDeposit = { coin: 'USDT', network: 'TRX', address: TRC, status: 1, amount: '10', txId: HASH }

test('with Binance verification a matching credited deposit confirms the donation', async () => {
  const binance = { enabled: true, getDepositAddress: async () => ({ address: TRC }), findDeposit: async () => goodDeposit }
  const { svc } = await setup({ binance })
  const d = await svc.create(body)
  const c = await svc.claim(d.reference, HASH)
  assert.equal(c.status, 'confirmed')
})

test('wrong network / too little / not yet credited do NOT confirm', async () => {
  for (const bad of [{ network: 'BSC' }, { amount: '1' }, { status: 0 }, { coin: 'BTC' }, { address: 'T-someone-else' }]) {
    const binance = { enabled: true, getDepositAddress: async () => ({ address: TRC }), findDeposit: async () => ({ ...goodDeposit, ...bad }) }
    const { svc } = await setup({ binance })
    const d = await svc.create(body)
    const c = await svc.claim(d.reference, HASH)
    assert.equal(c.status, 'claimed', `should not confirm with ${JSON.stringify(bad)}`)
  }
})

test('status refresh confirms once the deposit is credited', async () => {
  let deposit = { ...goodDeposit, status: 0 }
  const binance = { enabled: true, getDepositAddress: async () => ({ address: TRC }), findDeposit: async () => deposit }
  const { svc } = await setup({ binance })
  const d = await svc.create(body)
  assert.equal((await svc.claim(d.reference, HASH)).status, 'claimed')
  deposit = { ...goodDeposit, status: 1 }
  assert.equal((await svc.get(d.reference)).status, 'confirmed')
})

test('Binance outage does not break donations or falsely confirm', async () => {
  const binance = { enabled: true, getDepositAddress: async () => { throw new Error('down') }, findDeposit: async () => { throw new Error('down') } }
  const { svc } = await setup({ binance })
  const d = await svc.create(body) // falls back to configured address
  assert.equal(d.wallet.address, TRC)
  assert.equal((await svc.claim(d.reference, HASH)).status, 'claimed')
})

test('evaluateDeposit tolerates tiny shortfalls (2%) but not large ones', () => {
  const donation = { usdtAmount: 10, wallet: { network: 'TRX', address: TRC } }
  assert.equal(evaluateDeposit(donation, { ...goodDeposit, amount: '9.85' }).ok, true)
  assert.equal(evaluateDeposit(donation, { ...goodDeposit, amount: '9.5' }).ok, false)
})

test('references are unique-looking and well formed', () => {
  const set = new Set(Array.from({ length: 500 }, makeReference))
  assert.equal(set.size, 500)
})

test('store persists data and serializes concurrent writes without losing any', async () => {
  const { svc, dir, config } = await setup()
  await Promise.all(Array.from({ length: 25 }, () => svc.create(body)))
  const reloaded = new Store(config.dataFile)
  const count = await reloaded.read((d) => d.donations.length)
  assert.equal(count, 25)
  await fs.rm(dir, { recursive: true, force: true })
})
