/**
 * Simple in-process TTL cache — no Redis required.
 * Keys are namespaced (e.g. "devices:user:42") so we can invalidate by prefix.
 */
interface CacheEntry {
  data: unknown;
  expires: number;
}

class CacheService {
  private store = new Map<string, CacheEntry>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set(key: string, data: unknown, ttlMs: number = 30_000): void {
    this.store.set(key, { data, expires: Date.now() + ttlMs });
  }

  /** Delete all keys that start with the given prefix */
  invalidate(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  del(key: string): void {
    this.store.delete(key);
  }

  size(): number {
    return this.store.size;
  }
}

export const cache = new CacheService();
