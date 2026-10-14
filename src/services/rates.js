// Indicative exchange rates: units of currency per 1 USD.
// Keep in sync with blossoms-foundation/src/i18n/countries.js.
// Donations are settled in USDT (a USD-pegged stablecoin), so USDT ~= USD.
// Replace with a live rates provider before relying on this for accounting.
export const RATES_PER_USD = {
  KES: 129, UGX: 3650, TZS: 2650, RWF: 1450, ETB: 140, NGN: 1500, GHS: 12, ZAR: 18,
  USD: 1, CAD: 1.37, GBP: 0.78, EUR: 0.92, AUD: 1.5, INR: 85, AED: 3.67,
}

export function toUsdt(amount, currency, rates = RATES_PER_USD) {
  const rate = rates[currency]
  if (!rate) return null
  return Math.round((Number(amount) / rate) * 100) / 100
}
