/*
 * Turns dist-preview/index.html into the body-only page the Artifact host
 * expects (it supplies <!doctype>, <html>, <head> and <body> itself).
 */
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(import.meta.dirname, '../dist-preview/index.html');
const html = fs.readFileSync(file, 'utf8');
const tags = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="\.\/assets\/[^"]+"[^>]*>(?:<\/script>)?/g)].map((m) => m[0]);
if (!tags.length) throw new Error('no asset tags found');
const page = `<title>VeyrArc Preview</title>
<meta name="theme-color" content="#05070A">
<style>:root{color-scheme:dark;background:#05070A}</style>
${tags.join('\n')}
<div id="root"></div>
`;
fs.writeFileSync(path.resolve(path.dirname(file), 'page.html'), page);
console.log('page.html:', tags.length, 'asset tags');
