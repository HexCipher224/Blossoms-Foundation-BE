import 'dotenv/config'
import { loadConfig } from './config.js'
import { Store } from './utils/store.js'
import { createBinanceClient } from './services/binance.js'
import { createDonationService } from './services/donations.js'
import { createApp } from './app.js'

const config = loadConfig()
const store = new Store(config.dataFile)
const binance = createBinanceClient(config.binance)
const donations = createDonationService({ store, binance, config })
const app = createApp({ config, store, donations })

const missing = Object.entries(config.wallets).filter(([, w]) => !w.address).map(([k]) => k)
if (missing.length && !binance.enabled) {
  console.warn(`[warn] No deposit address configured for: ${missing.join(', ')}. Donations on those networks will return 503 until set.`)
}
console.info(`[info] Binance API verification: ${binance.enabled ? 'enabled' : 'disabled (donations stay "claimed" until an admin confirms them)'}`)

app.listen(config.port, () => console.info(`[info] Blossoms API listening on http://localhost:${config.port}`))
