/* ===========================================================================
 * GRAMVERTER — real-time crypto & fiat converter
 *
 * Strategy: price every supported asset (crypto or fiat) in a common base
 * (USD). With a USD value for one unit of each asset, ANY pair converts via:
 *
 *     amountTo = amountFrom * (usdValue[from] / usdValue[to])
 *
 * This single formula handles all four directions out of the box:
 *   crypto → fiat, fiat → crypto, crypto → crypto, and fiat → fiat.
 *
 * Data source: CoinGecko public API (no key required, CORS-enabled).
 * ========================================================================= */

const API = "https://api.coingecko.com/api/v3";

// Curated list of fiat currencies (CoinGecko vs_currencies), Naira included.
const FIATS = [
  { code: "usd", name: "US Dollar", symbol: "$" },
  { code: "ngn", name: "Nigerian Naira", symbol: "₦" },
  { code: "eur", name: "Euro", symbol: "€" },
  { code: "gbp", name: "British Pound", symbol: "£" },
  { code: "jpy", name: "Japanese Yen", symbol: "¥" },
  { code: "cny", name: "Chinese Yuan", symbol: "¥" },
  { code: "inr", name: "Indian Rupee", symbol: "₹" },
  { code: "cad", name: "Canadian Dollar", symbol: "$" },
  { code: "aud", name: "Australian Dollar", symbol: "$" },
  { code: "chf", name: "Swiss Franc", symbol: "Fr" },
  { code: "zar", name: "South African Rand", symbol: "R" },
  { code: "ghs", name: "Ghanaian Cedi", symbol: "₵" },
  { code: "kes", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "brl", name: "Brazilian Real", symbol: "R$" },
  { code: "rub", name: "Russian Ruble", symbol: "₽" },
  { code: "krw", name: "South Korean Won", symbol: "₩" },
  { code: "aed", name: "UAE Dirham", symbol: "د.إ" },
  { code: "try", name: "Turkish Lira", symbol: "₺" },
  { code: "mxn", name: "Mexican Peso", symbol: "$" },
];

// How many top coins (by market cap) to load for the crypto dropdown.
const TOP_COINS = 100;

// Auto-refresh interval for live prices.
const REFRESH_MS = 60_000;

/* --------------------------------------------------------------------------
 * State
 * ------------------------------------------------------------------------ */
const state = {
  // assetId -> { id, type: 'crypto'|'fiat', symbol, name, usdValue }
  assets: new Map(),
  cryptos: [],
  loaded: false,
};

/* --------------------------------------------------------------------------
 * DOM
 * ------------------------------------------------------------------------ */
const el = {
  amount: document.getElementById("amount"),
  result: document.getElementById("result"),
  from: document.getElementById("from"),
  to: document.getElementById("to"),
  swap: document.getElementById("swap"),
  rate: document.getElementById("rate"),
  updated: document.getElementById("updated"),
  refresh: document.getElementById("refresh"),
};

/* --------------------------------------------------------------------------
 * Data fetching
 * ------------------------------------------------------------------------ */
async function fetchJSON(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

// Load top cryptos (with USD prices) + derive fiat USD values from BTC pricing.
async function loadMarketData() {
  const fiatCodes = FIATS.map((f) => f.code).join(",");

  const [coins, btc] = await Promise.all([
    fetchJSON(
      `${API}/coins/markets?vs_currency=usd&order=market_cap_desc` +
        `&per_page=${TOP_COINS}&page=1&sparkline=false`
    ),
    // BTC priced in every fiat lets us back out each fiat's USD value.
    fetchJSON(`${API}/simple/price?ids=bitcoin&vs_currencies=${fiatCodes}`),
  ]);

  const assets = new Map();
  const cryptos = [];

  // --- Cryptocurrencies: USD value is simply current_price in USD. ---
  for (const c of coins) {
    if (!c.current_price) continue;
    const asset = {
      id: c.id,
      type: "crypto",
      symbol: (c.symbol || "").toUpperCase(),
      name: c.name,
      usdValue: c.current_price, // USD per 1 unit
    };
    assets.set(c.id, asset);
    cryptos.push(asset);
  }

  // --- Fiats: BTC costs `btcInUsd` USD and `btcInFiat` of the fiat, so
  //     1 fiat = btcInUsd / btcInFiat USD. ---
  const btcInUsd = state.assets.get("bitcoin")?.usdValue || coinUsd(coins, "bitcoin");
  for (const f of FIATS) {
    const btcInFiat = btc?.bitcoin?.[f.code];
    if (!btcInFiat) continue;
    const usdValue = f.code === "usd" ? 1 : btcInUsd / btcInFiat;
    assets.set(`fiat:${f.code}`, {
      id: `fiat:${f.code}`,
      type: "fiat",
      symbol: f.symbol,
      name: f.name,
      code: f.code,
      usdValue,
    });
  }

  state.assets = assets;
  state.cryptos = cryptos;
  state.loaded = true;
}

function coinUsd(coins, id) {
  const c = coins.find((x) => x.id === id);
  return c ? c.current_price : 1;
}

/* --------------------------------------------------------------------------
 * UI population
 * ------------------------------------------------------------------------ */
function buildOptions() {
  const cryptoGroup = document.createElement("optgroup");
  cryptoGroup.label = "Cryptocurrency";
  for (const c of state.cryptos) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = `${c.symbol} — ${c.name}`;
    cryptoGroup.appendChild(o);
  }

  const fiatGroup = document.createElement("optgroup");
  fiatGroup.label = "Fiat currency";
  for (const f of FIATS) {
    const o = document.createElement("option");
    o.value = `fiat:${f.code}`;
    o.textContent = `${f.code.toUpperCase()} — ${f.name}`;
    fiatGroup.appendChild(o);
  }

  for (const sel of [el.from, el.to]) {
    sel.innerHTML = "";
    sel.appendChild(cryptoGroup.cloneNode(true));
    sel.appendChild(fiatGroup.cloneNode(true));
  }

  // Sensible defaults: BTC → USD.
  el.from.value = "bitcoin";
  el.to.value = "fiat:usd";
}

