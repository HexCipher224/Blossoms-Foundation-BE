export class ApiError extends Error {
  constructor(status, code, details) {
    super(code)
    this.status = status
    this.code = code
    this.details = details
  }
}
