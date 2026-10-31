#!/usr/bin/env node
import { runBrandCheck, formatMarkdownReport, DEFAULT_EXTENSIONS, DEFAULT_PLATFORMS, DEFAULT_COUNTRIES } from './checker.mjs';

const args = process.argv.slice(2);
const names = [];
let extensions = DEFAULT_EXTENSIONS;
let platforms = DEFAULT_PLATFORMS;
let countries = DEFAULT_COUNTRIES;
let jsonMode = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--ext' && args[i + 1]) extensions = args[++i].split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--platforms' && args[i + 1]) platforms = args[++i].split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--countries' && args[i + 1]) countries = args[++i].split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--json') jsonMode = true;
  else if (!a.startsWith('--')) names.push(a);
}

if (!names.length) {
  console.error('Usage: node src/cli.mjs <BrandName1> [BrandName2...] [--ext com,io,ai] [--platforms github,npm,x,instagram] [--countries US,EU] [--json]');
  process.exit(1);
}

const result = await runBrandCheck({ names, extensions, platforms, countries });
if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(formatMarkdownReport(result));
}
