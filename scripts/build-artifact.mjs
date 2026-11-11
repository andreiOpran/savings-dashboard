#!/usr/bin/env node
/**
 * Pack the Vite build (dist/) into one self-contained HTML page for publishing
 * as a private claude.ai Artifact: CSS and JS inlined, no external files.
 * The Artifact host adds <!doctype>, <html>, <head> and <body> itself.
 *
 *   npm run build && node scripts/build-artifact.mjs [out.html]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dist = 'dist';
const out = process.argv[2] ?? join(dist, 'economii-artifact.html');
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const cssHrefs = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/g)].map((m) => m[1]);
const jsSrcs = [...html.matchAll(/<script type="module"[^>]*src="\.\/([^"]+)"/g)].map((m) => m[1]);
if (jsSrcs.length !== 1) throw new Error(`expected one JS bundle, found ${jsSrcs.length}`);

const css = cssHrefs.map((f) => readFileSync(join(dist, f), 'utf8')).join('\n');
// A literal "</script" inside the bundle would end the inline script early.
const js = readFileSync(join(dist, jsSrcs[0]), 'utf8').replace(/<\/script/gi, '<\\/script');

const page = `<title>Economii</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="robots" content="noindex, nofollow">
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KiB)`);
