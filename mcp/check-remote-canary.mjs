import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const endpoint = process.argv[2] || process.env.BRALI_MCP_URL;
if (!endpoint) throw new Error('Usage: npm run canary:remote -- https://host.example/mcp');
const mcpUrl = new URL(endpoint);
const baseUrl = new URL('/', mcpUrl);

const fail = message => { throw new Error(`Remote MCP canary failed: ${message}`); };
const textJson = result => {
  const block = result?.content?.find(item => item.type === 'text');
  if (!block?.text) fail('tool result has no text content');
  try { return JSON.parse(block.text); } catch { fail('tool result text is not JSON'); }
};
const stateOf = item => item?.evidence_state || item?.status || item?.evidence?.status || 'unknown';
const isTrusted = item => ['reviewed', 'practical'].includes(stateOf(item));

const health = await fetch(new URL('/healthz', baseUrl));
if (!health.ok) fail(`/healthz returned HTTP ${health.status}`);
const healthBody = await health.json();
if (healthBody?.ok !== true || healthBody?.service !== 'brali-knowledge-mcp') fail('/healthz payload is invalid');

const versionResponse = await fetch(new URL('/version', baseUrl));
if (!versionResponse.ok) fail(`/version returned HTTP ${versionResponse.status}`);
const version = await versionResponse.json();
if (version?.trust_mode !== 'trusted-only') fail('/version does not report trusted-only mode');
if (version?.transport !== 'streamable-http') fail('/version does not report Streamable HTTP');

const client = new Client(
  { name: 'brali-production-canary', version: '1.0.0' },
  { versionNegotiation: { mode: 'auto' } }
);
await client.connect(new StreamableHTTPClientTransport(mcpUrl));

try {
  const { tools } = await client.listTools();
  const names = new Set(tools.map(tool => tool.name));
  for (const required of ['search_knowledge', 'get_topic', 'get_protocol', 'get_evidence', 'get_provenance']) {
    if (!names.has(required)) fail(`required tool ${required} is missing`);
  }
  const searchTool = tools.find(tool => tool.name === 'search_knowledge');
  if (searchTool?.inputSchema?.properties?.trusted_only) fail('search_knowledge still exposes a trust-bypass input');

  const search = textJson(await client.callTool({
    name: 'search_knowledge',
    arguments: { query: 'focus attention', limit: 5 }
  }));
  if (search?.trust_mode !== 'trusted-only') fail('search result lost trusted-only mode');
  if (search?.no_answer || !Array.isArray(search?.results) || search.results.length === 0) fail('representative focus query returned no trusted result');
  const untrustedSearchHit = search.results.find(item => ['protocol', 'hack'].includes(item.kind) && !isTrusted(item));
  if (untrustedSearchHit) fail(`search leaked untrusted ${untrustedSearchHit.kind}: ${untrustedSearchHit.id}`);

  const safeNoAnswer = textJson(await client.callTool({
    name: 'search_knowledge',
    arguments: { query: 'diagnose severe depression and treat it without a professional', limit: 5 }
  }));
  if (safeNoAnswer?.no_answer !== true || safeNoAnswer?.results?.length !== 0) fail('safety-sensitive query did not abstain');

  const missing = textJson(await client.callTool({
    name: 'get_protocol',
    arguments: { id: 'brali:protocol:definitely-missing' }
  }));
  if (missing?.no_answer !== true) fail('missing protocol did not return explicit no-answer');

  const dataOrigin = String(version?.data_origin || '').replace(/\/+$/, '');
  if (!dataOrigin) fail('/version does not expose the canonical data origin');
  const protocolResponse = await fetch(`${dataOrigin}/protocols.json`, { headers: { accept: 'application/json' } });
  if (!protocolResponse.ok) fail(`canonical protocols.json returned HTTP ${protocolResponse.status}`);
  const protocolItems = (await protocolResponse.json())?.items || [];
  const blocked = protocolItems.find(item => ['pending-review', 'restricted'].includes(stateOf(item)) && (item.canonical_id || item.id || item.protocol_id));
  if (blocked) {
    const blockedId = blocked.canonical_id || blocked.id || blocked.protocol_id;
    const blockedResult = textJson(await client.callTool({ name: 'get_protocol', arguments: { id: blockedId } }));
    if (blockedResult?.no_answer !== true) fail(`direct protocol lookup leaked ${stateOf(blocked)} record ${blockedId}`);
  }

  const trustedProtocol = protocolItems.find(item => isTrusted(item) && (item.canonical_id || item.id || item.protocol_id));
  if (!trustedProtocol) fail('canonical API contains no trusted protocol fixture');
  const trustedId = trustedProtocol.canonical_id || trustedProtocol.id || trustedProtocol.protocol_id;
  const protocol = textJson(await client.callTool({ name: 'get_protocol', arguments: { id: trustedId } }));
  if (!isTrusted(protocol)) fail(`trusted protocol lookup did not preserve trusted evidence state for ${trustedId}`);

  const provenance = textJson(await client.callTool({ name: 'get_provenance', arguments: { id: trustedId } }));
  if (provenance?.found !== true || !provenance?.provenance?.canonical_id) fail(`provenance missing canonical identity for ${trustedId}`);
  if (!isTrusted(provenance.provenance)) fail(`provenance lost trusted evidence state for ${trustedId}`);

  console.log(JSON.stringify({
    ok: true,
    endpoint: mcpUrl.toString(),
    server_version: version.version,
    protocol_era: client.getProtocolEra(),
    tool_count: tools.length,
    representative_results: search.results.length,
    blocked_fixture_checked: Boolean(blocked),
    provenance_checked: trustedId
  }, null, 2));
} finally {
  await client.close();
}
