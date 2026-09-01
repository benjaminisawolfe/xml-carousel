import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const spikeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(spikeRoot, '.evidence/production-browser-dist');
const port = Number(process.env.XML_CAROUSEL_RELAX_NG_PORT ?? 4179);
const nested = '/xml-carousel-relax-ng-production/';
const hostileMime = process.env.XML_CAROUSEL_RELAX_NG_HOSTILE_MIME === '1';
const requests = [];
const types = {
  '.html': 'text/html',
  '.mjs': hostileMime ? 'application/octet-stream' : 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': hostileMime ? 'application/octet-stream' : 'application/wasm',
  '.json': 'application/json',
  '.txt': 'text/plain',
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  requests.push({ method: request.method, path: url.pathname });
  if (url.pathname === '/__requests') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(requests));
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith(nested))
    pathname = `/${pathname.slice(nested.length)}`;
  if (pathname === '/' || pathname === '/xml-carousel-relax-ng-production') {
    pathname = '/index.html';
  }
  const target = resolve(root, `.${pathname}`);
  if (!target.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end('blocked');
    return;
  }
  try {
    if (!(await stat(target)).isFile()) throw new Error('not file');
    response.setHeader(
      'content-type',
      types[extname(target)] ?? 'application/octet-stream',
    );
    response.setHeader('cache-control', 'no-store');
    response.end(await readFile(target));
  } catch {
    response.writeHead(404).end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ROOT http://127.0.0.1:${port}/`);
  console.log(`NESTED http://127.0.0.1:${port}${nested}`);
  console.log(`HOSTILE_MIME ${hostileMime}`);
});
