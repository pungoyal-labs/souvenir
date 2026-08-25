// The day's exchange rate, for settling the whole trip at home.
//
// Public data, fetched by the server and cached in memory for an hour: the
// provider publishes once a day, and a bills page opened twice in a minute
// should not ask twice. The request names two currencies and nothing else —
// no trip, no member, no amount — so nothing sealed goes anywhere. When the
// provider is down the page still works; it just settles each currency on its
// own, the way it did before there was a rate.

import { env } from "./env.ts";
import { type FxRate, parseRate } from "./fx.ts";
import { logger } from "./logger.ts";
import type { Currency } from "./split.ts";

const FRESH_MS = 60 * 60 * 1000;
/** How long a failed fetch is remembered, so a dead provider doesn't slow every page. */
const RETRY_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 5_000;

const cache = new Map<string, { until: number; rate: FxRate | null }>();

/** One unit of `from` in `to`, today, or null when nobody can say. */
export async function latestRate(from: Currency, to: Currency): Promise<FxRate | null> {
  const key = `${from}/${to}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.until > now) return hit.rate;

  try {
    const base = env.FX_BASE_URL.replace(/\/+$/, "");
    const response = await fetch(`${base}/v1/currencies/${from}.min.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const rate = parseRate(await response.json(), from, to);
    if (!rate) throw new Error("no rate in the response");
    cache.set(key, { until: now + FRESH_MS, rate });
    return rate;
  } catch (err) {
    logger.warn({ err, from, to }, "fx rate unavailable");
    // A stale rate beats none for the hour it takes the provider to come back.
    const stale = hit?.rate ?? null;
    cache.set(key, { until: now + RETRY_MS, rate: stale });
    return stale;
  }
}
