# GRAMVERTER

A real-time **crypto & fiat converter** web app. Convert any amount between
cryptocurrencies and fiat currencies using live market data.

> e.g. `0.024 BTC → USD`, `BTC → Naira (NGN)`, `ETH → BTC`, or `USD → NGN`.

## Features

- **Flexible, any-to-any conversion** — crypto→fiat, fiat→crypto, crypto→crypto
  and fiat→fiat, all from one interface.
- **Real-time prices** from the [CoinGecko](https://www.coingecko.com) public
  API (no API key required).
- **Top 250 cryptocurrencies** (plus hand-picked extras like SEI) + 19 fiat
  currencies including the **Nigerian Naira (₦)**, USD, EUR, GBP, and more.
- **Live unit rate** display (`1 BTC = $65,000`), instant conversion as you
  type, one-tap **swap**, and **auto-refresh** every 2 minutes.
- **Zero dependencies / no build step** — just plain HTML, CSS, and JavaScript.

## How it works

Every supported asset is priced in a common base currency (USD). With a USD
value for one unit of each asset, any pair converts through a single formula:

```
amountTo = amountFrom × (usdValue[from] / usdValue[to])
```

- **Cryptos** get their USD value directly from CoinGecko market data.
- **Fiats** are derived from Bitcoin's price: since BTC costs a known amount in
  both USD and each fiat, we back out each fiat's USD value.

This keeps all four conversion directions working from the same code path.

## Rate limits & resilience

The app uses CoinGecko's API. The **no-key public pool is throttled to ~5–15
calls/min** and shared, so it can intermittently return `429 Too Many Requests`.
GRAMVERTER handles this gracefully:

- **Optional Demo API key** — paste a free CoinGecko Demo key into `config.js`
  to get a stable ~30 calls/min (10,000/month). Get one at the
  [CoinGecko developer dashboard](https://www.coingecko.com/en/developers/dashboard).
- **Retry with backoff** — transient `429`/`5xx`/network errors are retried
  automatically (1s → 2s → 4s).
- **Stale-on-error** — if a refresh fails, the last good prices stay on screen
  with a "Delayed" indicator instead of going blank.
- Auto-refresh runs every 2 minutes (a small handful of calls per cycle).

> The Demo key in `config.js` is shipped to the browser and therefore public —
> that's expected for a Demo key. Never put a paid/Pro key in front-end code.

## Run locally

It's a static site, so any static file server works. For example:

```bash
# Python
python3 -m http.server 8000

# or Node
npx serve .
```

Then open <http://localhost:8000>. (Opening `index.html` directly also works in
most browsers since the CoinGecko API is CORS-enabled.)

## Deploy

Push to a GitHub repository and enable **GitHub Pages** (Settings → Pages →
deploy from branch). No configuration needed — the app is fully static.

## Tech

- HTML / CSS / vanilla JavaScript
- [CoinGecko API](https://www.coingecko.com/en/api) for live prices

---

_Prices are for reference only and may be delayed. Not financial advice._
