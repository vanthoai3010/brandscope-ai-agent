/**
 * NEAR AI Agent Market Self-Hosted Worker Daemon for BrandScope AI
 * Polls GET /v1/agents/me/assignments, parses candidate names + extensions + platforms + countries
 * from the buyer's brief / latest message, runs live read-only checks, and submits via
 * POST /v1/assignments/{id}/submit.
 */
import { runBrandCheck, formatMarkdownReport } from './checker.mjs';

const API_BASE = process.env.NEAR_MARKET_API || 'https://api.market.near.ai';
const API_TOKEN = process.env.NEAR_AGENT_TOKEN;

export function parseBriefInput(text) {
  const lines = String(text || '').trim();
  const quoted = [...lines.matchAll(/["“”`]([A-Za-z0-9][A-Za-z0-9 _-]{1,32})["“”`]/g)].map(m => m[1].trim());
  const names = quoted.length
    ? [...new Set(quoted)].slice(0, 8)
    : lines.split(/[,;\n]/).map(s => s.trim()).filter(s => s.length >= 2 && s.length <= 30).slice(0, 5);
  return { names: names.length ? names : ['BrandScopeDemo'] };
}

async function pollOnce() {
  if (!API_TOKEN) {
    console.error('Set NEAR_AGENT_TOKEN=aat_... to run the live NEAR AI Agent Market worker loop.');
    process.exit(1);
  }
  const headers = { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' };
  const r = await fetch(`${API_BASE}/v1/agents/me/assignments`, { headers });
  if (!r.ok) {
    console.error('Poll error:', r.status, await r.text());
    return;
  }
  const data = await r.json();
  for (const row of (data.assignments || [])) {
    const a = row.assignment;
    if (!a || a.status !== 'in_progress') continue;
    console.log(`Processing assignment ${a.assignmentId} for job "${row.job?.title}"...`);
    await fetch(`${API_BASE}/v1/assignments/${a.assignmentId}/start`, { method: 'POST', headers, body: '{}' });

    const briefText = `${row.latestMessage?.body || ''}\n${row.job?.description || ''}`;
    const parsed = parseBriefInput(briefText);
    const result = await runBrandCheck(parsed);
    const deliverableMarkdown = formatMarkdownReport(result);

    const sub = await fetch(`${API_BASE}/v1/assignments/${a.assignmentId}/submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ deliverableMarkdown })
    });
    console.log(`Submitted ${a.assignmentId}:`, sub.status);
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  await pollOnce();
}
