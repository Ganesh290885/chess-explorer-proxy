Chess Explorer Proxy (Node)

Files:
- server.js : express server that proxies Lichess Explorer and caches results (in-memory)
- package.json : dependencies

Quick start:
1. Install Node 18+
2. npm install
3. node server.js
4. Visit http://localhost:8080/api/explorer?fen=STARTING_FEN

Deploy:
- Works on Render, Railway, Heroku, or any Node host.
- Set PORT env var if needed.

Notes:
- This server uses in-memory cache. For production, replace with Redis or persistent cache.
- Respect Lichess API terms of use.
