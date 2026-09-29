// Local stand-in for Supabase's API gateway + a mail sink that keeps OTP codes.
import http from 'node:http';
import fs from 'node:fs';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';

const mails = [];
new SMTPServer({
  authOptional: true, allowInsecureAuth: true, disabledCommands: ['STARTTLS'],
  onAuth(_a, _s, cb) { cb(null, { user: 'x' }); },
  onData(stream, _s, cb) {
    simpleParser(stream).then((m) => {
      const text = (m.html || '') + ' ' + (m.text || '');
      const code = (text.match(/\b(\d{6})\b/) || [])[1] || null;
      const rec = { to: m.to?.text, subject: m.subject, code, at: Date.now() };
      mails.push(rec); fs.appendFileSync('mail/log.jsonl', JSON.stringify(rec) + '\n');
      cb();
    }).catch(cb);
  },
}).listen(2500, '127.0.0.1');

const tpl = (title) => `<h2>${title}</h2><p>{{ if eq .Data.lang "en" }}EN{{ else }}RU{{ end }}</p><p>Code: {{ .Token }}</p>`;
const TPL = { confirmation: tpl('Confirm'), recovery: tpl('Reset'), email_change: tpl('Email change'), magic_link: tpl('Magic') };

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': '*' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (u.pathname.startsWith('/__tpl/')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(TPL[u.pathname.slice(7)] || ''); }
  if (u.pathname === '/__mail') {
    const to = u.searchParams.get('to');
    const list = mails.filter((m) => !to || (m.to || '').includes(to));
    res.writeHead(200, { 'content-type': 'application/json', ...cors }); return res.end(JSON.stringify(list.at(-1) || null));
  }
  let target;
  if (u.pathname.startsWith('/auth/v1')) target = { port: 9999, path: u.pathname.slice(8) + u.search };
  else if (u.pathname.startsWith('/rest/v1')) target = { port: 3000, path: (u.pathname.slice(8) || '/') + u.search };
  else { res.writeHead(404, cors); return res.end(); }
  const p = http.request({ host: '127.0.0.1', port: target.port, path: target.path, method: req.method, headers: { ...req.headers, host: '127.0.0.1' } }, (r) => {
    const h = { ...r.headers, ...cors };
    res.writeHead(r.statusCode, h); r.pipe(res);
  });
  p.on('error', (e) => { res.writeHead(502, cors); res.end(String(e)); });
  req.pipe(p);
}).listen(54321, '127.0.0.1');
console.log('gateway :54321, smtp :2500');
