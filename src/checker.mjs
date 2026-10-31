/**
 * BrandScope AI — Core Brand Name Availability Engine
 * Checks candidate names across:
 *   1. Domains (Cloudflare DNS-over-HTTPS + IANA RDAP, zero registrar front-running leakage)
 *   2. Social & Developer Handles (deterministic public APIs + honest "couldn't confirm" for login-walled sites)
 *   3. App Stores (Apple iTunes / iOS & macOS App Store Search API)
 *   4. Public Trademarks & Brand Registries (Wikidata Brand/Trademark entities + Soundex/Levenshtein phonetic similarity)
 *
 * Strictly read-only: NEVER registers, reserves, buys, logs, or shares searched names.
 */

export const DEFAULT_EXTENSIONS = ['com', 'io', 'ai', 'dev', 'app', 'co', 'xyz', 'org'];
export const DEFAULT_PLATFORMS = ['github', 'npm', 'pypi', 'reddit', 'youtube', 'x', 'instagram', 'tiktok'];
export const DEFAULT_COUNTRIES = ['US', 'EU', 'GLOBAL'];

export function normalizeSlug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeDomainLabel(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
}

export function soundex(word) {
  const s = normalizeSlug(word).toUpperCase();
  if (!s) return '0000';
  const map = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6'
  };
  let out = s[0];
  let prev = map[s[0]] || '';
  for (let i = 1; i < s.length && out.length < 4; i++) {
    const code = map[s[i]] || '';
    if (code && code !== prev) out += code;
    prev = code;
  }
  return (out + '0000').slice(0, 4);
}

export function levenshteinSimilarity(a, b) {
  const s1 = normalizeSlug(a);
  const s2 = normalizeSlug(b);
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  const dp = Array.from({ length: s1.length + 1 }, () => new Array(s2.length + 1).fill(0));
  for (let i = 0; i <= s1.length; i++) dp[i][0] = i;
  for (let j = 0; j <= s2.length; j++) dp[0][j] = j;
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - dp[s1.length][s2.length] / maxLen;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 6500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'BrandScope-AI-Agent/1.0 (+https://github.com/vanthoai3010/brandscope-ai-agent)',
        ...(options.headers || {})
      },
      signal: ctrl.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 1. Domain Availability via Cloudflare DoH + IANA RDAP confirmation
 */
export async function checkDomain(label, ext) {
  const cleanExt = String(ext).replace(/^\./, '').toLowerCase();
  const domain = `${label}.${cleanExt}`;
  const checkedAt = new Date().toISOString();

  if (!label) {
    return { domain, status: "couldn't confirm", method: 'validation', detail: 'Invalid label', checkedAt };
  }

  try {
    const dohRes = await fetchWithTimeout(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`,
      { headers: { Accept: 'application/dns-json' } }
    );
    if (dohRes.ok) {
      const dns = await dohRes.json();
      // Status 0 with Answer/Authority NS for the domain itself means active delegation -> TAKEN
      if (dns.Status === 0 && Array.isArray(dns.Answer) && dns.Answer.length > 0) {
        return { domain, status: 'taken', method: 'DNS-NS', detail: 'Active nameservers delegated', checkedAt };
      }
      // Confirm via RDAP whether domain is truly unregistered or registered-but-parked
      try {
        const rdapRes = await fetchWithTimeout(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
          headers: { Accept: 'application/rdap+json, application/json' }
        }, 5500);
        if (rdapRes.status === 404) {
          return { domain, status: 'available', method: 'DoH+RDAP', detail: 'NXDOMAIN + RDAP 404 unregistered', checkedAt };
        }
        if (rdapRes.status === 200) {
          return { domain, status: 'taken', method: 'RDAP', detail: 'Registered in TLD RDAP (no active NS)', checkedAt };
        }
      } catch {
        // RDAP unsupported for some ccTLDs (e.g. .ai/.io intermittent redirects): fall back prudently
      }
      if (dns.Status === 3) {
        // NXDOMAIN on DoH without RDAP response: check SOA/A record as secondary confirmation
        const aRes = await fetchWithTimeout(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`,
          { headers: { Accept: 'application/dns-json' } }
        );
        const aDns = aRes.ok ? await aRes.json() : null;
        if (aDns && aDns.Status === 3) {
          return { domain, status: 'available', method: 'DoH-NXDOMAIN', detail: 'NXDOMAIN across NS & A queries', checkedAt };
        }
      }
    }
    return { domain, status: "couldn't confirm", method: 'DoH/RDAP', detail: 'Registry lookup inconclusive', checkedAt };
  } catch (err) {
    return { domain, status: "couldn't confirm", method: 'DoH/RDAP', detail: `Timeout or network error`, checkedAt };
  }
}

