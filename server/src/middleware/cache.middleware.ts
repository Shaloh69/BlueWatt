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
 * Call this after any write (POST / PUT / DELETE) to drop stale cache
 * entries for the given namespace and user.
 *
 * @param namespace  e.g. 'devices', 'pads', 'billing'
 * @param userId     req.user.id
 */
export function bustCache(namespace: string, userId: number | string): void {
  cache.invalidate(`${namespace}:user:${userId}:`);
}