/* --------------------------------------------------------------------------
 * Conversion + formatting
 * ------------------------------------------------------------------------ */
function parseAmount(raw) {
  if (typeof raw !== "string") return NaN;
  // Allow commas as thousands separators.
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return NaN;
  return Number(cleaned);
}

function convert(amount, fromId, toId) {
  const from = state.assets.get(fromId);
  const to = state.assets.get(toId);
  if (!from || !to) return null;
  return amount * (from.usdValue / to.usdValue);
}

// Format a value with precision appropriate to its magnitude / asset type.
function formatValue(value, asset) {
  if (!isFinite(value)) return "—";
  const isFiat = asset?.type === "fiat";

  let decimals;
  if (isFiat) {
    decimals = value !== 0 && Math.abs(value) < 1 ? 4 : 2;
  } else {
    const abs = Math.abs(value);
    if (abs === 0) decimals = 2;
    else if (abs >= 1000) decimals = 2;
    else if (abs >= 1) decimals = 4;
    else if (abs >= 0.0001) decimals = 8;
    else decimals = 10;
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function assetLabel(asset) {
  if (!asset) return "";
  return asset.type === "fiat" ? asset.code.toUpperCase() : asset.symbol;
}

/* --------------------------------------------------------------------------
 * Render
 * ------------------------------------------------------------------------ */
function render() {
  if (!state.loaded) return;

  const amount = parseAmount(el.amount.value);
  const fromId = el.from.value;
  const toId = el.to.value;
  const from = state.assets.get(fromId);
  const to = state.assets.get(toId);

  if (isNaN(amount)) {
    el.result.value = "—";
    el.rate.textContent = "Enter an amount to convert";
    el.rate.classList.remove("error");
    return;
  }

  const out = convert(amount, fromId, toId);
  el.result.value = formatValue(out, to);

  // Unit rate line: 1 FROM = X TO
  const unit = convert(1, fromId, toId);
  el.rate.classList.remove("error");
  el.rate.innerHTML =
    `<strong>1 ${assetLabel(from)}</strong> = ` +
    `<strong>${formatValue(unit, to)} ${assetLabel(to)}</strong>`;
}

function setUpdatedNow() {
  const t = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  el.updated.textContent = `Updated ${t}`;
}

/* --------------------------------------------------------------------------
 * Refresh flow
 * ------------------------------------------------------------------------ */
let refreshing = false;

async function refresh(isInitial = false) {
  if (refreshing) return;
  refreshing = true;
  el.refresh.classList.add("spinning");

  try {
    await loadMarketData();
    if (isInitial) {
      buildOptions();
    }
    render();
    setUpdatedNow();
  } catch (err) {
    console.error(err);
    el.rate.classList.add("error");
    el.rate.textContent =
      "Couldn't reach live prices. Check your connection and tap Refresh.";
    if (isInitial) el.updated.textContent = "Offline";
  } finally {
    refreshing = false;
    // Let the spin finish a full rotation before stopping.
    setTimeout(() => el.refresh.classList.remove("spinning"), 600);
  }
}

/* --------------------------------------------------------------------------
 * Events
 * ------------------------------------------------------------------------ */
el.amount.addEventListener("input", render);
el.from.addEventListener("change", render);
el.to.addEventListener("change", render);

el.swap.addEventListener("click", () => {
  const f = el.from.value;
  el.from.value = el.to.value;
  el.to.value = f;
  render();
});

el.refresh.addEventListener("click", () => refresh(false));

// Sanitize input to a single decimal number (allow digits, one dot, commas).
el.amount.addEventListener("input", (e) => {
  const cleaned = e.target.value.replace(/[^\d.,]/g, "");
  if (cleaned !== e.target.value) e.target.value = cleaned;
});

/* --------------------------------------------------------------------------
 * Init
 * ------------------------------------------------------------------------ */
refresh(true);
setInterval(() => refresh(false), REFRESH_MS);
