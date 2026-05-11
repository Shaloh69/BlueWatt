import { Request, Response, NextFunction } from 'express';
import { cache } from '../services/cache.service';

/**
 * Express middleware that caches GET responses per-user in memory.
 *
 * Usage:
 *   router.get('/', authenticateJWT, cacheFor(30), handler);
 *
 * @param ttlSeconds  How long to cache the response (default 30 s)
 * @param namespace   Optional prefix to group related cache entries.
 *                    Defaults to the base path of the route.
 */
export function cacheFor(ttlSeconds: number = 30, namespace?: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      next();
      return;
    }

    const userId = req.user?.id ?? 'anon';
    const ns = namespace ?? req.path.split('/')[1] ?? 'misc';
    const key = `${ns}:user:${userId}:${req.originalUrl}`;

    const cached = cache.get<object>(key);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json(cached);
      return;
    }

    // Monkey-patch res.json to capture and store the response
    const originalJson = res.json.bind(res);
    res.json = (body: object) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, body, ttlSeconds * 1000);
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

/**
 * Drop cache entries for a specific user in a namespace.
 * Use when only the acting user's view needs refreshing.
 */
export function bustCache(namespace: string, userId: number | string): void {
  cache.invalidate(`${namespace}:user:${userId}:`);
}

/**
 * Drop ALL cache entries for a namespace across every user.
 * Use after admin writes that affect data visible to multiple users
 * (e.g. pad assignments that tenants see in /pads/my).
 */
export function bustCacheAll(namespace: string): void {
  cache.invalidate(`${namespace}:`);
}
