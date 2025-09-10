import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

const VERSION_KEY = 'pdfs:cacheVersion';

// Récupère la version globale du cache (init à 1 au besoin)
export async function getCacheVersion() {
  let v = await redis.get(VERSION_KEY);
  if (!v) { await redis.set(VERSION_KEY, '1'); v = '1'; }
  return v;
}

// Incrémente la version => invalide tous les anciens caches
export async function bumpCacheVersion() {
  await redis.incr(VERSION_KEY);
}

// Construit une clé : route + query triée + version
function buildCanonicalKeyFromReq(req, version) {
  const route = (req.baseUrl ?? '') + (req.path ?? '');
  const entries = Object.entries(req.query ?? {}).map(([k, v]) => [k, String(v)]);
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const qs = new URLSearchParams(entries).toString();
  return `pdfs:v${version}:${route}${qs ? `?${qs}` : ''}`;
}

export async function makeCacheKey(req) {
  const v = await getCacheVersion();
  return buildCanonicalKeyFromReq(req, v);
}

// Middleware de lecture : si existant dans le cache : renvoie le JSON 
export function cacheMiddleware({ ttlSeconds = 86400 } = {}) { // 24h dans le cache
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();
    try {
      const key = await makeCacheKey(req);
      const raw = await redis.get(key);
      if (!raw) return next();
      const body = JSON.parse(raw);
      res.set('X-Cache', 'HIT');
      res.set('Cache-Control', `public, max-age=${ttlSeconds}`);
      return res.json(body);
    } catch {
      return next();
    }
  };
}

// Écriture : stocke le body en Redis puis renvoie le JSON
export async function cacheJSONResponse(req, res, body, { ttlSeconds = 86400 } = {}) { // 24h dans le cache
  const key = await makeCacheKey(req);
  await redis.setex(key, ttlSeconds, JSON.stringify(body));
  res.set('X-Cache', 'MISS');
  res.set('Cache-Control', `public, max-age=${ttlSeconds}`);
  return res.json(body);
}