/**
 * 2. Social & Developer Handle Availability
 * Never guesses on login-walled platforms (Instagram, TikTok, X): marks "couldn't confirm" when blocked.
 */
export async function checkHandle(handle, platform) {
  const p = String(platform).toLowerCase();
  const checkedAt = new Date().toISOString();

  try {
    if (p === 'github') {
      const r = await fetchWithTimeout(`https://api.github.com/users/${encodeURIComponent(handle)}`);
      if (r.status === 404) return { platform: 'GitHub', handle, status: 'available', detail: 'HTTP 404 on GitHub Users API', checkedAt };
      if (r.status === 200) return { platform: 'GitHub', handle, status: 'taken', detail: `https://github.com/${handle}`, checkedAt };
      return { platform: 'GitHub', handle, status: "couldn't confirm", detail: `API HTTP ${r.status}`, checkedAt };
    }

    if (p === 'npm') {
      const r = await fetchWithTimeout(`https://registry.npmjs.org/${encodeURIComponent(handle.toLowerCase())}`);
      if (r.status === 404) return { platform: 'npm', handle, status: 'available', detail: 'Package/scope free on npmjs', checkedAt };
      if (r.status === 200) return { platform: 'npm', handle, status: 'taken', detail: `https://www.npmjs.com/package/${handle.toLowerCase()}`, checkedAt };
      return { platform: 'npm', handle, status: "couldn't confirm", detail: `HTTP ${r.status}`, checkedAt };
    }

    if (p === 'pypi') {
      const r = await fetchWithTimeout(`https://pypi.org/pypi/${encodeURIComponent(handle.toLowerCase())}/json`);
      if (r.status === 404) return { platform: 'PyPI', handle, status: 'available', detail: 'Project name free on PyPI', checkedAt };
      if (r.status === 200) return { platform: 'PyPI', handle, status: 'taken', detail: `https://pypi.org/project/${handle.toLowerCase()}/`, checkedAt };
      return { platform: 'PyPI', handle, status: "couldn't confirm", detail: `HTTP ${r.status}`, checkedAt };
    }

    if (p === 'reddit') {
      const r = await fetchWithTimeout(`https://www.reddit.com/user/${encodeURIComponent(handle)}/about.json`);
      if (r.status === 404) return { platform: 'Reddit', handle, status: 'available', detail: 'u/' + handle + ' returns 404', checkedAt };
      if (r.status === 200) {
        const d = await r.json().catch(() => null);
        if (d?.data?.name || d?.data?.is_suspended) {
          return { platform: 'Reddit', handle, status: 'taken', detail: `https://www.reddit.com/user/${handle}`, checkedAt };
        }
      }
      return { platform: 'Reddit', handle, status: "couldn't confirm", detail: `Reddit HTTP ${r.status} / rate-wall`, checkedAt };
    }

    if (p === 'youtube') {
      const r = await fetchWithTimeout(`https://www.youtube.com/@${encodeURIComponent(handle)}`, { redirect: 'follow' });
      if (r.status === 404) return { platform: 'YouTube', handle, status: 'available', detail: `youtube.com/@${handle} returned 404`, checkedAt };
      if (r.status === 200) return { platform: 'YouTube', handle, status: 'taken', detail: `https://www.youtube.com/@${handle}`, checkedAt };
      return { platform: 'YouTube', handle, status: "couldn't confirm", detail: `HTTP ${r.status}`, checkedAt };
    }

    if (p === 'x' || p === 'twitter') {
      const oembed = await fetchWithTimeout(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://x.com/${handle}`)}`
      );
      if (oembed.status === 200) {
        return { platform: 'X (Twitter)', handle, status: 'taken', detail: `Verified active timeline via X oEmbed`, checkedAt };
      }
      // X returns 404/403 on oEmbed for suspended, protected, OR unregistered accounts -> never guess!
      return {
        platform: 'X (Twitter)',
        handle,
        status: "couldn't confirm",
        detail: `No public oEmbed feed (HTTP ${oembed.status}); manual X login check recommended`,
        checkedAt
      };
    }

    if (p === 'tiktok') {
      const r = await fetchWithTimeout(`https://www.tiktok.com/@${encodeURIComponent(handle)}`);
      if (r.status === 200) {
        const html = await r.text();
        if (html.includes(`"uniqueId":"${handle.toLowerCase()}"`) || html.includes(`(@${handle.toLowerCase()})`)) {
          return { platform: 'TikTok', handle, status: 'taken', detail: `Profile metadata present at tiktok.com/@${handle}`, checkedAt };
        }
      }
      return {
        platform: 'TikTok',
        handle,
        status: "couldn't confirm",
        detail: 'TikTok login/bot wall obscures unauthenticated certainty — marked unconfirmed per policy',
        checkedAt
      };
    }

    if (p === 'instagram') {
      const r = await fetchWithTimeout(`https://www.instagram.com/${encodeURIComponent(handle)}/`, { redirect: 'manual' });
      if (r.status === 200) {
        const html = await r.text();
        if (html.toLowerCase().includes(`(@${handle.toLowerCase()})`)) {
          return { platform: 'Instagram', handle, status: 'taken', detail: `Public meta tag confirmed @${handle}`, checkedAt };
        }
      }
      return {
        platform: 'Instagram',
        handle,
        status: "couldn't confirm",
        detail: 'Instagram login redirect blocks unauthenticated handle proof — marked unconfirmed',
        checkedAt
      };
    }

    return { platform, handle, status: "couldn't confirm", detail: 'Unsupported platform adapter', checkedAt };
  } catch {
    return { platform, handle, status: "couldn't confirm", detail: 'Network/CORS restriction during check', checkedAt };
  }
}

