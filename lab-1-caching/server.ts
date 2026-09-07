import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';

const app = express();
app.use(express.json());

// 1. Database Connection
const pgPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'lab_system_design',
  password: process.env.DB_PASSWORD || '123654',
  port: Number(process.env.DB_PORT) || 5432,
  max: 20,
});

// 2. L2 Cache: Distributed Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
});

// 3. L1 Cache: In-Memory RAM Node.js (LRU Cache)
// Maksimal 500 item, TTL 30 detik
const l1Cache = new LRUCache<string, Article>({
  max: 500,
  ttl: 1000 * 30, // 30 detik
});

interface Article {
  id: number;
  slug: string;
  title: string;
  content: string;
}

interface ArticleParams {
  slug: string;
}

// Simulasi query DB dengan kalkulasi / delay I/O kecil (10ms)
async function fetchArticleFromDB(slug: string): Promise<Article | null> {
  // Simulasi kerja CPU/Disk DB
  await new Promise((resolve) => setTimeout(resolve, 10));
  const { rows } = await pgPool.query<Article>(
    'SELECT id, slug, title, content FROM articles WHERE slug = $1',
    [slug]
  );
  return rows[0] || null;
}

// ========================================================
// ENDPOINT 1: NO CACHE (RAW DATABASE)
// Setiap request menghantam database langsung!
// ========================================================
app.get('/articles/no-cache/:slug', async (req: Request<ArticleParams>, res: Response) => {
  try {
    const { slug } = req.params;
    const data = await fetchArticleFromDB(slug);
    if (!data) return res.status(404).json({ message: 'Not found' });

    res.setHeader('X-Cache-Status', 'DB-HIT');
    return res.json(data);
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(500).json({ error: error.message });
  }
});

// ========================================================
// ENDPOINT 2: L2 CACHE ONLY (REDIS)
// Cek Redis -> Kalau Miss baru ke DB -> Simpan di Redis
// ========================================================
app.get('/articles/l2-cache/:slug', async (req: Request<ArticleParams>, res: Response) => {
  const { slug } = req.params;
  const cacheKey = `article:${slug}`;

  try {
    // 1. Cek Redis
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      res.setHeader('X-Cache-Status', 'L2-REDIS-HIT');
      return res.json(JSON.parse(cachedData) as Article);
    }

    // 2. Cache Miss: Ambil ke DB
    const data = await fetchArticleFromDB(slug);
    if (!data) return res.status(404).json({ message: 'Not found' });

    // 3. Simpan ke Redis (TTL 60 detik)
    await redis.set(cacheKey, JSON.stringify(data), 'EX', 60);

    res.setHeader('X-Cache-Status', 'DB-HIT-SAVED-TO-L2');
    return res.json(data);
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(500).json({ error: error.message });
  }
});

// ========================================================
// ENDPOINT 3: FULL MULTI-TIER (L1 IN-MEMORY + L2 REDIS)
// Cek L1 RAM -> Cek L2 Redis -> Cek DB
// ========================================================
app.get('/articles/l1-l2-cache/:slug', async (req: Request<ArticleParams>, res: Response) => {
  const { slug } = req.params;
  const cacheKey = `article:${slug}`;

  try {
    // 1. Cek L1 (RAM Lokal Node.js - 0 ms!)
    const l1Data = l1Cache.get(cacheKey);
    if (l1Data) {
      res.setHeader('X-Cache-Status', 'L1-RAM-HIT');
      return res.json(l1Data);
    }

    // 2. Cek L2 (Redis via Network TCP - 1-2 ms)
    const l2Data = await redis.get(cacheKey);
    if (l2Data) {
      const parsed = JSON.parse(l2Data) as Article;
      // Isi balik L1 agar request berikutnya 0 ms
      l1Cache.set(cacheKey, parsed);

      res.setHeader('X-Cache-Status', 'L2-REDIS-HIT');
      return res.json(parsed);
    }

    // 3. Cache Miss Total: Ambil ke DB
    const dbData = await fetchArticleFromDB(slug);
    if (!dbData) return res.status(404).json({ message: 'Not found' });

    // Isi L2 & L1
    await redis.set(cacheKey, JSON.stringify(dbData), 'EX', 60);
    l1Cache.set(cacheKey, dbData);

    res.setHeader('X-Cache-Status', 'DB-HIT-SAVED-TO-ALL');
    return res.json(dbData);
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(500).json({ error: error.message });
  }
});

const PORT = 3001; // Kita pakai port 3001 agar tidak tabrakan dengan Lab 4
app.listen(PORT, () => {
  console.log(`[Lab 1 Server] Running on http://localhost:${PORT}`);
});