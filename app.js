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

// Optional free CoinGecko Demo API key (set in config.js). When present it is
// sent as the `x-cg-demo-api-key` header, moving us off the heavily-throttled
// shared public pool onto a stable ~30 calls/min limit.
const DEMO_KEY =
  (typeof window !== "undefined" &&
    window.GRAMVERTER_CONFIG &&
    window.GRAMVERTER_CONFIG.coingeckoDemoKey) ||
  "";

// Network retry policy for transient failures (429 rate-limit, 5xx, dropouts).
const MAX_RETRIES = 3;

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

// Extra coins (CoinGecko ids) to always include even if outside the top 100.
const EXTRA_COINS = ["sei-network"];

// Auto-refresh interval for live prices. Kept conservative to stay well under
// the rate limit even with multiple open tabs.
const REFRESH_MS = 90_000;

/* --------------------------------------------------------------------------
 * State
 * ------------------------------------------------------------------------ */
const state = {
  // assetId -> { id, type: 'crypto'|'fiat', symbol, name, usdValue }
  assets: new Map(),
  cryptos: [],
  loaded: false,
  lastUpdated: null, // Date of the last successful price load
};

/* --------------------------------------------------------------------------
 * DOM
 * ------------------------------------------------------------------------ */
const el = {
  amount: document.getElementById("amount"),
  result: document.getElementById("result"),
  swap: document.getElementById("swap"),
  rate: document.getElementById("rate"),
  updated: document.getElementById("updated"),
  refresh: document.getElementById("refresh"),
};

/* --------------------------------------------------------------------------
 * Data fetching
 * ------------------------------------------------------------------------ */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Errors worth retrying (rate limits, server hiccups, network drops).
class RetryableError extends Error {}

function apiHeaders() {
  const headers = { accept: "application/json" };
  if (DEMO_KEY) headers["x-cg-demo-api-key"] = DEMO_KEY;
  return headers;
}

// Fetch JSON with exponential backoff on transient failures. A 429 (rate
// limit) or 5xx is retried after 1s, 2s, 4s before finally giving up.
async function fetchJSON(url, attempt = 0) {
  try {
    const res = await fetch(url, { headers: apiHeaders() });
    if (res.status === 429 || res.status >= 500) {
      throw new RetryableError(`Temporary error (${res.status})`);
    }
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return await res.json();
  } catch (err) {
    // TypeError from fetch === network failure (also retryable).
    const retryable = err instanceof RetryableError || err instanceof TypeError;
    if (retryable && attempt < MAX_RETRIES) {
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
      return fetchJSON(url, attempt + 1);
    }
    throw err;
  }
}

