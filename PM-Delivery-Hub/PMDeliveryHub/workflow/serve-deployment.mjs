import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tables, lookups, relationship, keys } from './schema.mjs';
const files = ['core.js', 'review.js', 'review.html', 'reporting.js', 'dashboard.js', 'dashboard.html'];
async function payload() {
  const resources = await Promise.all(files.map(async name => ({
    name: `pmdh_${name}`,
    type: name.endsWith('.html') ? 1 : 3,
    content: (await readFile(new URL(name, import.meta.url))).toString('base64')
  })));
  const assembly = await readFile(new URL('ApprovalGuard/bin/Release/net462/PMDeliveryHub.ApprovalGuard.dll', import.meta.url));
  return { tables, relationships: lookups.map(relationship), keys, resources, assembly: assembly.toString('base64'),
    deploy: await readFile(new URL('deploy-dashboard.js', import.meta.url), 'utf8') };
}
const server = http.createServer(async (request, response) => {
  if (request.url !== '/deployment' || request.method !== 'GET') { response.writeHead(404).end(); return; }
  try {
    const data = await payload();
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(data));
  } catch (error) {
    console.error('Deployment payload failed:', error);
    response.writeHead(500, { 'Content-Type': 'text/plain' }).end('Deployment payload failed; inspect the local server log.');
  }
});
server.listen(8766, '127.0.0.1', () => console.log('Local deployment payload ready on 127.0.0.1:8766'));
