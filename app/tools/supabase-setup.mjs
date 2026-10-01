/*
 * One-shot backend setup through the Supabase Management API, Resend API and
 * Render API (credentials are injected by the environment's proxy).
 *
 *   node tools/supabase-setup.mjs [--migrate] [--auth] [--render]   (no flags = all)
 *
 * --migrate  apply supabase/migrations/*.sql not applied yet
 * --auth     auth settings: email OTP (6 digits), guests, 45s resend (B27),
 *            Resend SMTP, RU/EN email templates, redirect URLs
 * --render   put the project URL + anon key into the Render site and redeploy
 * --push     VAPID secrets, deploy Edge Function push-reminders, pg_cron every 15 min
 *            (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in the environment)
 * --fn       redeploy only the code of push-reminders (secrets and cron stay)
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const DOMAIN = process.env.VEYRARC_DOMAIN || 'veyrarc.online';
const RENDER_SERVICE = 'srv-datp16qd0e5s73d09g10';
const RENDER_URL = 'https://veyrarc.onrender.com';
const flags = new Set(process.argv.slice(2));
const all = flags.size === 0;

async function api(base, method, p, body) {
  const res = await fetch(base + p, {
    method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${base}${p} → ${res.status} ${res.headers.get('x-proxy-error') ?? ''} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
const sb = (m, p, b) => api('https://api.supabase.com', m, p, b);
const resend = (m, p, b) => api('https://api.resend.com', m, p, b);
const render = (m, p, b) => api('https://api.render.com/v1', m, p, b);

const projects = await sb('GET', '/v1/projects');
const project = projects.find((p) => p.id === process.env.SUPABASE_PROJECT_REF) ?? projects.find((p) => /veyr/i.test(p.name)) ?? (projects.length === 1 ? projects[0] : null);
if (!project) throw new Error('Supabase project not found: ' + projects.map((p) => p.name).join(', '));
const ref = project.id;
console.log('project', project.name, ref, project.region);
const sql = (query) => sb('POST', `/v1/projects/${ref}/database/query`, { query });

/* ---------------- migrations ---------------- */
if (all || flags.has('--migrate')) {
  await sql(`create schema if not exists private;
    create table if not exists private.applied_migrations (name text primary key, applied_at timestamptz not null default now());`);
  const done = new Set((await sql('select name from private.applied_migrations')).map((r) => r.name));
  const dir = path.join(root, 'supabase/migrations');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) { console.log('skip', f); continue; }
    const body = fs.readFileSync(path.join(dir, f), 'utf8');
    await sql(`begin;\n${body}\ninsert into private.applied_migrations (name) values ('${f}');\ncommit;`);
    console.log('applied', f);
  }
}

/* ---------------- auth ---------------- */
function mail(ru, en, codeLine) {
  const box = (title, sub) => `<div style="background:#05070A;padding:32px 16px;font-family:Manrope,Arial,sans-serif">
<div style="max-width:440px;margin:0 auto;background:#0D1116;border:1px solid rgba(168,203,239,.14);border-radius:20px;padding:28px">
<div style="font:700 11px monospace;letter-spacing:.24em;color:rgba(232,237,243,.45)">VEYRARC</div>
<div style="font:800 22px Arial,sans-serif;color:#F3F6FA;margin-top:14px">${title}</div>
<div style="font:400 14px/1.5 Arial,sans-serif;color:rgba(232,237,243,.6);margin-top:8px">${sub}</div>
<div style="font:700 32px monospace;letter-spacing:.3em;color:#A8CBEF;margin-top:22px">{{ .Token }}</div>
<div style="font:400 12px Arial,sans-serif;color:rgba(232,237,243,.4);margin-top:22px">${codeLine}</div></div></div>`;
  return `{{ if eq .Data.lang "en" }}${box(en[0], en[1])}{{ else }}${box(ru[0], ru[1])}{{ end }}`;
}
if (all || flags.has('--auth')) {
  // SMTP key: a sending-only Resend key for this domain (created once, stored only in Supabase)
  const domains = (await resend('GET', '/domains')).data;
  const dom = domains.find((d) => d.name === DOMAIN);
  if (!dom) throw new Error(`Resend domain ${DOMAIN} missing`);
  console.log('resend domain', dom.name, dom.status);
  // until the domain is verified no email can be delivered: sign-up then skips the code step
  const mailReady = dom.status === 'verified';
  const key = mailReady ? await resend('POST', '/api-keys', { name: `supabase-smtp-${Date.now()}`, permission: 'sending_access', domain_id: dom.id }) : null;

  const foot = ['Код действует 1 час. Если это были не вы — просто проигнорируйте письмо.', 'The code is valid for 1 hour. If this wasn’t you, ignore this email.'];
  const cfg = {
    site_url: process.env.SITE_URL || RENDER_URL,
    uri_allow_list: [`https://${DOMAIN}/**`, `https://app.${DOMAIN}/**`, `https://www.${DOMAIN}/**`, `${RENDER_URL}/**`, 'http://localhost:5173/**', 'http://localhost:4173/**'].join(','),
    external_anonymous_users_enabled: true,
    security_manual_linking_enabled: true,
    external_email_enabled: true,
    mailer_autoconfirm: !mailReady,
    mailer_secure_email_change_enabled: false,
    mailer_otp_length: 6,
    mailer_otp_exp: 3600,
    smtp_max_frequency: 45,
    password_min_length: 8,
    ...(mailReady ? {
      smtp_host: 'smtp.resend.com', smtp_port: '465', smtp_user: 'resend', smtp_pass: key.token,
      smtp_admin_email: `no-reply@${DOMAIN}`, smtp_sender_name: 'VeyrArc', rate_limit_email_sent: 60,
      mailer_subjects_confirmation: 'VeyrArc: код подтверждения / confirmation code',
      mailer_templates_confirmation_content: mail(['Подтверди email', 'Введи этот код в приложении, чтобы сохранить прогресс.'], ['Confirm your email', 'Enter this code in the app to save your progress.'], `${foot[0]}<br>${foot[1]}`),
      mailer_subjects_email_change: 'VeyrArc: код подтверждения / confirmation code',
      mailer_templates_email_change_content: mail(['Подтверди email', 'Введи этот код в приложении, чтобы сохранить прогресс.'], ['Confirm your email', 'Enter this code in the app to save your progress.'], `${foot[0]}<br>${foot[1]}`),
      mailer_subjects_recovery: 'VeyrArc: сброс пароля / password reset',
      mailer_templates_recovery_content: mail(['Сброс пароля', 'Введи этот код в приложении, чтобы задать новый пароль.'], ['Reset your password', 'Enter this code in the app to set a new password.'], `${foot[0]}<br>${foot[1]}`),
      mailer_subjects_magic_link: 'VeyrArc: код входа / sign-in code',
      mailer_templates_magic_link_content: mail(['Код для входа', 'Введи этот код в приложении.'], ['Your sign-in code', 'Enter this code in the app.'], `${foot[0]}<br>${foot[1]}`),
    } : {}),
  };
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    Object.assign(cfg, { external_google_enabled: true, external_google_client_id: process.env.GOOGLE_CLIENT_ID, external_google_secret: process.env.GOOGLE_CLIENT_SECRET });
  }
  await sb('PATCH', `/v1/projects/${ref}/config/auth`, cfg);
  const now = await sb('GET', `/v1/projects/${ref}/config/auth`);
  console.log('auth', { autoconfirm: now.mailer_autoconfirm, anonymous: now.external_anonymous_users_enabled, otp: now.mailer_otp_length, resendEvery: now.smtp_max_frequency, smtp: now.smtp_host, google: now.external_google_enabled });
}