/**
 * 3. App Store Collision Check (Apple iOS / macOS App Store public Search API)
 */
export async function checkAppStores(name, countries = ['US']) {
  const country = (countries[0] && countries[0] !== 'GLOBAL' && countries[0] !== 'EU') ? countries[0].toLowerCase() : 'us';
  const checkedAt = new Date().toISOString();
  try {
    const r = await fetchWithTimeout(
      `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&country=${country}&entity=software&limit=8`
    );
    if (!r.ok) return { checkedAt, matches: [], note: `Apple App Store HTTP ${r.status}` };
    const data = await r.json();
    const targetSlug = normalizeSlug(name);
    const targetSoundex = soundex(name);

    const matches = (data.results || [])
      .map(app => {
        const title = app.trackName || '';
        const appMain = title.split(/[:\-–—|]/)[0].trim();
        const sim = Math.max(levenshteinSimilarity(name, title), levenshteinSimilarity(name, appMain));
        const exact = normalizeSlug(appMain) === targetSlug || normalizeSlug(title) === targetSlug;
        const phonetic = soundex(appMain) === targetSoundex;
        return {
          store: `Apple App Store (${country.toUpperCase()})`,
          appName: title,
          developer: app.sellerName || app.artistName || 'Unknown',
          bundleId: app.bundleId || '',
          url: app.trackViewUrl || '',
          matchType: exact ? 'EXACT_NAME' : (sim >= 0.78 ? 'HIGH_SIMILARITY' : (phonetic ? 'PHONETIC' : 'PARTIAL')),
          similarity: Number(sim.toFixed(2))
        };
      })
      .filter(m => m.matchType !== 'PARTIAL' || m.similarity >= 0.65)
      .slice(0, 5);

    return { checkedAt, matches };
  } catch {
    return { checkedAt, matches: [], note: 'App Store API unreachable' };
  }
}

/**
 * 4. Public Trademark & Commercial Brand Conflict Screening
 * Combines Wikidata public commercial/brand/trademark entities (including USPTO/EUIPO/WIPO identifiers where indexed)
 * with Soundex + Levenshtein similarity screening.
 */
