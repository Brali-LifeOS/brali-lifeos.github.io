import { createMcpHandler } from '@modelcontextprotocol/server';
import { createBraliServer } from './core.mjs';

export const DEFAULT_DATA_ORIGIN = 'https://brali-lifeos.github.io/api/v1';

const envOrigin = () => (typeof process !== 'undefined' ? process.env?.BRALI_REMOTE_DATA_ORIGIN : undefined);
const cleanOrigin = value => String(value || DEFAULT_DATA_ORIGIN).replace(/\/+$/, '');

export function createHttpDataLoader({ dataOrigin = envOrigin() || DEFAULT_DATA_ORIGIN, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Remote Brali MCP requires a fetch implementation.');
  const origin = cleanOrigin(dataOrigin);
  const cache = new Map();
  return async name => {
    if (!/^[a-z0-9-]+\.json$/i.test(name)) throw new Error(`Unsupported Brali API document: ${name}`);
    if (!cache.has(name)) {
      const request = fetchImpl(`${origin}/${name}`, { headers: { accept: 'application/json' } })
        .then(async response => {
          if (!response.ok) throw new Error(`Brali API ${name} returned HTTP ${response.status}.`);
          const doc = await response.json();
          if (!Array.isArray(doc?.items)) throw new Error(`Brali API ${name} does not expose an items array.`);
          return doc.items;
        })
        .catch(error => {
          cache.delete(name);
          throw error;
        });
      cache.set(name, request);
    }
    return cache.get(name);
  };
}

export function createRemoteMcpHandler(options = {}) {
  const loadItems = createHttpDataLoader(options);
  return createMcpHandler(() => createBraliServer({ loadItems }));
}

const handler = createRemoteMcpHandler();
export default handler;