// Load top cryptos (with USD prices) + derive fiat USD values from BTC pricing.
async function loadMarketData() {
  const fiatCodes = FIATS.map((f) => f.code).join(",");

  const requests = [
    fetchJSON(
      `${API}/coins/markets?vs_currency=usd&order=market_cap_desc` +
        `&per_page=${TOP_COINS}&page=1&sparkline=false`
    ),
    // BTC priced in every fiat lets us back out each fiat's USD value.
    fetchJSON(`${API}/simple/price?ids=bitcoin&vs_currencies=${fiatCodes}`),
  ];
  // Pull in any extra coins that sit outside the top 100 (e.g. SEI).
  if (EXTRA_COINS.length) {
    requests.push(
      fetchJSON(
        `${API}/coins/markets?vs_currency=usd&ids=${EXTRA_COINS.join(",")}&sparkline=false`
      )
    );
  }

  const [topCoins, btc, extraCoins = []] = await Promise.all(requests);

  // Merge top coins with extras, de-duped by id (top-100 order preserved).
  const seen = new Set(topCoins.map((c) => c.id));
  const coins = topCoins.concat(extraCoins.filter((c) => !seen.has(c.id)));

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
  const btcInUsd = coinUsd(coins, "bitcoin");
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
 * Searchable combobox component
 *
 * A custom dropdown (button + searchable, grouped, keyboard-navigable list)
 * that replaces the native <select>. Exposes a `.value` get/set + `onChange`
 * callback so the rest of the app stays decoupled from the widget internals.
 * ------------------------------------------------------------------------ */
class Combobox {
  constructor(root, onChange) {
    this.root = root;
    this.onChange = onChange;
    this.button = root.querySelector(".combo__button");
    this.labelEl = root.querySelector(".combo__label");
    this.pop = root.querySelector(".combo__pop");
    this.search = root.querySelector(".combo__search");
    this.list = root.querySelector(".combo__list");
    this.items = []; // [{ id, group, sym, name, search }]
    this.filtered = [];
    this.activeIndex = -1;
    this._value = null;
    this._wire();
  }

  setItems(items) {
    this.items = items;
    if (this.isOpen) this._renderList(this.search.value);
  }

  get value() {
    return this._value;
  }
  set value(id) {
    this._value = id;
    const it = this.items.find((i) => i.id === id);
    this.labelEl.textContent = it ? it.sym : "Select";
  }

  get isOpen() {
    return !this.pop.hidden;
  }

  open() {
    if (this.isOpen) return;
    this.pop.hidden = false;
    this.root.classList.add("combo--open");
    this.button.setAttribute("aria-expanded", "true");
    this.search.value = "";
    this._renderList("");
    this.search.focus();
  }

  close() {
    if (!this.isOpen) return;
    this.pop.hidden = true;
    this.root.classList.remove("combo--open");
    this.button.setAttribute("aria-expanded", "false");
    this.activeIndex = -1;
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  select(id) {
    this.value = id;
    this.close();
    this.button.focus();
    this.onChange();
  }

  _renderList(query) {
    const q = query.trim().toLowerCase();
    this.filtered = q
      ? this.items.filter((i) => i.search.includes(q))
      : this.items.slice();

    this.list.innerHTML = "";
    if (this.filtered.length === 0) {
      const empty = document.createElement("li");
      empty.className = "combo__empty";
      empty.textContent = "No tokens found";
      this.list.appendChild(empty);
      this.activeIndex = -1;
      return;
    }

    let lastGroup = null;
    this.filtered.forEach((it, idx) => {
      if (it.group !== lastGroup) {
        lastGroup = it.group;
        const h = document.createElement("li");
        h.className = "combo__group";
        h.textContent = it.group;
        this.list.appendChild(h);
      }
      const li = document.createElement("li");
      li.className = "combo__option";
      li.setAttribute("role", "option");
      li.dataset.index = String(idx);
      if (it.id === this._value) li.classList.add("is-selected");
      li.innerHTML = `<span class="sym">${it.sym}</span><span class="nm">${it.name}</span>`;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus; fire before blur closes the pop
        this.select(it.id);
      });
      this.list.appendChild(li);
    });

    // Highlight the first real result for quick Enter-to-select.
    this.activeIndex = 0;
    this._paintActive();
  }

  _optionEls() {
    return Array.from(this.list.querySelectorAll(".combo__option"));
  }

  _paintActive() {
    const opts = this._optionEls();
    opts.forEach((o) => o.classList.remove("is-active"));
    const active = opts[this.activeIndex];
    if (active) active.scrollIntoView({ block: "nearest" });
    if (active) active.classList.add("is-active");
  }

  _move(delta) {
    const opts = this._optionEls();
    if (!opts.length) return;
    this.activeIndex = (this.activeIndex + delta + opts.length) % opts.length;
    this._paintActive();
  }

  _commitActive() {
    const active = this._optionEls()[this.activeIndex];
    if (!active) return;
    const it = this.filtered[Number(active.dataset.index)];
    if (it) this.select(it.id);
  }

  _wire() {
    this.button.addEventListener("click", () => this.toggle());

    this.search.addEventListener("input", () => this._renderList(this.search.value));

    this.search.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "ArrowDown": e.preventDefault(); this._move(1); break;
        case "ArrowUp": e.preventDefault(); this._move(-1); break;
        case "Enter": e.preventDefault(); this._commitActive(); break;
        case "Escape": e.preventDefault(); this.close(); this.button.focus(); break;
      }
    });

    // Close when focus/click leaves the whole component.
    document.addEventListener("click", (e) => {
      if (!this.root.contains(e.target)) this.close();
    });
  }
}

// Build the unified, grouped item list (cryptos first, then fiats).
function buildComboItems() {
  const items = [];
  for (const c of state.cryptos) {
    items.push({
      id: c.id,
      group: "Cryptocurrency",
      sym: c.symbol,
      name: c.name,
      search: `${c.symbol} ${c.name} ${c.id}`.toLowerCase(),
    });
  }
  for (const f of FIATS) {
    items.push({
      id: `fiat:${f.code}`,
      group: "Fiat currency",
      sym: f.code.toUpperCase(),
      name: f.name,
      search: `${f.code} ${f.name}`.toLowerCase(),
    });
  }
  return items;
}

const comboFrom = new Combobox(document.getElementById("combo-from"), () => render());
const comboTo = new Combobox(document.getElementById("combo-to"), () => render());

function buildOptions() {
  const items = buildComboItems();
  comboFrom.setItems(items);
  comboTo.setItems(items);
  // Sensible defaults: BTC → USD.
  comboFrom.value = "bitcoin";
  comboTo.value = "fiat:usd";
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
  const fromId = comboFrom.value;
  const toId = comboTo.value;
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

function setUpdated(date, stale) {
  const t = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  el.updated.textContent = stale ? `Delayed · last good ${t}` : `Updated ${t}`;
  el.updated.classList.toggle("status__updated--stale", !!stale);
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
    state.lastUpdated = new Date();
    render();
    setUpdated(state.lastUpdated, false);
  } catch (err) {
    console.error(err);
    if (state.loaded && state.lastUpdated) {
      // We already have prices — keep showing them rather than blanking out.
      render();
      setUpdated(state.lastUpdated, true);
    } else {
      // First load never succeeded; nothing to show yet.
      el.rate.classList.add("error");
      el.rate.textContent =
        "Couldn't reach live prices (rate-limited or offline). Retrying…";
      el.updated.textContent = "Offline";
    }
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

el.swap.addEventListener("click", () => {
  const f = comboFrom.value;
  comboFrom.value = comboTo.value;
  comboTo.value = f;
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
