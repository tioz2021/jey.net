const cache = new Map<string, unknown>();

export function getPageCache<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function setPageCache<T>(key: string, value: T) {
  cache.set(key, value);
}
