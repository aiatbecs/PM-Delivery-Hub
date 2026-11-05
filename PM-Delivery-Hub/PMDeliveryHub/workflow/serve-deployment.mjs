import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tables, lookups, relationship, keys } from './schema.mjs';
const files = ['core.js', 'review.js', 'review.html'];
const resources = await Promise.all(files.map(async name => ({
  name: name === 'review.html' ? 'pmdh_review.html' : `pmdh_${name}`,
  type: name.endsWith('.html') ? 1 : 3,
  content: (await readFile(new URL(name, import.meta.url))).toString('base64')
})));
const assembly = await readFile(new URL('ApprovalGuard/bin/Release/net462/PMDeliveryHub.ApprovalGuard.dll', import.meta.url));
const payload = { tables, relationships: lookups.map(relationship), keys, resources, assembly: assembly.toString('base64') };
const server = http.createServer((request, response) => {
  if (request.url !== '/deployment' || request.method !== 'GET') { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
});
server.listen(8766, '127.0.0.1', () => console.log('Local deployment payload ready on 127.0.0.1:8766'));
