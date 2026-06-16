/**
 * GRAMVERTER price API — a thin, cached proxy in front of CoinGecko.
 *
 * Why: instead of every visitor's browser calling CoinGecko (which would burn
 * through the Demo key's monthly quota as traffic grows), this single endpoint
 * fetches prices and is cached on Vercel's Edge Network. All visitors are
 * served from that shared cache, so CoinGecko is hit at most once per cache
 * window — keeping monthly usage flat regardless of how many people visit.
 *
 * The CoinGecko Demo key lives server-side here (env var COINGECKO_DEMO_KEY),
 * so it never has to ship in client code.
 */

const API = "https://api.coingecko.com/api/v3";
const TOP_COINS = 250;
const EXTRA_COINS = ["sei-network"]; // always include, even if outside top 250
const FIAT_CODES =
  "usd,ngn,eur,gbp,jpy,cny,inr,cad,aud,chf,zar,ghs,kes,brl,rub,krw,aed,try,mxn";

function cgHeaders() {
  const headers = { accept: "application/json" };
  const key = process.env.COINGECKO_DEMO_KEY;
  if (key) headers["x-cg-demo-api-key"] = key;
  return headers;
}

async function cg(path) {
  const res = await fetch(`${API}${path}`, { headers: cgHeaders() });
  if (!res.ok) throw new Error(`CoinGecko responded ${res.status}`);
  return res.json();
}

module.exports = async (req, res) => {
  try {
    const [coins, btc] = await Promise.all([
      cg(
        `/coins/markets?vs_currency=usd&order=market_cap_desc` +
          `&per_page=${TOP_COINS}&page=1&sparkline=false`
      ),
      cg(`/simple/price?ids=bitcoin&vs_currencies=${FIAT_CODES}`),
    ]);

    // Pull in any extra coins not already covered by the top list.
    const seen = new Set(coins.map((c) => c.id));
    const missing = EXTRA_COINS.filter((id) => !seen.has(id));
    let extra = [];
    if (missing.length) {
      extra = await cg(
        `/coins/markets?vs_currency=usd&ids=${missing.join(",")}&sparkline=false`
      );
    }

    // Slim the payload down to just what the client needs.
    const slim = coins
      .concat(extra)
      .filter((c) => c && c.current_price)
      .map((c) => ({
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        current_price: c.current_price,
      }));

    // Cache on the Edge: fresh for 2 min, then serve stale up to 10 min while
    // revalidating in the background.
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=600"
    );
    res.status(200).json({ coins: slim, btc, updatedAt: Date.now() });
  } catch (err) {
    res.status(502).json({ error: String((err && err.message) || err) });
  }
};
