import path from 'node:path'

const num = (value, fallback) => {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

// Built from the environment at call time so tests can override variables.
export function loadConfig(env = process.env) {
  return {
    port: num(env.PORT, 4000),
    trustProxy: env.TRUST_PROXY === '1',
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    adminApiKey: env.ADMIN_API_KEY || '',
    dataFile: env.DATA_FILE || path.join(process.cwd(), 'data', 'db.json'),
    minUsdt: num(env.MIN_DONATION_USDT, 0.3),
    maxUsdt: num(env.MAX_DONATION_USDT, 100000),
    binance: {
      apiKey: env.BINANCE_API_KEY || '',
      apiSecret: env.BINANCE_API_SECRET || '',
      baseUrl: env.BINANCE_BASE_URL || 'https://api.binance.com',
      payId: env.BINANCE_PAY_ID || '',
    },
    // `network` is Binance's network code; `address` is where donors send USDT.
    wallets: {
      TRC20: { network: 'TRX', label: 'TRON (TRC20)', address: env.BINANCE_USDT_TRC20_ADDRESS || '' },
      BEP20: { network: 'BSC', label: 'BNB Smart Chain (BEP20)', address: env.BINANCE_USDT_BEP20_ADDRESS || '' },
    },
  }
}
