import crypto from 'node:crypto'
import { ApiError } from '../utils/errors.js'
import { validateDonation, normalizeTxHash, isValidTxHash } from '../utils/validate.js'
import { RATES_PER_USD } from './rates.js'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I to avoid transcription mistakes
const ADDRESS_CACHE_MS = 60 * 60 * 1000
export const ADMIN_STATUSES = ['pending', 'claimed', 'confirmed', 'rejected']

export function makeReference() {
  const bytes = crypto.randomBytes(8)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return `BLS-${out}`
}

// Safe view of a donation for the public: never includes email/phone.
export function publicDonation(d, payId = '') {
  return {
    reference: d.reference,
    status: d.status,
    coin: d.coin,
    usdtAmount: d.usdtAmount,
    amount: d.amount,
    currency: d.currency,
    frequency: d.frequency,
    wallet: {
      network: d.wallet.network,
      networkLabel: d.wallet.networkLabel,
      address: d.wallet.address,
      ...(payId ? { payId } : {}),
    },
    createdAt: d.createdAt,
  }
}

/**
 * Decides whether a Binance deposit record really matches a donation.
 * Pure function so it can be unit tested. A donation is only 'confirmed'
 * when every check passes. Nothing here trusts what the donor claims.
 */
export function evaluateDeposit(donation, deposit, tolerance = 0.02) {
  const reasons = []
  if (String(deposit.coin).toUpperCase() !== 'USDT') reasons.push('wrong_coin')
  if (deposit.network && deposit.network !== donation.wallet.network) reasons.push('wrong_network')
  if (
    deposit.address &&
    donation.wallet.address &&
    String(deposit.address).toLowerCase() !== donation.wallet.address.toLowerCase()
  ) {
    reasons.push('wrong_address')
  }
  if (Number(deposit.status) !== 1) reasons.push('not_credited_yet')
  const received = Number(deposit.amount)
  if (!(received >= donation.usdtAmount * (1 - tolerance))) reasons.push('amount_too_low')
  return { ok: reasons.length === 0, reasons, received, checkedAt: new Date().toISOString() }
}

export function createDonationService({ store, binance, config, rates = RATES_PER_USD, logger = console }) {
  const addressCache = new Map() // networkKey -> { address, at }

  async function resolveWallet(networkKey) {
    const base = config.wallets[networkKey]
    if (!base) throw new ApiError(400, 'unsupported_network')

    let address = base.address
    if (binance.enabled) {
      const cached = addressCache.get(networkKey)
      if (cached && Date.now() - cached.at < ADDRESS_CACHE_MS) {
        address = cached.address
      } else {
        try {
          const res = await binance.getDepositAddress('USDT', base.network)
          if (res.address) {
            address = res.address
            addressCache.set(networkKey, { address, at: Date.now() })
          }
        } catch (err) {
          logger.error('Binance address lookup failed, falling back to configured address:', err.message)
        }
      }
    }
    if (!address) throw new ApiError(503, 'wallet_not_configured')
    return { network: base.network, networkLabel: base.label, address }
  }

  async function tryVerify(record) {
    if (!binance.enabled || !record.txHash) return null
    try {
      const deposit = await binance.findDeposit(record.txHash, 'USDT')
      return deposit ? evaluateDeposit(record, deposit) : { ok: false, reasons: ['not_found_yet'], checkedAt: new Date().toISOString() }
    } catch (err) {
      logger.error('Binance verification failed:', err.message)
      return null
    }
  }

  const find = (data, reference) => data.donations.find((d) => d.reference === reference)

  return {
    resolveWallet,

    async create(input) {
      const v = validateDonation(input, { rates, minUsdt: config.minUsdt, maxUsdt: config.maxUsdt })
      if (!v.ok) throw new ApiError(400, 'validation_error', v.errors)

      const wallet = await resolveWallet(v.value.network)
      const now = new Date().toISOString()

      return store.mutate((data) => {
        let reference = makeReference()
        while (find(data, reference)) reference = makeReference()
        const record = {
          reference,
          status: 'pending',
          coin: 'USDT',
          ...v.value,
          wallet,
          txHash: null,
          verification: null,
          createdAt: now,
          updatedAt: now,
        }
        data.donations.push(record)
        return publicDonation(record, config.binance.payId)
      })
    },

    async get(reference) {
      const record = await store.read((data) => find(data, reference))
      if (!record) throw new ApiError(404, 'not_found')

      // Re-check pending claims so "Check status" can pick up deposits as they confirm.
      if (record.status === 'claimed') {
        const verification = await tryVerify(record)
        if (verification) {
          return store.mutate((data) => {
            const rec = find(data, reference)
            rec.verification = verification
            if (verification.ok) rec.status = 'confirmed'
            rec.updatedAt = new Date().toISOString()
            return publicDonation(rec, config.binance.payId)
          })
        }
      }
      return publicDonation(record, config.binance.payId)
    },

    async claim(reference, rawHash) {
      const txHash = normalizeTxHash(rawHash)
      if (!isValidTxHash(txHash)) throw new ApiError(400, 'invalid_tx_hash')

      const existing = await store.read((data) => find(data, reference))
      if (!existing) throw new ApiError(404, 'not_found')
      if (existing.status === 'confirmed') return publicDonation(existing, config.binance.payId)

      const verification = await tryVerify({ ...existing, txHash })

      return store.mutate((data) => {
        const rec = find(data, reference)
        if (!rec) throw new ApiError(404, 'not_found')
        const clash = data.donations.find((d) => d.reference !== reference && d.txHash === txHash)
        if (clash) throw new ApiError(409, 'tx_already_used')
        rec.txHash = txHash
        rec.status = 'claimed'
        if (verification) {
          rec.verification = verification
          if (verification.ok) rec.status = 'confirmed'
        }
        rec.updatedAt = new Date().toISOString()
        return publicDonation(rec, config.binance.payId)
      })
    },

    // ---- admin ----
    listAll: () => store.read((data) => [...data.donations].reverse()),

    async setStatus(reference, status) {
      if (!ADMIN_STATUSES.includes(status)) throw new ApiError(400, 'invalid_status')
      return store.mutate((data) => {
        const rec = find(data, reference)
        if (!rec) throw new ApiError(404, 'not_found')
        rec.status = status
        rec.verification = { ...(rec.verification || {}), manual: true, setAt: new Date().toISOString() }
        rec.updatedAt = new Date().toISOString()
        return rec
      })
    },
  }
}
