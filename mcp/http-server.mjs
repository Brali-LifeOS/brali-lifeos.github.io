import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createRemoteMcpHandler } from './remote.mjs';

const csv = value => String(value || '').split(',').map(x => x.trim()).filter(Boolean);
const positiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const port = positiveInt(process.env.PORT, 3000);
const host = process.env.HOST || '0.0.0.0';
const allowedHosts = [...new Set([
  'mcp.brali.life',
  'localhost',
  '127.0.0.1',
  process.env.RAILWAY_PUBLIC_DOMAIN,
  process.env.RAILWAY_PRIVATE_DOMAIN,
  ...csv(process.env.BRALI_MCP_ALLOWED_HOSTS)
].filter(Boolean))];

const requestsPerMinute = positiveInt(process.env.BRALI_MCP_REQUESTS_PER_MINUTE, 600);
const maxConcurrent = positiveInt(process.env.BRALI_MCP_MAX_CONCURRENT, 32);
let windowStartedAt = Date.now();
let windowCount = 0;
let inFlight = 0;

const app = createMcpExpressApp({
  host,
  allowedHosts,
  jsonLimit: '64kb'
});
app.disable('x-powered-by');

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, service: 'brali-knowledge-mcp', version: '1.2.0' });
});

app.get('/version', (_req, res) => {
  res.status(200).json({
    service: 'brali-knowledge-mcp',
    version: '1.2.0',
    transport: 'streamable-http',
    trust_mode: 'trusted-only',
    data_origin: process.env.BRALI_REMOTE_DATA_ORIGIN || 'https://brali-lifeos.github.io/api/v1'
  });
});

const basicAbuseGate = (_req, res, next) => {
  const now = Date.now();
  if (now - windowStartedAt >= 60_000) {
    windowStartedAt = now;
    windowCount = 0;
  }
  if (windowCount >= requestsPerMinute || inFlight >= maxConcurrent) {
    res.set('Retry-After', '60');
    return res.status(429).json({ error: 'rate_limited', retry_after_seconds: 60 });
  }
  windowCount += 1;
  inFlight += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    inFlight = Math.max(0, inFlight - 1);
  };
  res.once('finish', release);
  res.once('close', release);
  next();
};

const webHandler = createRemoteMcpHandler();
const nodeHandler = toNodeHandler(webHandler);
app.all('/mcp', basicAbuseGate, (req, res) => void nodeHandler(req, res, req.body));

app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

const server = app.listen(port, host, () => {
  console.error(`Brali trusted Remote MCP listening on ${host}:${port}; allowed hosts: ${allowedHosts.join(', ')}`);
});

const shutdown = signal => {
  console.error(`Brali Remote MCP received ${signal}; closing HTTP server.`);
  server.close(error => process.exit(error ? 1 : 0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
