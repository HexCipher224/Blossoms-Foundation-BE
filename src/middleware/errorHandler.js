import { ApiError } from '../utils/errors.js'

export function notFound(_req, _res, next) {
  next(new ApiError(404, 'not_found'))
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.code, ...(err.details ? { details: err.details } : {}) })
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' })
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' })
  console.error(err)
  return res.status(500).json({ error: 'internal_error' })
}
