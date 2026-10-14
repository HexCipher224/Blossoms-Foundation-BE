import { toUsdt } from '../services/rates.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[+\d][\d\s\-()]{5,24}$/
export const NETWORKS = ['TRC20', 'BEP20']
export const LANGUAGES = ['en', 'sw', 'fr']
export const FREQUENCIES = ['once', 'monthly']

// Strips control characters and caps length. Newlines are kept only for multiline text.
export function clean(value, max = 200, { multiline = false } = {}) {
  if (typeof value !== 'string') return ''
  const pattern = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g
  return value.replace(pattern, ' ').trim().slice(0, max)
}

export const isEmail = (v) => typeof v === 'string' && v.length <= 254 && EMAIL.test(v)

export function normalizeTxHash(value) {
  return String(value ?? '').trim().replace(/^0x/i, '').toLowerCase()
}
export const isValidTxHash = (hash) => /^[a-z0-9]{16,128}$/.test(hash)

export function validateDonation(body, { rates, minUsdt, maxUsdt }) {
  const b = body && typeof body === 'object' ? body : {}
  const errors = {}

  const name = clean(b.name, 100)
  if (name.length < 2) errors.name = 'required'

  const email = clean(b.email, 254).toLowerCase()
  if (!isEmail(email)) errors.email = 'invalid'

  const phone = clean(b.phone, 25)
  if (!PHONE.test(phone)) errors.phone = 'invalid'

  const currency = clean(b.currency, 3).toUpperCase()
  if (!rates[currency]) errors.currency = 'unsupported'

  const amount = Number(b.amount)
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = 'invalid'

  const country = clean(b.country, 5).toUpperCase()
  if (!/^[A-Z]{2,5}$/.test(country)) errors.country = 'invalid'

  const language = LANGUAGES.includes(b.language) ? b.language : 'en'
  const frequency = FREQUENCIES.includes(b.frequency) ? b.frequency : null
  if (!frequency) errors.frequency = 'invalid'
  const network = NETWORKS.includes(b.network) ? b.network : null
  if (!network) errors.network = 'invalid'

  let usdtAmount = null
  if (!errors.amount && !errors.currency) {
    usdtAmount = toUsdt(amount, currency, rates)
    if (usdtAmount < minUsdt) errors.amount = 'below_minimum'
    else if (usdtAmount > maxUsdt) errors.amount = 'above_maximum'
  }

  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    value: { name, email, phone, amount, currency, country, language, frequency, network, usdtAmount },
  }
}

export function validateContact(body) {
  const b = body && typeof body === 'object' ? body : {}
  const errors = {}
  const name = clean(b.name, 100)
  const email = clean(b.email, 254).toLowerCase()
  const phone = clean(b.phone, 25)
  const subject = clean(b.subject, 150)
  const message = clean(b.message, 4000, { multiline: true })
  if (name.length < 2) errors.name = 'required'
  if (!isEmail(email)) errors.email = 'invalid'
  if (phone && !PHONE.test(phone)) errors.phone = 'invalid'
  if (subject.length < 2) errors.subject = 'required'
  if (message.length < 5) errors.message = 'required'
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, value: { name, email, phone, subject, message } }
}
