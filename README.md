# Blossoms Foundation — Backend API

Express API for the Blossoms Foundation website. It handles:

- **Donations in USDT** sent to your **Binance** deposit address, with a unique reference per donation and optional automatic verification through Binance's read-only API
- The **contact form** and **newsletter** sign-ups
- A small **admin API** to review donations and messages

## Run it

```bash
npm install
cp .env.example .env     # then fill in your Binance details
npm run dev              # http://localhost:4000
npm test                 # 25 unit tests
```

Then start the frontend (`blossoms-foundation`) with `VITE_API_URL=http://localhost:4000`.

## How a donation works

1. The donor picks country, language and an amount (in local currency; the minimum is the KSh 50 equivalent).
2. The frontend calls `POST /api/donations`. The server validates it, converts the amount to USDT using indicative rates, and creates a record with a unique reference such as `BLS-7K2M9QXD`.
3. The server returns the **payment panel data**: your Binance deposit address for the chosen network, the USDT amount, and the reference. The frontend shows it as a QR code plus copyable fields.
4. The donor sends USDT, then pastes the transaction ID (`POST /api/donations/:reference/claim`).
5. **Verification.** With a Binance API key configured, the server looks the transaction up in your deposit history and only marks the donation `confirmed` if the coin, network, address, credited status and amount all match. Without an API key, the donation stays `claimed` until you confirm it from the admin API after checking Binance yourself.

Statuses: `pending` → `claimed` → `confirmed` (or `rejected`). **A donation is never reported as received just because the donor says so.**

> This is not a new private-key wallet per donor. Generating and holding keys for every donor would make you the custodian of many wallets and a security liability. Instead every donor gets a unique reference and the payment is matched by transaction ID on your existing Binance account.

## Binance setup

**Option A (simplest):** in the Binance app go to *Wallet → Deposit → Crypto → USDT*, choose the **TRON (TRC20)** and **BNB Smart Chain (BEP20)** networks, and paste each address into `.env`:

```
BINANCE_USDT_TRC20_ADDRESS=...
BINANCE_USDT_BEP20_ADDRESS=...
BINANCE_PAY_ID=...        # optional: zero-fee option for tiny gifts
```

**Option B (recommended, enables auto-verification):** create a Binance API key and put it in `.env`:

- Permissions: **Enable Reading only**. Do **not** enable trading, withdrawals or transfers.
- Restrict access to your server's IP address.
- Never commit `.env`, and never paste the API secret into a chat, ticket or screenshot. If it leaks, delete the key in Binance immediately.

The Binance integration follows Binance's public docs and its HMAC signing is tested against the official example vector, but it has **not been run against the live Binance API** from this repository. Do a small real test deposit before launch.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/api/rates` | Indicative USD exchange rates |
| POST | `/api/donations` | Create a donation, returns wallet details + reference |
| GET | `/api/donations/:reference` | Status (re-checks Binance if `claimed`) |
| POST | `/api/donations/:reference/claim` | Body `{ "txHash": "..." }` |
| POST | `/api/contact` | Contact form |
| POST | `/api/newsletter` | Body `{ "email": "..." }` |
| GET | `/api/admin/donations` | List donations (needs `x-admin-key`) |
| PATCH | `/api/admin/donations/:reference` | Body `{ "status": "confirmed" \| "rejected" \| ... }` |
| GET | `/api/admin/messages`, `/api/admin/subscribers` | Review inbound data |

Errors are JSON: `{ "error": "validation_error", "details": { ... } }`. If no deposit address is configured the API answers `503 wallet_not_configured` rather than inventing one.

## Security built in

Helmet headers, CORS limited to `CORS_ORIGINS`, 20 KB body limit, rate limiting (stricter on write endpoints), input validation and sanitizing, constant-time admin key comparison, and public donation responses that never include the donor's email or phone.

## Known limitations (read before going live)

- **Network fees are paid by the sender.** A KSh 50 gift (about 0.39 USDT) is likely smaller than a TRC20 transfer fee. BEP20 is cheaper, and Binance Pay between Binance users has no fee. Consider whether you want a higher minimum via `MIN_DONATION_USDT`.
- **Monthly donations are a donor preference only.** Crypto can't be debited automatically, so donors must send again each month. Reminder emails are not implemented.
- **Exchange rates are static and indicative** (`src/services/rates.js`, mirrored in the frontend `countries.js`). Use a live rates source for accounting.
- **JSON file storage** (`data/db.json`) is fine to start with but not for multiple server instances. Move to PostgreSQL or MongoDB when needed, and back it up.
- **No email sending.** Contact messages and subscribers are saved and visible via the admin API; forwarding to an inbox (Resend, SendGrid, nodemailer) is a TODO in `src/routes/index.js`.
- Donors without crypto can't use this flow. Adding M-Pesa or card payments later would widen who can give.
- Crypto donation rules vary by country, and nonprofits often have record-keeping and receipting duties. Check local requirements.

## Layout

```
src/
  server.js            entry point
  app.js               Express app, security middleware
  config.js            environment config
  routes/index.js      HTTP routes
  services/            donations, binance, rates (no Express dependency)
  middleware/          admin auth, error handling
  utils/               validation, JSON store, errors
tests/                 node:test unit tests
```
