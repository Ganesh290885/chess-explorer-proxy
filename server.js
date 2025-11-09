// server.js
// Simple Node/Express proxy + small in-memory cache for Lichess Explorer
// Node 18+ provides global fetch; no node-fetch required.

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.set('trust proxy', true);

/**
 * Tiny in-memory cache with TTL (Map-based).
 * Methods:
 *  - get(key) -> value | undefined
 *  - set(key, value, ttlMs)
 */
class SimpleCache {
  constructor() {
    this.map = new Map();
  }
  set(key, value, ttlMs = 1000 * 60 * 30) {
    const expiresAt = Date.now() + ttlMs;
    // store value + expiry
    this.map.set(key, { value, expiresAt });
  }
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }
  has(key) {
    return this.get(key) !== undefined;
  }
  delete(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

const cache = new SimpleCache();

const LICHESS_EXPLORER = 'https://explorer.lichess.ovh/lichess';

function makeKey(path, params) {
  return path + JSON.stringify(params || {});
}

app.get('/api/explorer', async (req, res) => {
  try {
    const fen = req.query.fen || '';
    const speeds = req.query.speeds || '';
    const ratings = req.query.ratings || '';
    const top = Math.min(parseInt(req.query.top || '20', 10), 100);

    const params = { fen, speeds, ratings, top };
    const key = makeKey('/explorer', params);

    const cached = cache.get(key);
    if (cached) {
      return res.json({ cached: true, ok: true, data: cached });
    }

    const url = new URL(LICHESS_EXPLORER);
    url.searchParams.set('variant', 'standard');
    if (fen) url.searchParams.set('fen', fen);
    if (speeds) url.searchParams.set('speeds', speeds);
    if (ratings) url.searchParams.set('ratings', ratings);

    // Use global fetch (Node 18+)
    const r = await fetch(url.toString(), { headers: { 'User-Agent': 'ChessExplorer/1.0' } });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return res.status(502).json({ ok: false, error: 'Upstream failed', status: r.status, text });
    }

    const raw = await r.json();

    // Normalize: compute totals and stats per move and sort
    const moves = (raw.moves || []).map(m => {
      const total = (m.white || 0) + (m.draws || 0) + (m.black || 0);
      const winPercent = total ? ((m.white || 0) / total) * 100 : 0;
      const drawPercent = total ? ((m.draws || 0) / total) * 100 : 0;
      const lossPercent = total ? ((m.black || 0) / total) * 100 : 0;
      return {
        uci: m.uci,
        san: m.san || m.uci,
        white: m.white || 0,
        draws: m.draws || 0,
        black: m.black || 0,
        total,
        winPercent,
        drawPercent,
        lossPercent,
        averageRating: m.averageRating || null,
        performance: m.performance || null,
      };
    });

    moves.sort((a, b) => b.total - a.total);

    const result = {
      fen: raw.fen || fen || null,
      moves: moves.slice(0, top),
      totalGames: (raw.white || 0) + (raw.draws || 0) + (raw.black || 0) || moves.reduce((s, m) => s + m.total, 0),
      raw
    };

    // cache result for 30 minutes (30 * 60 * 1000 ms)
    cache.set(key, result, 1000 * 60 * 30);

    res.json({ ok: true, cached: false, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
  }
});

app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => console.log(`Explorer proxy running on ${PORT}`));
