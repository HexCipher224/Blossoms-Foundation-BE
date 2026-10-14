import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createRoutes } from './routes/index.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'

export function createApp({ config, store, donations }) {
  const app = express()
  app.disable('x-powered-by')
  if (config.trustProxy) app.set('trust proxy', 1)

  app.use(helmet())
  app.use(cors({ origin: config.corsOrigins }))
  app.use(express.json({ limit: '20kb' }))

  const limiterOptions = { standardHeaders: true, legacyHeaders: false }
  app.use('/api', rateLimit({ ...limiterOptions, windowMs: 15 * 60 * 1000, limit: 300 }))
  // Tighter limit for endpoints that write data.
  const strictLimiter = rateLimit({ ...limiterOptions, windowMs: 60 * 60 * 1000, limit: 30 })

  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.use('/api', createRoutes({ config, store, donations, strictLimiter }))

  app.use(notFound)
  app.use(errorHandler)
  return app
}
