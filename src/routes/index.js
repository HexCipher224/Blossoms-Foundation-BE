import { Router } from 'express'
import { ApiError } from '../utils/errors.js'
import { validateContact, isEmail, clean } from '../utils/validate.js'
import { RATES_PER_USD } from '../services/rates.js'
import { adminAuth } from '../middleware/adminAuth.js'

// Express 4 does not catch rejected promises, so wrap async handlers.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export function createRoutes({ config, store, donations, strictLimiter }) {
  const router = Router()

  router.get('/rates', (_req, res) => res.json({ base: 'USD', note: 'Indicative rates', rates: RATES_PER_USD }))

  // ---- donations ----
  router.post('/donations', strictLimiter, wrap(async (req, res) => {
    res.status(201).json(await donations.create(req.body))
  }))
  router.get('/donations/:reference', wrap(async (req, res) => {
    res.json(await donations.get(clean(req.params.reference, 40)))
  }))
  router.post('/donations/:reference/claim', strictLimiter, wrap(async (req, res) => {
    res.json(await donations.claim(clean(req.params.reference, 40), req.body?.txHash))
  }))

  // ---- contact ----
  router.post('/contact', strictLimiter, wrap(async (req, res) => {
    const v = validateContact(req.body)
    if (!v.ok) throw new ApiError(400, 'validation_error', v.errors)
    await store.mutate((data) => {
      data.messages.push({ id: Date.now().toString(36), ...v.value, createdAt: new Date().toISOString() })
    })
    // TODO: forward to the Foundation's inbox (e.g. nodemailer / Resend / SendGrid).
    res.status(201).json({ ok: true })
  }))

  // ---- newsletter ----
  router.post('/newsletter', strictLimiter, wrap(async (req, res) => {
    const email = clean(req.body?.email, 254).toLowerCase()
    if (!isEmail(email)) throw new ApiError(400, 'validation_error', { email: 'invalid' })
    await store.mutate((data) => {
      if (!data.subscribers.some((s) => s.email === email)) {
        data.subscribers.push({ email, createdAt: new Date().toISOString() })
      }
    })
    res.status(201).json({ ok: true })
  }))

  // ---- admin (requires x-admin-key) ----
  const admin = Router()
  admin.use(adminAuth(config))
  admin.get('/donations', wrap(async (_req, res) => res.json(await donations.listAll())))
  admin.patch('/donations/:reference', wrap(async (req, res) => {
    res.json(await donations.setStatus(clean(req.params.reference, 40), req.body?.status))
  }))
  admin.get('/messages', wrap(async (_req, res) => res.json(await store.read((d) => [...d.messages].reverse()))))
  admin.get('/subscribers', wrap(async (_req, res) => res.json(await store.read((d) => d.subscribers))))
  router.use('/admin', admin)

  return router
}
