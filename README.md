# Gold Arbitrage Dashboard

A monitor for the physical gold spread between **London spot**, **Hong Kong**
and **Japan** — the leg prices, the FX legs, and what's actually left after
freight and dealer discounts.

Built because the interesting number in this trade is never the headline gold
price. It's what survives two bid/ask crossings, two currency conversions, a
dealer's buy-back discount and a shipping invoice.

## The trades it prices

**Hong Kong → Japan.** Buy bullion against London spot, ship it to Japan, sell
to Tanaka. Inputs are the size in kg, the freight bill in HKD, and the
discount the dealer will take off their published bid.

```
cost      = kg × 32.1507466 oz/kg × London ask        (USD)
          + freight HKD × HKD/USD bid                  (USD)
revenue   = kg × 1000g × (Tanaka bid − discount)       (JPY)
          × JPY/USD bid                                (USD)
P&L       = revenue − cost
```

**Within Japan.** The dealer's own buy/sell spread against the Tanaka
reference, with sundry costs enterable in JPY, USD or HKD.

**USDT leg.** The settlement quote plus your spread, for when the trade is
funded or repatriated in stablecoin rather than through a bank.

## Why the price selection matters

Every leg crosses the spread in the direction that costs you:

| Leg | Price used | Reason |
|---|---|---|
| Buying gold | London **ask** | You lift the offer |
| Selling gold | Tanaka **bid**, minus dealer discount | You hit their bid, and they discount it further |
| HKD → USD | **bid** | You're selling HKD |
| JPY → USD | **bid** | You're selling JPY |

Using mid prices makes almost any size of this trade look profitable. It
isn't. Kilogram-scale positions live or die on exactly these four crossings
plus freight, which is why they're all separate inputs rather than a single
fudge factor.

The gram/ounce boundary is the other place this goes wrong quietly: London
quotes per troy ounce, Tanaka quotes per gram. The conversion constant is
`32.1507466 oz/kg`, applied once, at the leg boundary.

## Data sources

| Source | Provides |
|---|---|
| [Swissquote](https://forex-data-feed.swissquote.com) | London spot gold, HKD/USD, JPY/USD — with bid/ask spread profiles |
| [Tanaka Kikinzoku](https://gold.tanaka.co.jp) | Japanese retail gold reference, JPY per gram |
| Google Finance | USDT reference rate |

## Running it

```bash
node server.js          # http://localhost:3000
```

Or deploy to Vercel — `api/proxy.js` is the same proxy as a serverless
function, and the rest is static.

No build step, no dependencies, no API keys. The UI is in Traditional Chinese.

### The proxy

The browser can't call these upstreams directly because of CORS, so both
`server.js` and `api/proxy.js` forward for it. Both check the target against
one fixed allowlist:

```js
const ALLOW_HOSTS = new Set([
  "forex-data-feed.swissquote.com",
  "gold.tanaka.co.jp",
  "www.google.com",
]);
```

An open proxy becomes an abuse liability the moment it is reachable, so this
is deny-by-default on every request — an unlisted host is refused whether or
not it looks suspicious:

```console
$ curl 'localhost:3000/api/proxy?url=https://evil.example.com'
{"error":"target not allowed"}
```

## Scope

This is a **pricing monitor, not an execution system.** It tells you whether a
spread is worth acting on; it does not place, hedge or settle anything.

Prices are indicative and quoted for retail-visible sources. Real execution at
size gets different levels, and the assay, insurance, customs and counterparty
terms that decide whether the trade is actually available are not modelled
here.

## License

MIT
