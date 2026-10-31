# BrandScope AI — Brand Name Availability Checker (Domains, Handles, App Stores & Trademarks)

**Live Interactive Web App:** [https://vanthoai3010.github.io/brandscope-ai-agent/](https://vanthoai3010.github.io/brandscope-ai-agent/)

An autonomous **Research** agent and zero-dependency Node.js / Web engine built for **NEAR AI Agent Market** that checks one or more candidate brand, product, or project names across **domains**, **social & developer handles**, **major app stores**, and **public trademark/commercial brand registries**—returning one timestamped, decision-ready table per candidate name.

---

## Listing Description (NEAR AI Agent Market — `Research` Category)

- **Suggested Listing Name:** `Brand Name Availability Checker — Domains, Handles, App Stores & Trademarks`
- **Category:** `Research`
- **Typical Delivery Time:** Under 60 seconds for 1–5 candidate names.

### What This Agent Checks (By Default & On Request)
1. **Domains (Zero Registrar Front-Running Leakage):**
   - Default extensions: `.com`, `.io`, `.ai`, `.dev`, `.app`, `.co`, `.xyz`, `.org` (plus any custom TLDs requested by the buyer).
   - Uses **Cloudflare DNS-over-HTTPS (`NS` + `A`)** paired with **IANA RDAP (`rdap.org`)** registration checks—never querying commercial domain registrar search bars that cache or front-run searches.
2. **Social & Developer Handles (Honest Unconfirmed Policy):**
   - Default platforms: `GitHub`, `npm`, `PyPI`, `Reddit`, `YouTube`, `X (Twitter)`, `Instagram`, `TikTok`.
   - Reports deterministic `AVAILABLE` or `TAKEN` where public endpoints confirm status, and explicitly reports **`COULDN'T CONFIRM`** whenever login walls or anti-bot gates (`Instagram`, `TikTok`, `X` protected/unindexed accounts) block unauthenticated certainty—never guessing.
3. **App Stores:**
   - Searches **Apple iOS & macOS App Store Search API** for exact, high-similarity (Levenshtein), and phonetic (Soundex) app name collisions with publisher & bundle IDs.
4. **Public Trademarks & Commercial Brand Screening:**
   - Screens **Wikidata Commercial Brand & Trademark Entity Registry** using exact slug, Levenshtein fuzzy similarity, and **Soundex phonetic matching** across requested jurisdictions (`US`, `EU`, `GLOBAL`), listing entity/reference IDs, active status, and direct verification links to **USPTO**, **WIPO Global Brand Database**, and **EUIPO eSearch**.
5. **Verified Free Variations:**
   - When requested, generates and live-verifies variations (`get...`, `use...`, `try...`, `...hq`, `...labs`) and **only suggests variations verified free across all requested domains and confirmable platforms at check time**.

### Privacy & Legal Rules Enforced on Every Job
- **Zero Registration / Zero Front-Running:** Never registers, reserves, or buys any searched domain or handle, and never logs, caches, sells, or shares candidate names.
- **Buyer Control:** Never registers assets on the buyer's behalf.
- **Non-Legal-Advice Notice:** Every report states clearly that trademark screening is an automated starting point for preliminary conflict discovery and **not legal advice**.

### Short FAQ
- **Q: What is the minimum input required?**
  - **A:** Just one or more candidate names (e.g., `KestrelPay, VibeForge`). Optional: custom domain extensions, specific platforms, trademark jurisdictions, and whether to suggest free variations.
- **Q: Why do Instagram, TikTok, or X sometimes say `COULDN'T CONFIRM`?**
  - **A:** Those platforms block unauthenticated availability proofs behind login walls. When public metadata confirms an active profile, we report `TAKEN`; when login walls prevent 100% certainty that a handle is free, we report `COULDN'T CONFIRM` rather than guessing.
- **Q: Could checking my name here leak it to domain squatters?**
  - **A:** No. Lookups query authoritative DNS-over-HTTPS and RDAP registries directly in read-only mode, with zero third-party registrar search APIs and zero name retention.
- **Q: Is the trademark section a legal clearance opinion?**
  - **A:** No. It flags identical and phonetically similar public marks as a starting point and is not legal advice. Always consult a trademark attorney before filing.

---

## Quick Start (CLI, Tests & NEAR Worker)

```bash
# Run unit + live end-to-end registry verification suite
npm test

# Run a live multi-name check from CLI (outputs structured Markdown)
node src/cli.mjs "VibeForge, Stripe" --ext com,io,ai,dev --platforms github,npm,pypi,x,instagram,tiktok --countries US,EU

# Run autonomous NEAR AI Agent Market assignment worker loop
NEAR_MARKET_API_KEY=aat_your_token node src/near-worker.mjs
```
