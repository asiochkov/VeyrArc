// A stand-in for the YooKassa API used by the billing e2e: payments with a redirect «payment page»
// that pays at once, saved cards, recurring charges, refunds. Port 54401.
//  GET  /pay/:id          — the «payment page»: marks the payment paid and redirects to return_url
//  POST /__decline        — the next recurring charge is declined
//  POST /__refund/:id     — a succeeded refund for the payment (returns the refund)
import http from 'node:http';
import { randomUUID } from 'node:crypto';
const pays = new Map(), refunds = new Map(), keys = new Map();
let decline = false;
const card = (id) => ({ id: 'pm-' + id, type: 'bank_card', saved: true, card: { last4: '4477', card_type: 'Visa' } });
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let raw = ''; for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  if (u.pathname.startsWith('/pay/')) {
    const p = pays.get(u.pathname.slice(5));
    if (!p) return send(res, 404, {});
    Object.assign(p, { status: 'succeeded', paid: true, payment_method: p.save ? card(p.id) : { type: 'bank_card', saved: false, card: { last4: '4477', card_type: 'Visa' } } });
    res.writeHead(302, { location: p.return_url }); return res.end();
  }
  if (u.pathname === '/__decline') { decline = true; return send(res, 200, {}); }
  if (u.pathname === '/__reset') { decline = false; return send(res, 200, {}); }
  if (u.pathname.startsWith('/__refund/')) {
    const r = { id: 'rf-' + randomUUID(), status: 'succeeded', payment_id: u.pathname.slice(10) };
    refunds.set(r.id, r); return send(res, 200, r);
  }
  if (req.headers.authorization !== 'Basic ' + Buffer.from('test-shop:test-secret').toString('base64')) return send(res, 401, { type: 'error', code: 'invalid_credentials' });
  if (req.method === 'POST' && u.pathname === '/v3/payments') {
    const key = req.headers['idempotence-key'];
    if (!key) return send(res, 400, { code: 'invalid_request' });
    if (keys.has(key)) return send(res, 200, pays.get(keys.get(key)));
    const id = randomUUID();
    const p = { id, amount: body.amount, description: body.description, metadata: body.metadata, receipt: body.receipt, paid: false, status: 'pending', save: !!body.save_payment_method };
    if (body.payment_method_id) {
      if (decline) { decline = false; Object.assign(p, { status: 'canceled' }); }
      else Object.assign(p, { status: 'succeeded', paid: true, payment_method: { ...card(id), id: body.payment_method_id } });
    } else {
      p.return_url = body.confirmation.return_url;
      p.confirmation = { type: 'redirect', confirmation_url: `http://127.0.0.1:54401/pay/${id}` };
    }
    pays.set(id, p); keys.set(key, id);
    return send(res, 200, p);
  }
  if (req.method === 'GET' && u.pathname.startsWith('/v3/payments/')) { const p = pays.get(u.pathname.slice(13)); return p ? send(res, 200, p) : send(res, 404, {}); }
  if (req.method === 'GET' && u.pathname.startsWith('/v3/refunds/')) { const r = refunds.get(u.pathname.slice(12)); return r ? send(res, 200, r) : send(res, 404, {}); }
  send(res, 404, {});
}).listen(54401, '127.0.0.1');
