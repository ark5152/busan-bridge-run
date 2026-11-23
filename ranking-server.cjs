const {createServer} = require('node:http');
const {readFile} = require('node:fs/promises');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');

const db = new DatabaseSync(process.env.RANKING_DB || path.join(__dirname, 'ranking.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS records (
  crew TEXT NOT NULL, name TEXT NOT NULL, time REAL NOT NULL,
  PRIMARY KEY (crew, name)
)`);
const leaders = db.prepare('SELECT crew, name, time FROM records ORDER BY time, crew, name LIMIT 100');
const recordBest = db.prepare(`INSERT INTO records (crew, name, time) VALUES (?, ?, ?)
  ON CONFLICT (crew, name) DO UPDATE SET time = min(records.time, excluded.time)`);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.webp':'image/webp','.png':'image/png','.wav':'audio/wav','.woff2':'font/woff2'};
const json = (res,status,value) => {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(value));
};

createServer(async (req,res) => {
  try {
    const route = new URL(req.url,'http://localhost').pathname;
    if (route === '/api/ranking') {
      if (req.method === 'GET') return json(res,200,leaders.all());
      if (req.method !== 'POST') return json(res,405,{error:'Method not allowed'});
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2048) return json(res,413,{error:'Request too large'});
      }
      const {crew,name,time} = JSON.parse(body);
      if (typeof crew !== 'string' || crew.length > 18 || typeof name !== 'string' ||
          !name.trim() || name.length > 14 || !Number.isFinite(time) ||
          time < 7800 || time > 86400) return json(res,400,{error:'Invalid result'});
      recordBest.run(crew.trim(), name.trim(), time);
      return json(res,200,leaders.all());
    }
    const file = route === '/' ? 'index.html' : route.slice(1);
    if (req.method !== 'GET' || !/^(index\.html|src\/[\w-]+\.js|assets\/(?:[\w-]+\/)*[\w-]+\.(?:webp|png|wav|woff2))$/.test(file)) {
      res.writeHead(404).end();
      return;
    }
    let contents = await readFile(path.join(__dirname,'dist',file));
    if (file === 'index.html') {
      contents = contents.toString().replace('<head>', '<head><meta name="ranking-endpoint" content="/api/ranking">');
    }
    res.writeHead(200, {'Content-Type':types[path.extname(file)]});
    res.end(contents);
  } catch (error) {
    if (error instanceof SyntaxError) return json(res,400,{error:'Invalid JSON'});
    if (error.code === 'ENOENT') return json(res,404,{error:'Not found'});
    console.error(error);
    json(res,500,{error:'Server error'});
  }
}).listen(Number(process.env.PORT || 8092), process.env.BIND_HOST || '127.0.0.1',
  () => console.log('Ranking server ready'));

