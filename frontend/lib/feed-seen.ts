const SEEN_KEY = "jey.feed-seen";
export const FEED_SEEN_EVENT = "jey:feed-seen";

export function feedSeenCutoff(): number {
  if (typeof localStorage === "undefined") return 0;
  const seen = localStorage.getItem(SEEN_KEY);
  if (!seen) return 0;
  const value = new Date(seen).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function markFeedSeen(uptoTimestamp?: number) {
  // Use the newest server timestamp from the loaded page, not the client
  // clock: a small clock skew used to leave every fetched card "unread".
  const cutoff = uptoTimestamp && Number.isFinite(uptoTimestamp) ? uptoTimestamp : Date.now();
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(SEEN_KEY, new Date(cutoff).toISOString());
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FEED_SEEN_EVENT));
  }
}
