import crypto from 'node:crypto'
import { normalizeTxHash } from '../utils/validate.js'

export const sign = (queryString, secret) =>
  crypto.createHmac('sha256', secret).update(queryString).digest('hex')

export function buildSignedQuery(params, secret, now = Date.now()) {
  const qs = new URLSearchParams({ ...params, recvWindow: '5000', timestamp: String(now) }).toString()
  return `${qs}&signature=${sign(qs, secret)}`
}

/**
 * Thin client for the two read-only Binance endpoints we need.
 * Requires an API key with READ-ONLY permission (never enable trading/withdrawals).
 * Docs: https://developers.binance.com/docs/wallet/capital
 *
 * NOTE: written against Binance's public docs but not tested against the live API
 * from this repository's CI. Test with a small deposit before going live.
 */
export function createBinanceClient(cfg, fetchImpl = globalThis.fetch) {
  const enabled = Boolean(cfg.apiKey && cfg.apiSecret)

  async function signedGet(path, params) {
    const url = `${cfg.baseUrl}${path}?${buildSignedQuery(params, cfg.apiSecret)}`
    const res = await fetchImpl(url, { headers: { 'X-MBX-APIKEY': cfg.apiKey } })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(`Binance request failed: ${res.status} ${body.msg || ''}`.trim())
      err.status = res.status
      throw err
    }
    return body
  }

  return {
    enabled,

    // GET /sapi/v1/capital/deposit/address  -> { address, coin, tag, url }
    async getDepositAddress(coin, network) {
      const body = await signedGet('/sapi/v1/capital/deposit/address', { coin, network })
      return { address: body.address, tag: body.tag || '' }
    },

    // GET /sapi/v1/capital/deposit/hisrec -> [{ amount, coin, network, status, address, txId, ... }]
    // status 1 = credited / success.
    async findDeposit(txHash, coin = 'USDT') {
      const wanted = normalizeTxHash(txHash)
      const now = Date.now()
      const rows = await signedGet('/sapi/v1/capital/deposit/hisrec', {
        coin,
        txId: txHash,
        limit: '1000',
        startTime: String(now - 89 * 24 * 60 * 60 * 1000),
        endTime: String(now),
      })
      const list = Array.isArray(rows) ? rows : []
      return list.find((row) => normalizeTxHash(row.txId) === wanted) || null
    },
  }
}
