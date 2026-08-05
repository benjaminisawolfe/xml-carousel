import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const NESTED_MOUNT = '/xml-carousel/';

/** @param {string} fileName */
export function hostileContentType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  return (
    {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.ico': 'image/x-icon',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.mjs': 'application/octet-stream',
      '.svg': 'image/svg+xml',
      '.txt': 'text/plain; charset=utf-8',
      '.wasm': 'application/octet-stream',
    }[extension] ?? 'application/octet-stream'
  );
}

/** @param {string} pathname */
function relativeRequestPath(pathname) {
  let requestPath = pathname;
  if (requestPath === '/xml-carousel') requestPath = NESTED_MOUNT;
  if (requestPath.startsWith(NESTED_MOUNT)) {
    requestPath = `/${requestPath.slice(NESTED_MOUNT.length)}`;
  }
  if (requestPath === '/') return 'index.html';
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return undefined;
  }
  const normalized = decoded.replace(/\\/gu, '/').replace(/^\/+/, '');
  const segments = normalized.split('/');
  if (
    normalized.length === 0 ||
    segments.some((segment) => segment === '' || segment === '..')
  ) {
    return undefined;
  }
  return segments.join(path.sep);
}

/**
 * @typedef {{ method: string; pathname: string; status: number; contentType: string }} RequestRecord
 */

/**
 * @param {{
 *   distDirectory?: string;
 *   host?: string;
 *   port?: number;
 *   failWasm?: boolean;
 *   onRequest?: (request: RequestRecord) => void;
 * }} [options]
 */
export async function startHostileMimeServer({
  distDirectory = path.resolve('dist'),
  host = '127.0.0.1',
  port = 0,
  failWasm = false,
  onRequest = ({ method, pathname, status, contentType }) => {
    console.log(`${method} ${pathname} ${status} ${contentType}`);
  },
} = {}) {
  const root = path.resolve(distDirectory);
  const server = http.createServer(async (request, response) => {
    const method = request.method ?? 'GET';
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const relative = relativeRequestPath(pathname);
    if (relative === undefined || (method !== 'GET' && method !== 'HEAD')) {
      const contentType = 'text/plain; charset=utf-8';
      response.writeHead(400, { 'Content-Type': contentType });
      response.end('Bad request.');
      onRequest({ method, pathname, status: 400, contentType });
      return;
    }
    const absolute = path.resolve(root, relative);
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
      const contentType = 'text/plain; charset=utf-8';
      response.writeHead(404, { 'Content-Type': contentType });
      response.end('Not found.');
      onRequest({ method, pathname, status: 404, contentType });
      return;
    }
    if (failWasm && absolute.endsWith('.wasm')) {
      const contentType = 'text/plain; charset=utf-8';
      response.writeHead(503, { 'Content-Type': contentType });
      response.end('Test-only WASM startup failure.');
      onRequest({ method, pathname, status: 503, contentType });
      return;
    }
    let fileStats;
    try {
      fileStats = await stat(absolute);
    } catch {
      fileStats = undefined;
    }
    if (!fileStats?.isFile()) {
      const contentType = 'text/plain; charset=utf-8';
      response.writeHead(404, { 'Content-Type': contentType });
      response.end('Not found.');
      onRequest({ method, pathname, status: 404, contentType });
      return;
    }
    const contentType = hostileContentType(absolute);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': fileStats.size,
      'Content-Type': contentType,
    });
    if (method === 'HEAD') response.end();
    else createReadStream(absolute).pipe(response);
    onRequest({ method, pathname, status: 200, contentType });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host, port }, () => resolve(undefined));
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Hostile-MIME server did not acquire a TCP port.');
  }
  return {
    host,
    port: address.port,
    rootUrl: `http://${host}:${address.port}/`,
    nestedUrl: `http://${host}:${address.port}${NESTED_MOUNT}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve(undefined))),
      ),
  };
}

/** @param {string[]} argv */
function parseCliArguments(argv) {
  let port = 4179;
  let failWasm = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--fail-wasm') failWasm = true;
    else if (argv[index] === '--port' && argv[index + 1]) {
      port = Number(argv[(index += 1)]);
    } else if (argv[index]?.startsWith('--port=')) {
      port = Number(argv[index].slice('--port='.length));
    } else {
      throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('--port must be an integer from 0 through 65535.');
  }
  return { port, failWasm };
}

async function main() {
  const options = parseCliArguments(process.argv.slice(2));
  const running = await startHostileMimeServer(options);
  console.log(
    `HOSTILE_MIME_SERVER pid=${process.pid} root=${running.rootUrl} nested=${running.nestedUrl} failWasm=${options.failWasm}`,
  );
  const close = async () => {
    await running.close();
    process.exit(0);
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Hostile-MIME server failed.',
    );
    process.exitCode = 1;
  });
}
