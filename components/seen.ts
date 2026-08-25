// Which predictions this phone has opened, for the For-you rail's "unseen" nudge. Per phone
// and per trip, in localStorage: a view is a fact about this screen, not about the trip, so
// it never goes in the log.

const key = (tripId: string) => `seen:${tripId}`;

export function seenMarkets(tripId: string): Set<string> {
  try {
    const raw = localStorage.getItem(key(tripId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markMarketSeen(tripId: string, marketId: string): void {
  try {
    const seen = seenMarkets(tripId);
    if (seen.has(marketId)) return;
    seen.add(marketId);
    localStorage.setItem(key(tripId), JSON.stringify([...seen]));
  } catch {
    // No storage: the rail just never learns what was opened.
  }
}