/* ---------------- function code only ---------------- */
async function deployFn() {
  const code = fs.readFileSync(path.join(root, 'supabase/functions/push-reminders/index.ts'));
  const form = new FormData();
  form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', name: 'push-reminders', verify_jwt: false }));
  form.append('file', new Blob([code], { type: 'application/typescript' }), 'index.ts');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=push-reminders`, { method: 'POST', body: form });
  const txt = await res.text();
  if (!res.ok) throw new Error('function deploy → ' + res.status + ' ' + txt.slice(0, 300));
  console.log('function', JSON.parse(txt).status ?? 'deployed');
}
if (flags.has('--fn')) await deployFn();

/* ---------------- push ---------------- */
if (flags.has('--push')) {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing');
  const cron = (await import('node:crypto')).randomBytes(24).toString('hex');
  await sb('POST', `/v1/projects/${ref}/secrets`, [
    { name: 'VAPID_PUBLIC_KEY', value: pub }, { name: 'VAPID_PRIVATE_KEY', value: priv }, { name: 'CRON_SECRET', value: cron },
  ]);
  await deployFn();
  const url = `https://${ref}.supabase.co/functions/v1/push-reminders`;
  await sql(`create extension if not exists pg_cron; create extension if not exists pg_net;
    select cron.unschedule(jobid) from cron.job where jobname = 'push-reminders';
    select cron.schedule('push-reminders', '*/15 * * * *', $cron$ select net.http_post(url := '${url}', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '${cron}'), body := '{}'::jsonb) $cron$);`);
  console.log('cron scheduled every 15 min');
  // Render needs the public key for the subscription
  const envs = (await render('GET', `/services/${RENDER_SERVICE}/env-vars`)).map((e) => e.envVar).filter((e) => e.key !== 'VITE_VAPID_PUBLIC_KEY');
  await render('PUT', `/services/${RENDER_SERVICE}/env-vars`, [...envs.map(({ key, value }) => ({ key, value })), { key: 'VITE_VAPID_PUBLIC_KEY', value: pub }]);
  console.log('render env VITE_VAPID_PUBLIC_KEY set');
}

/* ---------------- render ---------------- */
if (all || flags.has('--render')) {
  const keys = await sb('GET', `/v1/projects/${ref}/api-keys?reveal=true`);
  const anon = keys.find((k) => k.type === 'publishable') ?? keys.find((k) => k.name === 'anon');
  if (!anon?.api_key) throw new Error('anon/publishable key not found');
  await render('PUT', `/services/${RENDER_SERVICE}/env-vars`, [
    { key: 'NODE_VERSION', value: '22' },
    { key: 'VITE_SUPABASE_URL', value: `https://${ref}.supabase.co` },
    { key: 'VITE_SUPABASE_ANON_KEY', value: anon.api_key },
    { key: 'VITE_AUTH_GOOGLE', value: process.env.GOOGLE_CLIENT_ID ? '1' : '0' },
    ...(await render('GET', `/services/${RENDER_SERVICE}/env-vars`)).map((e) => e.envVar).filter((e) => e.key === 'VITE_VAPID_PUBLIC_KEY').map(({ key, value }) => ({ key, value })),
  ]);
  const dep = await render('POST', `/services/${RENDER_SERVICE}/deploys`, { clearCache: 'do_not_clear' });
  console.log('render deploy', dep.id, dep.status);
  fs.writeFileSync(path.join(root, 'app/.env.local'), `VITE_SUPABASE_URL=https://${ref}.supabase.co\nVITE_SUPABASE_ANON_KEY=${anon.api_key}\n`);
  console.log('wrote app/.env.local (git-ignored) for local runs');
}