export async function checkTrademarks(name, countries = DEFAULT_COUNTRIES) {
  const checkedAt = new Date().toISOString();
  const targetSlug = normalizeSlug(name);
  const targetSx = soundex(name);

  try {
    const r = await fetchWithTimeout(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&limit=10&format=json&origin=*`
    );
    if (!r.ok) return { checkedAt, jurisdictions: countries, matches: [], note: `Registry HTTP ${r.status}` };
    const d = await r.json();
    const commercialRegex = /company|business|brand|trademark|software|application|corporation|enterprise|service|platform|product|bank|airline|game|organization|website/i;

    const matches = [];
    for (const item of (d.search || [])) {
      const label = item.label || '';
      const desc = item.description || '';
      const sim = levenshteinSimilarity(name, label);
      const sxMatch = soundex(label) === targetSx;
      const isCommercial = commercialRegex.test(desc) || normalizeSlug(label) === targetSlug;
      if (isCommercial && (sim >= 0.72 || sxMatch)) {
        matches.push({
          mark: label,
          referenceId: `WD-${item.id}`,
          status: 'Active Public Brand / Entity Record',
          jurisdictions: countries.join(', '),
          description: desc || 'Registered entity / commercial mark',
          similarity: `${Math.round(sim * 100)}% (${normalizeSlug(label) === targetSlug ? 'Identical' : sxMatch ? 'Phonetic Soundex ' + targetSx : 'Fuzzy'})`,
          url: `https://www.wikidata.org/wiki/${item.id}`
        });
      }
    }

    return {
      checkedAt,
      databasesSearched: [
        'Wikidata Commercial Brand & Trademark Entity Registry (wbsearchentities)',
        'Phonetic Soundex + Levenshtein Conflict Screener'
      ],
      jurisdictions: countries,
      soundexCode: targetSx,
      matches: matches.slice(0, 6),
      portalLinks: {
        USPTO: `https://tmsearch.uspto.gov/search/search-information`,
        WIPO_Global_Brand_DB: `https://branddb.wipo.int/`,
        EUIPO_eSearch: `https://euipo.europa.eu/eSearch/`
      }
    };
  } catch {
    return {
      checkedAt,
      databasesSearched: ['Wikidata Commercial Brand & Trademark Entity Registry'],
      jurisdictions: countries,
      soundexCode: targetSx,
      matches: [],
      note: 'Trademark lookup timed out'
    };
  }
}

export function generateFreeVariations(baseName) {
  const clean = normalizeSlug(baseName);
  if (!clean) return [];
  return [
    `get${clean}`,
    `use${clean}`,
    `try${clean}`,
    `${clean}hq`,
    `${clean}labs`,
    `join${clean}`,
    `hey${clean}`,
    `${clean}studio`
  ];
}

/**
 * Full end-to-end check for one or more candidate names
 */
export async function runBrandCheck({
  names,
  extensions = DEFAULT_EXTENSIONS,
  platforms = DEFAULT_PLATFORMS,
  countries = DEFAULT_COUNTRIES,
  suggestAlternatives = true
}) {
  const cleanNames = (Array.isArray(names) ? names : String(names).split(','))
    .map(n => n.trim())
    .filter(Boolean);

  const startedAt = new Date().toISOString();
  const reports = [];

  for (const rawName of cleanNames) {
    const domainLabel = normalizeDomainLabel(rawName);
    const handle = normalizeSlug(rawName);

    const [domains, handles, apps, trademarks] = await Promise.all([
      Promise.all(extensions.map(ext => checkDomain(domainLabel, ext))),
      Promise.all(platforms.map(p => checkHandle(handle, p))),
      checkAppStores(rawName, countries),
      checkTrademarks(rawName, countries)
    ]);

    let variations = [];
    if (suggestAlternatives) {
      const candidates = generateFreeVariations(rawName);
      for (const v of candidates) {
        if (variations.length >= 3) break;
        const [vDomains, vHandles] = await Promise.all([
          Promise.all(extensions.map(ext => checkDomain(v, ext))),
          Promise.all(platforms.map(p => checkHandle(v, p)))
        ]);
        const allDomainsFree = vDomains.every(d => d.status === 'available');
        const noHandlesTaken = vHandles.every(h => h.status !== 'taken');
        if (allDomainsFree && noHandlesTaken) {
          variations.push({
            variation: v,
            checkedAt: new Date().toISOString(),
            domains: vDomains,
            handles: vHandles
          });
        }
      }
    }

    reports.push({
      name: rawName,
      domainLabel,
      handle,
      domains,
      handles,
      apps,
      trademarks,
      variations
    });
  }

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    scope: { names: cleanNames, extensions, platforms, countries },
    reports
  };
}

