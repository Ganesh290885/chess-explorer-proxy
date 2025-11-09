// server.js
// Simple Node/Express proxy + cache for Lichess Explorer
// Usage: node server.js
import express from 'express';
import fetch from 'node-fetch';
import LRU from 'lru-cache';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());

const cache = new LRU({ max: 1000, ttl: 1000 * 60 * 30 });

const LICHESS_EXPLORER = 'https://explorer.lichess.ovh/lichess';

function makeKey(path, params) {
  return path + JSON.stringify(params || {});
}

app.get('/api/explorer', async (req, res) => {
  try {
    const fen = req.query.fen || '';
    const speeds = req.query.speeds || '';
    const ratings = req.query.ratings || '';
    const top = Math.min(parseInt(req.query.top || '20',10), 100);

    const params = { fen, speeds, ratings, top };
    const key = makeKey('/explorer', params);
    if (cache.has(key)) {
      return res.json({ cached: true, ok: true, data: cache.get(key) });
    }

    const url = new URL(LICHESS_EXPLORER);
    url.searchParams.set('variant', 'standard');
    if (fen) url.searchParams.set('fen', fen);
    if (speeds) url.searchParams.set('speeds', speeds);
    if (ratings) url.searchParams.set('ratings', ratings);

    const r = await fetch(url.toString(), { headers: { 'User-Agent': 'ChessExplorer/1.0' } });
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ ok: false, error: 'Upstream failed', status: r.status, text });
    }
    const raw = await r.json();

    const moves = (raw.moves || []).map(m => {
      const total = (m.white||0) + (m.draws||0) + (m.black||0);
      const winPercent = total ? ((m.white||0)/total) * 100 : 0;
      const drawPercent = total ? ((m.draws||0)/total) * 100 : 0;
      const lossPercent = total ? ((m.black||0)/total) * 100 : 0;
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

    moves.sort((a,b) => b.total - a.total);

    const result = {
      fen: raw.fen || fen || null,
      moves: moves.slice(0, top),
      totalGames: raw.white + raw.draws + raw.black || moves.reduce((s,m)=>s+m.total,0),
      raw
    };

    cache.set(key, result);
    res.json({ ok: true, cached: false, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/health', (req,res)=>res.send('ok'));

app.listen(PORT, ()=>console.log(`Explorer proxy running on ${PORT}`));
