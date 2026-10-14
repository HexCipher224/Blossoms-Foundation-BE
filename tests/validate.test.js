import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDonation, validateContact, normalizeTxHash, isValidTxHash } from '../src/utils/validate.js'
import { RATES_PER_USD, toUsdt } from '../src/services/rates.js'

const opts = { rates: RATES_PER_USD, minUsdt: 0.3, maxUsdt: 100000 }
const good = {
  name: 'Amina Wanjiru', email: 'Amina@Example.com', phone: '+254 712 345 678',
  amount: 50, currency: 'KES', country: 'KE', language: 'sw', frequency: 'once', network: 'TRC20',
}

test('KSh 50 converts to about 0.39 USDT and is accepted (donations start at KSh 50)', () => {
  assert.equal(toUsdt(50, 'KES'), 0.39)
  const r = validateDonation(good, opts)
  assert.equal(r.ok, true)
  assert.equal(r.value.usdtAmount, 0.39)
  assert.equal(r.value.email, 'amina@example.com')
})

test('rejects amounts below the minimum, unknown currencies and bad enums', () => {
  assert.equal(validateDonation({ ...good, amount: 10 }, opts).errors.amount, 'below_minimum')
  assert.equal(validateDonation({ ...good, currency: 'XXX' }, opts).errors.currency, 'unsupported')
  assert.equal(validateDonation({ ...good, network: 'ERC20' }, opts).errors.network, 'invalid')
  assert.equal(validateDonation({ ...good, frequency: 'weekly' }, opts).errors.frequency, 'invalid')
  assert.equal(validateDonation({ ...good, amount: -5 }, opts).errors.amount, 'invalid')
  assert.equal(validateDonation({ ...good, amount: 'abc' }, opts).errors.amount, 'invalid')
  assert.equal(validateDonation({ ...good, email: 'nope' }, opts).errors.email, 'invalid')
  assert.equal(validateDonation(null, opts).ok, false)
})

test('local currencies convert sensibly', () => {
  assert.equal(toUsdt(129, 'KES'), 1)
  assert.equal(toUsdt(10, 'USD'), 10)
  assert.equal(toUsdt(5, 'XXX'), null)
})

test('contact validation', () => {
  assert.equal(validateContact({ name: 'A B', email: 'a@b.co', subject: 'Hi', message: 'Hello there' }).ok, true)
  const bad = validateContact({ name: '', email: 'x', subject: '', message: '' })
  assert.deepEqual(Object.keys(bad.errors).sort(), ['email', 'message', 'name', 'subject'])
})

test('tx hash normalization', () => {
  assert.equal(normalizeTxHash(' 0xABCDEF0123456789ABCDEF '), 'abcdef0123456789abcdef')
  assert.equal(isValidTxHash('a'.repeat(64)), true)
  assert.equal(isValidTxHash('short'), false)
  assert.equal(isValidTxHash('a'.repeat(64) + '; DROP'), false)
})