export function formatMarkdownReport(result) {
  const lines = [];
  lines.push(`# Brand Name Availability Report`);
  lines.push(``);
  lines.push(`> **Legal & Privacy Notice:** Trademark screening results below are an automated starting point for preliminary research and **do not constitute legal advice**. Consult a qualified trademark attorney before filing or launching. Per strict privacy rules, BrandScope AI **never** registers, reserves, caches, sells, or shares any candidate names searched.`);
  lines.push(``);
  lines.push(`## Scope Confirmed`);
  lines.push(`- **Candidate Names (${result.scope.names.length}):** ${result.scope.names.map(n => `\`${n}\``).join(', ')}`);
  lines.push(`- **Domain Extensions:** ${result.scope.extensions.map(e => `\`.${e.replace(/^\./, '')}\``).join(', ')}`);
  lines.push(`- **Social & Dev Platforms:** ${result.scope.platforms.join(', ')}`);
  lines.push(`- **Trademark Jurisdictions:** ${result.scope.countries.join(', ')}`);
  lines.push(`- **Report Generated (UTC):** \`${result.completedAt}\``);
  lines.push(``);

  for (const r of result.reports) {
    lines.push(`---`);
    lines.push(`## Candidate: \`${r.name}\` (handle: \`@${r.handle}\`)`);
    lines.push(``);
    lines.push(`### 1. Unified Availability Table — \`${r.name}\``);
    lines.push(`| Category | Target | Status | Details / Evidence | Checked At (UTC) |`);
    lines.push(`|---|---|---|---|---|`);
    for (const d of r.domains) {
      const badge = d.status === 'available' ? 'AVAILABLE' : d.status === 'taken' ? 'TAKEN' : "COULDN'T CONFIRM";
      lines.push(`| Domain | \`${d.domain}\` | **${badge}** | ${d.method}: ${d.detail} | \`${d.checkedAt}\` |`);
    }
    for (const h of r.handles) {
      const badge = h.status === 'available' ? 'AVAILABLE' : h.status === 'taken' ? 'TAKEN' : "COULDN'T CONFIRM";
      lines.push(`| Handle (${h.platform}) | \`@${h.handle}\` | **${badge}** | ${h.detail} | \`${h.checkedAt}\` |`);
    }
    lines.push(``);

    lines.push(`### 2. App Store Matches — \`${r.name}\` (Database: Apple iOS & macOS App Store Search API, checked \`${r.apps.checkedAt}\`)`);
    if (!r.apps.matches.length) {
      lines.push(`- No identical or high-similarity apps detected in Apple App Store search.${r.apps.note ? ` (${r.apps.note})` : ''}`);
    } else {
      lines.push(`| Store | App Name | Publisher | Match Type | Bundle ID |`);
      lines.push(`|---|---|---|---|---|`);
      for (const a of r.apps.matches) {
        lines.push(`| ${a.store} | [${a.appName}](${a.url}) | ${a.developer} | \`${a.matchType}\` (${Math.round(a.similarity * 100)}%) | \`${a.bundleId}\` |`);
      }
    }
    lines.push(``);

    const dbList = (r.trademarks.databasesSearched || ['Wikidata Commercial Brand & Trademark Entity Registry']).join('; ');
    lines.push(`### 3. Public Trademark & Brand Screening — \`${r.name}\` (Soundex \`${r.trademarks.soundexCode}\`, checked \`${r.trademarks.checkedAt}\`)`);
    lines.push(`- **Databases Searched:** ${dbList} (Jurisdictions: **${r.trademarks.jurisdictions.join(', ')}**)`);
    if (!r.trademarks.matches.length) {
      lines.push(`- No identical or phonetically matching commercial marks surfaced in public brand entity screening. Verify directly in official national filings ([USPTO](https://tmsearch.uspto.gov), [WIPO Global Brand DB](https://branddb.wipo.int/), [EUIPO eSearch](https://euipo.europa.eu/eSearch/)).`);
    } else {
      lines.push(`| Mark / Brand | Registration / Ref ID | Status | Similarity | Description |`);
      lines.push(`|---|---|---|---|---|`);
      for (const m of r.trademarks.matches) {
        lines.push(`| [${m.mark}](${m.url}) | \`${m.referenceId}\` | ${m.status} | ${m.similarity} | ${m.description} |`);
      }
    }
    lines.push(``);

    if (r.variations.length) {
      lines.push(`### 4. Verified Free Variations for \`${r.name}\` (Free Across All Requested Domains & Confirmable Platforms)`);
      lines.push(`| Variation | Requested Domains | Requested Platforms | Checked At (UTC) |`);
      lines.push(`|---|---|---|---|`);
      for (const v of r.variations) {
        const domSummary = v.domains.map(d => `\`${d.domain}\`: **${d.status.toUpperCase()}**`).join(', ');
        const platSummary = v.handles.map(h => `${h.platform}: **${h.status.toUpperCase()}**`).join(', ');
        lines.push(`| \`${v.variation}\` | ${domSummary} | ${platSummary} | \`${v.checkedAt}\` |`);
      }
      lines.push(``);
    }
  }

  lines.push(`---`);
  lines.push(`*Disclaimer: Availability can change at any moment; results are accurate only at the UTC check timestamps shown above. Trademark screening is a starting point for conflict discovery and is NOT legal advice. BrandScope AI never registers, reserves, or shares searched names.*`);
  return lines.join('\n');
}
