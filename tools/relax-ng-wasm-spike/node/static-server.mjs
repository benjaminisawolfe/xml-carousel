import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.XML_CAROUSEL_RELAX_NG_PORT ?? 4178);
const nested = '/xml-carousel-relax-ng-spike/';
const requests = [];
const types = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
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
  if (pathname === '/' || pathname === '/browser' || pathname === '/browser/')
    pathname = '/browser/index.html';
  if (pathname === '/xml-carousel-relax-ng-spike')
    pathname = '/browser/index.html';
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
});
