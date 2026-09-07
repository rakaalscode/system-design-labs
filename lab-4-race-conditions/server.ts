import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';

const app = express();
app.use(express.json());

// Inisialisasi PostgreSQL Pool
const pgPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'lab_system_design',
  password: process.env.DB_PASSWORD || '123654',
  port: Number(process.env.DB_PORT) || 5432,
  max: 20, // Max concurrent database connections
});

// Inisialisasi Redis Client
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
});

interface ProductRow {
  id: number;
  name: string;
  stock: number;
}

// Inisialisasi stok awal di Redis saat server start
async function initRedisStock(): Promise<void> {
  await redis.set('stock:product:1', 10);
  console.log('[System] Redis initialized: stock:product:1 = 10');
}
initRedisStock().catch(console.error);

// ========================================================
// ENDPOINT 1: KODE RUSAK (RACE CONDITION NYATA)
// Skenario: Check-then-Act pattern tanpa penguncian
// ========================================================
app.post('/buy-bad', async (_req: Request, res: Response): Promise<Response> => {
  try {
    // 1. Baca stok
    const { rows } = await pgPool.query<ProductRow>('SELECT stock FROM products WHERE id = 1');
    const currentStock = rows[0]?.stock ?? 0;

    if (currentStock > 0) {
      // Simulasikan delay network / validasi kartu (50 milidetik gap)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 2. Kurangi stok (Race condition terjadi di sini!)
      await pgPool.query('UPDATE products SET stock = stock - 1 WHERE id = 1');
      return res.status(200).json({ status: 'SUCCESS', message: 'Order berhasil!' });
    }

    return res.status(400).json({ status: 'FAILED', message: 'Stok habis!' });
  } catch (err) {
    const error = err as Error;
    return res.status(500).json({ error: error.message });
  }
});

// ========================================================
// ENDPOINT 2: SOLUSI SQL PESSIMISTIC LOCK (FOR UPDATE)
// Skenario: Baris dikunci di DB engine sampai transaksi selesai
// ========================================================
app.post('/buy-sql-lock', async (_req: Request, res: Response): Promise<Response> => {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // "FOR UPDATE" mengunci baris produk ini. Transaksi lain wajib antre!
    const { rows } = await client.query<ProductRow>(
      'SELECT stock FROM products WHERE id = 1 FOR UPDATE'
    );
    const currentStock = rows[0]?.stock ?? 0;

    if (currentStock > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await client.query('UPDATE products SET stock = stock - 1 WHERE id = 1');
      await client.query('COMMIT');
      return res.status(200).json({ status: 'SUCCESS', message: 'Order berhasil (SQL Lock)!' });
    }

    await client.query('ROLLBACK');
    return res.status(400).json({ status: 'FAILED', message: 'Stok habis!' });
  } catch (err) {
    await client.query('ROLLBACK');
    const error = err as Error;
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ========================================================
// ENDPOINT 3: SOLUSI REDIS ATOMIC DECR (ULTRA FAST GATEKEEPER)
// Skenario: Filter 100% di memori, isolasi DB dari request liar
// ========================================================
app.post('/buy-redis-atomic', async (_req: Request, res: Response): Promise<Response> => {
  try {
    // DECR adalah instruksi atomic tunggal di single-threaded Redis
    const remainingStock = await redis.decr('stock:product:1');

    if (remainingStock >= 0) {
      // Pembeli sah! Di arsitektur nyata: lempar order ID ke Message Queue (RabbitMQ)
      return res.status(200).json({
        status: 'SUCCESS',
        message: 'Order diamankan!',
        remainingStock
      });
    }

    // Stok sudah minus, tolak instan di memori (< 1ms)
    return res.status(400).json({ status: 'FAILED', message: 'Stok habis!' });
  } catch (err) {
    const error = err as Error;
    return res.status(500).json({ error: error.message });
  }
});

// Helper: Endpoint untuk reset data pengujian
app.post('/reset', async (_req: Request, res: Response): Promise<Response> => {
  await pgPool.query('UPDATE products SET stock = 10 WHERE id = 1');
  await redis.set('stock:product:1', 10);
  return res.json({ message: 'Stok PostgreSQL & Redis berhasil di-reset ke 10' });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`[Server] Lab 4 running at http://localhost:${PORT}`);
});