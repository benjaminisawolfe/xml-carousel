import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const root = path.resolve('tools/xerces-wasm-spike/dist/harness');
const host = '127.0.0.1';
const port = Number.parseInt(process.env.XERCES_SPIKE_PORT ?? '4173', 10);
const nestedBase = '/xml-carousel-spike/';
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.wasm', 'application/wasm'],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith(nestedBase))
      pathname = pathname.slice(nestedBase.length);
    else if (pathname.startsWith('/')) pathname = pathname.slice(1);
    if (pathname === '') pathname = 'index.html';
    const target = path.resolve(root, pathname);
    if (!target.startsWith(root + path.sep)) throw new Error('Unsafe path');
    const targetStats = await stat(target);
    if (!targetStats.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type':
        contentTypes.get(path.extname(target)) ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(
    `Xerces spike harness listening at http://${host}:${port}/ and http://${host}:${port}${nestedBase}`,
  );
});
