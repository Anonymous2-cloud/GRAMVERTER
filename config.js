/* ===========================================================================
 * GRAMVERTER configuration
 *
 * In production the app fetches prices from the cached /api/prices endpoint,
 * which reads the CoinGecko key from the server env var COINGECKO_DEMO_KEY —
 * so the key normally does NOT need to be here.
 *
 * The key below is only used as a FALLBACK when /api/prices is unreachable
 * (e.g. opening the static files locally without the serverless function).
 * Create a free Demo key at:
 *
 *     https://www.coingecko.com/en/developers/dashboard
 *
 * NOTE: anything here is shipped to the browser and publicly visible. A Demo
 * key is designed for this and is safe to expose. NEVER put a paid/Pro key here.
 * ========================================================================= */
window.GRAMVERTER_CONFIG = {
  coingeckoDemoKey: "CG-xzSieJULQYbPhaovUvwJU9gK",
};
