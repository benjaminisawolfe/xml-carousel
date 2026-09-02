import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  extractAssetReferences,
  verifyStaticBuild,
} from './verify-static-build.mjs';
import {
  hostileContentType,
  startHostileMimeServer,
} from './hostile-mime-build-server.mjs';

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(absolute)));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

async function verifyMount(baseUrl, requests) {
  const indexResponse = await fetch(baseUrl);
  if (!indexResponse.ok)
    throw new Error(`Hostile-MIME index failed: ${baseUrl}`);
  const html = await indexResponse.text();
  const references = extractAssetReferences(html);
  if (references.length === 0) throw new Error('Built index has no assets.');
  for (const reference of references) {
    const url = new URL(reference, baseUrl);
    if (url.origin !== new URL(baseUrl).origin) {
      throw new Error(`Built index references an external asset: ${url.href}`);
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Built asset failed: ${url.href}`);
    await response.arrayBuffer();
  }
  if (requests.some(({ pathname }) => pathname.endsWith('.mjs'))) {
    throw new Error(
      'The hostile-MIME build requested a production .mjs module.',
    );
  }
  return references.length;
}

export async function verifyHostileMimeBuild(
  distDirectory = path.resolve('dist'),
) {
  const staticResult = await verifyStaticBuild({
    distDirectory,
    expectedBase: './',
  });
  const allFiles = await listFiles(distDirectory);
  if (allFiles.some((file) => file.endsWith('.mjs'))) {
    throw new Error('The production distribution contains a .mjs module.');
  }
  const text = (
    await Promise.all(
      allFiles
        .filter((file) => /\.(?:html|js|json)$/u.test(file))
        .map((file) => readFile(file, 'utf8')),
    )
  ).join('\n');
  for (const forbiddenRuntime of [
    'xerces-runtime.mjs',
    'libxml2-relaxng-runtime.mjs',
  ]) {
    if (text.includes(forbiddenRuntime)) {
      throw new Error(
        `The production distribution references ${forbiddenRuntime}.`,
      );
    }
  }

  const requests = [];
  const running = await startHostileMimeServer({
    distDirectory,
    onRequest: (request) => requests.push(request),
  });
  try {
    const rootAssetCount = await verifyMount(running.rootUrl, requests);
    const nestedAssetCount = await verifyMount(running.nestedUrl, requests);
    const runtimeUrls = [
      ...new Set(
        [
          ...Object.values(staticResult.xercesRuntime),
          ...Object.values(staticResult.relaxNgRuntime),
        ].map(({ name }) => new URL(name, running.nestedUrl).href),
      ),
    ];
    for (const url of runtimeUrls) {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Standards runtime asset failed: ${url}`);
      await response.arrayBuffer();
    }
    for (const mount of [running.rootUrl, running.nestedUrl]) {
      for (const name of staticResult.releaseNotices) {
        const url = new URL(name, mount).href;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Required release notice failed: ${url}`);
        }
        await response.arrayBuffer();
      }
    }
    const wasmRequests = requests.filter(({ pathname }) =>
      pathname.endsWith('.wasm'),
    );
    if (
      wasmRequests.length === 0 ||
      wasmRequests.some(
        ({ contentType }) => contentType !== 'application/octet-stream',
      )
    ) {
      throw new Error('WASM was not served as application/octet-stream.');
    }
    const glueRequests = requests.filter(({ pathname }) =>
      /\/(?:xerces-runtime|libxml2-relaxng-runtime)-[\w-]+\.js$/u.test(
        pathname,
      ),
    );
    if (
      glueRequests.length === 0 ||
      glueRequests.some(
        ({ contentType }) => !contentType.startsWith('text/javascript'),
      )
    ) {
      throw new Error(
        'Standards runtime JavaScript was not served with JavaScript MIME.',
      );
    }
    return {
      rootAssetCount,
      nestedAssetCount,
      requestCount: requests.length,
      worker: staticResult.worker,
      relaxNgWorker: staticResult.relaxNgWorker,
      xercesRuntime: staticResult.xercesRuntime,
      relaxNgRuntime: staticResult.relaxNgRuntime,
    };
  } finally {
    await running.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (hostileContentType('runtime.mjs') !== 'application/octet-stream') {
    throw new Error('The hostile server must serve .mjs as octet-stream.');
  }
  try {
    const result = await verifyHostileMimeBuild();
    console.log(
      `Verified hostile-MIME production build at root and /xml-carousel/: ${result.requestCount} requests, ${result.rootAssetCount}/${result.nestedAssetCount} HTML assets, WASM application/octet-stream, no .mjs.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'Hostile-MIME build verification failed.',
    );
    process.exitCode = 1;
  }
}
