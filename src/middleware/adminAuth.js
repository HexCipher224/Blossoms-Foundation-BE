import crypto from 'node:crypto'
import { ApiError } from '../utils/errors.js'

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest()

export function adminAuth(config) {
  return (req, _res, next) => {
    if (!config.adminApiKey) return next(new ApiError(404, 'not_found')) // admin disabled
    const provided = req.get('x-admin-key') || ''
    const ok = crypto.timingSafeEqual(digest(provided), digest(config.adminApiKey))
    return ok ? next() : next(new ApiError(401, 'unauthorized'))
  }
}
