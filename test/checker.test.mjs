import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSlug,
  soundex,
  levenshteinSimilarity,
  runBrandCheck,
  formatMarkdownReport
} from '../src/checker.mjs';

test('phonetic Soundex and Levenshtein similarity accurately catch near-identical marks', () => {
  assert.equal(normalizeSlug('Vibe-Flow AI!'), 'vibeflowai');
  assert.equal(soundex('Kestrel'), soundex('Kestrell'));
  assert.ok(levenshteinSimilarity('Stripe', 'Strype') > 0.8);
});

test('live end-to-end brand check verifies taken giant brand + uniquely free coined name + honest unconfirmed policy', async () => {
  const uniqueCoined = 'zxqvibeforge942';
  const res = await runBrandCheck({
    names: ['Stripe', uniqueCoined],
    extensions: ['com', 'dev'],
    platforms: ['github', 'npm', 'instagram'],
    countries: ['US'],
    suggestAlternatives: false
  });

  assert.equal(res.reports.length, 2);
  const stripe = res.reports[0];
  const stripeCom = stripe.domains.find(d => d.domain === 'stripe.com');
  assert.equal(stripeCom.status, 'taken');

  const coined = res.reports[1];
  const coinedCom = coined.domains.find(d => d.domain === `${uniqueCoined}.com`);
  assert.equal(coinedCom.status, 'available');

  const coinedGh = coined.handles.find(h => h.platform === 'GitHub');
  assert.equal(coinedGh.status, 'available');

  const coinedIg = coined.handles.find(h => h.platform === 'Instagram');
  assert.ok(['available', 'taken', "couldn't confirm"].includes(coinedIg.status));
  // Never fabricates "available" on login-walled Instagram
  assert.notEqual(coinedIg.status, 'available');

  const md = formatMarkdownReport(res);
  assert.ok(md.includes('do not constitute legal advice'));
  assert.ok(md.includes('Databases Searched:'));
  assert.ok(md.includes('stripe.com'));
  assert.ok(md.includes(`${uniqueCoined}.com`));
});

test('suggested variations only include candidates verified free across all requested domains and confirmable platforms', async () => {
  const res = await runBrandCheck({
    names: ['VibeForge91'],
    extensions: ['com', 'dev'],
    platforms: ['github', 'npm'],
    countries: ['US'],
    suggestAlternatives: true
  });
  const r = res.reports[0];
  assert.ok(r.variations.length >= 1);
  for (const v of r.variations) {
    for (const d of v.domains) assert.equal(d.status, 'available');
    for (const h of v.handles) assert.notEqual(h.status, 'taken');
  }
});
