# GRAMVERTER

A real-time **crypto & fiat converter** web app. Convert any amount between
cryptocurrencies and fiat currencies using live market data.

> e.g. `0.024 BTC → USD`, `BTC → Naira (NGN)`, `ETH → BTC`, or `USD → NGN`.

## Features

- **Flexible, any-to-any conversion** — crypto→fiat, fiat→crypto, crypto→crypto
  and fiat→fiat, all from one interface.
- **Real-time prices** from the [CoinGecko](https://www.coingecko.com) public
  API (no API key required).
- **Top 100 cryptocurrencies** + 19 fiat currencies including the
  **Nigerian Naira (₦)**, USD, EUR, GBP, and more.
- **Live unit rate** display (`1 BTC = $65,000`), instant conversion as you
  type, one-tap **swap**, and **auto-refresh** every 60 seconds.
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
