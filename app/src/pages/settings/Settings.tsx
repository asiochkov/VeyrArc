import { config } from '../../config';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { useHeader } from '../../data/header';
import { daysBetween } from '../../data/model';
import { exportData, startNewArc, setProfile } from '../../data/settings';
import { SYSTEM_KEY, useSystem } from '../../state/system';
import { toast } from '../../ui/toast';
import { useAuth, userEmail, isProPlan } from '../../lib/auth';
import { isoDay } from '../../lib/day';
import { askPermission } from '../../lib/reminders';
import { sendTestPush } from '../../lib/push';
import { parseImport, runImport } from '../../lib/importData';
import { Link, useNavigate } from 'react-router-dom';
import { AccountDialogs, type AccountModal } from '../../app/AccountDialogs';
import { deleteAccount, signOut } from '../../lib/auth';
import { hasBackend } from '../../lib/supabase';
import { useLangStore, useT, type Lang, type T } from '../../i18n';
import { useIsDesktop } from '../../lib/useIsDesktop';
import { Icon, type IconName } from '../../ui/Icon';
import { ConfirmDialog, PhotoImg, Segmented } from '../../ui/primitives';
import { OathSheet } from '../../ui/OathSheet';
import { roman } from '../../app/AppHeader';
import { useDensity } from '../../lib/density';
import s from './settings.module.css';

/* VeyrArc Settings.dc.html */

const ACCOUNT = { name: 'Анна Петрова', email: 'anna.petrova@gmail.com', renew: { ru: '12 окт. 2026', en: 'Oct 12, 2026' }, version: '1.4.0' };
const ARCS = [
  { id: 'arc1', n: 1, dates: { ru: '1 июн. – 29 авг.', en: 'Jun 1 – Aug 29' }, pct: '78%', current: false },
  { id: 'arc2', n: 2, dates: { ru: '9 сент. – 7 дек.', en: 'Sep 9 – Dec 7' }, pct: '16%', current: true },
];
/* Master Changeset RS-7: seven groups, Notion-like */
type Group = 'account' | 'appearance' | 'notif' | 'arc' | 'plan' | 'data' | 'about';
const SHORTCUTS: [string, string][] = [['⌘K', 'palette'], ['C', 'create'], ['G T', 'today'], ['G H', 'disciplines'], ['G P', 'planner'], ['G L', 'goals'], ['G A', 'analytics'], ['[', 'sidebar']];

export function Settings() {
  const t = useT();
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const lang = useLangStore((x) => x.lang);
  const setLang = useLangStore((x) => x.setLang);
  const [langOpen, setLangOpen] = useState(false);
  const [group, setGroup] = useState<Group>('account');
  const { session, profile, plan } = useAuth();
  const hd = useHeader();
  const qc = useQueryClient();
  const arcsQ = useSystem((r) => r.arcs);
  const [unitLocal, setUnitLocal] = useState<'ml' | 'oz'>('ml');
  const [notifLocal, setNotifLocal] = useState({ n1: true, n2: true, n3: true, n4: true });
  // backend: values live in the profile row
  const unit = hasBackend ? profile?.water_unit ?? 'ml' : unitLocal;
  const setUnit = (u: 'ml' | 'oz') => { if (hasBackend) setProfile({ water_unit: u }); else setUnitLocal(u); };
  const NOTIF_COL = { n1: 'notify_habits', n2: 'notify_summary', n3: 'notify_focus', n4: 'notify_arc' } as const;
  const notif = hasBackend && profile
    ? { n1: profile.notify_habits, n2: profile.notify_summary, n3: profile.notify_focus, n4: profile.notify_arc }
    : notifLocal;
  const toggleNotif = (k: keyof typeof NOTIF_COL) => {
    if (!notif[k]) void askPermission();
    if (hasBackend) setProfile({ [NOTIF_COL[k]]: !notif[k] });
    else setNotifLocal((n) => ({ ...n, [k]: !n[k] }));
  };
  const [quietLocal, setQuietLocal] = useState<[string, string] | null>(null);
  const qv: [string, string] | null = hasBackend ? (profile?.quiet_from && profile?.quiet_to ? [profile.quiet_from.slice(0, 5), profile.quiet_to.slice(0, 5)] : null) : quietLocal;
  const quiet = { on: !!qv, from: qv?.[0] ?? '22:00', to: qv?.[1] ?? '08:00' };
  const setQuiet = (v: [string, string] | null) => { if (hasBackend) setProfile({ quiet_from: v?.[0] ?? null, quiet_to: v?.[1] ?? null }); else setQuietLocal(v); };
  const testPush = async () => {
    const r = await sendTestPush().catch(() => 'failed' as const);
    if (r === 'sent') toast.success(t('settings.testSent'));
    else toast.error(t(r === 'denied' ? 'settings.testDenied' : r === 'unsupported' ? 'settings.testUnsupported' : 'settings.testFailed'));
  };
  const pickLang = (l: Lang) => { setLang(l); if (hasBackend) setProfile({ lang: l }); };
  const account = hasBackend
    ? { name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || userEmail(session), email: userEmail(session), initials: hd.initials }
    : { name: ACCOUNT.name, email: ACCOUNT.email, initials: hd.initials };
  const isPro = hasBackend ? isProPlan(plan) : true;
  const renew = hasBackend && plan?.renews_at
    ? new Date(plan.renews_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
    : t.pick(ACCOUNT.renew);
  const fmtD = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short' });
  const arcs = hasBackend
    ? (arcsQ.data ?? []).slice().reverse().map((a) => {
      const end = a.ended_on ?? new Date(new Date(a.started_on + 'T00:00:00').getTime() + (a.length_days - 1) * 86400000).toISOString().slice(0, 10);
      const elapsed = Math.min(a.length_days, daysBetween(a.started_on, a.ended_on ?? isoDay()) + 1);
      return { id: a.id, n: a.number, dates: { ru: `${fmtD(a.started_on)} – ${fmtD(end)}`, en: `${fmtD(a.started_on)} – ${fmtD(end)}` }, pct: ((a.summary as { pct?: number } | null)?.pct ?? Math.round((elapsed / a.length_days) * 100)) + '%', current: !a.ended_on };
    })
    : ARCS;
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [arcModal, setArcModal] = useState(false);
  const [accModal, setAccModal] = useState<AccountModal>(null);
  const [oathOpen, setOathOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<ReturnType<typeof parseImport>>(null);
  const [importing, setImporting] = useState(false);
  const density = useDensity((x) => x.density);
  const setDensity = useDensity((x) => x.set);
  const active = (arcsQ.data ?? []).find((a) => !a.ended_on) ?? null;

  const groups: [Group, string][] = [
    ['account', t('settings.account')], ['appearance', t('settings.appearance')], ['notif', t('settings.notifications')],
    ['arc', t('settings.arc')], ['plan', t('settings.plan')], ['data', t('settings.dataPrivacy')], ['about', t('settings.about')],
  ].filter(([g]) => !(config.beta && g === 'plan')) as [Group, string][];
  const show = (g: Group) => !isDesktop || group === g;

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {langOpen ? (
        <button type="button" className={s.back} onClick={() => setLangOpen(false)} aria-label={t('settings.title')}><Icon name="back" size={18} sw={2} /></button>
      ) : (
        <Link to="/" className={s.back} aria-label={t('nav.today')}><Icon name="back" size={18} sw={2} /></Link>
      )}
      <div style={{ font: 'var(--fw-regular) 38px/1.05 var(--font-ui)', letterSpacing: '-.035em', whiteSpace: 'nowrap' }}>{langOpen ? t('settings.language') : t('settings.title')}</div>
    </div>
  );

  const langScreen = (
    <>
      <div className={s.list} style={{ marginTop: 22, maxWidth: 560 }}>
        {(['ru', 'en'] as Lang[]).map((id) => {
          const sel = lang === id;
          return (
            <button key={id} type="button" className={s.langRow} onClick={() => pickLang(id)}>
              <span className={s.radio} data-on={sel}>{sel && <span className={s.radioDot} />}</span>
              <span style={{ flex: 1, font: 'var(--fw-regular) 15px var(--font-ui)' }}>{id === 'ru' ? 'Русский' : 'English'}</span>
              <span style={{ font: 'var(--fw-medium) 12px var(--font-ui)', color: 'rgba(232,237,243,.56)' }}>{id === lang ? '' : t('settings.langOther')}</span>
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 10, maxWidth: 560, font: 'var(--fw-regular) 12px/1.5 var(--font-ui)', color: 'rgba(232,237,243,.6)', padding: '0 4px' }}>{t('settings.langHint')}</div>
    </>
  );

  const Row = ({ icon, label, children, onClick, danger }: { icon: IconName; label: string; children?: ReactNode; onClick?: () => void; danger?: boolean }) => {
    const inner = (
      <>
        <span className={danger ? s.rowIconDanger : s.rowIcon}><Icon name={icon} size={18} /></span>
        <span style={{ flex: 1, font: 'var(--fw-regular) 15px var(--font-ui)', minWidth: 0, color: danger ? '#E5645A' : undefined }}>{label}</span>
        {children}
      </>
    );
    return onClick !== undefined ? <button type="button" className={s.row} style={{ cursor: 'pointer' }} onClick={onClick}>{inner}</button> : <div className={s.row}>{inner}</div>;
  };
  const chev = <span style={{ color: 'rgba(232,237,243,.52)' }}><Icon name="chevron" size={16} sw={2} /></span>;

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
      {show('account') && (
        <div>
          <div className={s.groupTitle}>{t('settings.account')}</div>
          <button type="button" className={s.accountBtn} onClick={() => navigate('/settings/account')}>
            <span className={s.avatar} style={{ overflow: 'hidden' }}>{profile?.avatar_url ? <PhotoImg src={profile.avatar_url} /> : account.initials}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', font: 'var(--fw-regular) 15px var(--font-ui)' }}>{account.name}</span>
              <span style={{ display: 'block', font: 'var(--fw-medium) 13px var(--font-ui)', color: 'rgba(232,237,243,.5)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{account.email}</span>
            </span>
            <span style={{ color: 'rgba(232,237,243,.56)' }}><Icon name="chevron" size={16} sw={2} /></span>
          </button>
        </div>
      )}
      {show('appearance') && (
        <div>
          <div className={s.groupTitle}>{t('settings.appearance')}</div>
          <div className={s.list}>
            <Row icon="globe" label={t('settings.language')} onClick={() => setLangOpen(true)}>
              <span style={{ font: 'var(--fw-medium) 13px var(--font-ui)', color: 'rgba(232,237,243,.5)' }}>{t('settings.langName')}</span>{chev}
            </Row>
            <Row icon="moon" label={t('settings.theme')}>
              <span style={{ font: 'var(--fw-medium) 13px var(--font-ui)', color: 'rgba(232,237,243,.5)' }}>{t('settings.themeDark')}</span>
              <span className={s.soon}>{t('settings.lightSoon')}</span>
            </Row>
            <Row icon="checklist" label={t('settings.density')}>
              <Segmented variant="units" value={density} onChange={setDensity} options={[{ id: 'comfortable', label: t('settings.comfortable') }, { id: 'compact', label: t('settings.compact') }]} />
            </Row>
            <Row icon="drop" label={t('settings.units')}>
              <Segmented variant="units" value={unit} onChange={setUnit} options={[{ id: 'ml', label: t('settings.ml') }, { id: 'oz', label: t('settings.oz') }]} />
            </Row>
          </div>
        </div>
      )}
      {show('notif') && (
        <div>
          <div className={s.groupTitle}>{t('settings.notifications')}</div>
          <div className={s.list}>
            <DeviceNotif t={t} />
            {(['n1', 'n2', 'n3', 'n4'] as const).map((k) => (
              <button key={k} type="button" role="switch" aria-checked={notif[k]} className={s.row} style={{ cursor: 'pointer' }} onClick={() => toggleNotif(k)}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', font: 'var(--fw-regular) 15px var(--font-ui)' }}>{t(`settings.${k}`)}</span>
                  <span style={{ display: 'block', font: 'var(--fw-regular) 12px/1.4 var(--font-ui)', color: 'rgba(232,237,243,.6)', marginTop: 3 }}>{t(`settings.${k}d`)}</span>
                </span>
                <span className={s.track} data-on={notif[k]}><span className={s.knob} /></span>
              </button>
            ))}
            {/* quiet hours (Master Changeset task 32) */}
            <button type="button" role="switch" aria-checked={quiet.on} className={s.row} style={{ cursor: 'pointer' }} onClick={() => setQuiet(quiet.on ? null : ['22:00', '08:00'])}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', font: 'var(--fw-regular) 15px var(--font-ui)' }}>{t('settings.quiet')}</span>
                <span style={{ display: 'block', font: 'var(--fw-regular) 12px/1.4 var(--font-ui)', color: 'rgba(232,237,243,.6)', marginTop: 3 }}>{t('settings.quietD')}</span>
              </span>
              <span className={s.track} data-on={quiet.on}><span className={s.knob} /></span>
            </button>
            {quiet.on && (
              <div className={s.row}>
                <label className={s.timeLabel}>{t('settings.from')}<input type="time" className={s.time} value={quiet.from} onChange={(e) => e.target.value && setQuiet([e.target.value, quiet.to])} /></label>
                <label className={s.timeLabel}>{t('settings.to')}<input type="time" className={s.time} value={quiet.to} onChange={(e) => e.target.value && setQuiet([quiet.from, e.target.value])} /></label>
              </div>
            )}
            <Row icon="bellAuth" label={t('settings.testPush')} onClick={() => { void testPush(); }}>{chev}</Row>
          </div>
        </div>
      )}
      {show('arc') && (
        <div>
          <div className={s.groupTitle}>{t('settings.arc')}</div>
          <div className={s.list}>
            <div className={s.row} style={{ alignItems: 'flex-start' }}>
              <span className={s.rowIcon}><Icon name="snow" size={18} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', font: 'var(--fw-regular) 15px var(--font-ui)' }}>{t('arc.chip', { n: roman(active?.number ?? hd.arcNumber), d: hd.arcDay, l: hd.arcLength })}</span>
                <span style={{ display: 'block', font: 'italic var(--fw-medium) 13px/1.45 var(--font-ui)', color: 'var(--text-secondary)', marginTop: 4, overflowWrap: 'anywhere' }}>{active?.oath ? `«${active.oath}»` : t('arc.noOathShort')}</span>
              </span>
              <button type="button" className={s.inlineBtn} onClick={() => setOathOpen(true)}>{active?.oath ? t('settings.editOath') : t('settings.writeOath')}</button>
            </div>
            <Row icon="archive" label={t('settings.archive')} onClick={() => setArchiveOpen(!archiveOpen)}>
              <span style={{ color: 'rgba(232,237,243,.52)', display: 'grid', transition: 'transform .2s', transform: `rotate(${archiveOpen ? 90 : 0}deg)` }}><Icon name="chevron" size={16} sw={2} /></span>
            </Row>
            {archiveOpen && (
              <div style={{ padding: '4px 18px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {arcs.map((a) => (
                  <Link key={a.n} to={`/arc/recap/${a.id}`} className={s.arcItem}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', font: 'var(--fw-regular) 14px var(--font-ui)' }}>Arc {a.n}</span>
                      <span style={{ display: 'block', font: 'var(--fw-medium) 12px var(--font-mono)', color: 'rgba(232,237,243,.6)', marginTop: 3, whiteSpace: 'nowrap' }}>{t.pick(a.dates)}</span>
                    </span>
                    <span style={{ textAlign: 'right', flex: 'none' }}>
                      <span style={{ display: 'block', font: 'var(--fw-regular) 15px var(--font-mono)', color: '#FFFFFF' }}>{a.pct}</span>
                      <span style={{ display: 'block', font: 'var(--fw-regular) 9px var(--font-ui)', color: 'rgba(232,237,243,.56)' }}>{a.current ? t('settings.current') : t('settings.completed')}</span>
                    </span>
                  </Link>
                ))}
                <Link to="/analytics" className={s.compare}>{t('settings.compare')} <Icon name="chevron" size={13} sw={2.2} /></Link>
              </div>
            )}
            <Row icon="snow" label={t('settings.newArc')} onClick={() => setArcModal(true)}>{chev}</Row>
          </div>
        </div>
      )}
      {show('plan') && !config.beta && (
        <div>
          <div className={s.groupTitle}>{t('settings.plan')}</div>
          {!isPro ? (
            // B22: for Free the card invites to Pro (texts from the Account upsell)
            <div className={s.proCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className={s.crown}><Icon name="lock" size={19} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', font: 'var(--fw-regular) 15px var(--font-ui)', color: '#f2e2c4' }}>{t('auth.upsellTitle')}</span>
                  <span style={{ display: 'block', font: 'var(--fw-medium) 12px/1.45 var(--font-ui)', color: 'rgba(232,237,243,.55)', marginTop: 3 }}>{t('auth.upsellSub')}</span>
                </span>
              </div>
              <button type="button" className={s.manage} onClick={() => navigate('/pro')}>{t('auth.openPro')}</button>
            </div>
          ) : (
          <div className={s.proCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className={s.crown}><Icon name="crown" size={19} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', font: 'var(--fw-regular) 15px var(--font-ui)', color: '#f2e2c4' }}>{t('settings.proActive')}</span>
                <span style={{ display: 'block', font: 'var(--fw-medium) 12px var(--font-ui)', color: 'rgba(232,237,243,.55)', marginTop: 3, whiteSpace: 'nowrap' }}>
                  {t('settings.renews')} · <span style={{ fontFamily: 'var(--font-mono)' }}>{renew}</span>
                </span>
              </span>
              <span className={s.proBadge}>PRO</span>
            </div>
            <Link to="/pro" className={s.manage}>{t('settings.manage')}</Link>
          </div>
          )}
        </div>
      )}
      {show('data') && (
        <div>
          <div className={s.groupTitle}>{t('settings.dataPrivacy')}</div>
          <div className={s.list}>
            <Row icon="download" label={t('settings.export')} onClick={() => { if (hasBackend) void exportData().then(() => toast.success(t('settings.exported'))).catch(() => toast.error(t('common.loadFailed'))); }}>{chev}</Row>
            <Row icon="upload" label={t('settings.import')} onClick={() => fileRef.current?.click()}>{chev}</Row>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void f.text().then((x) => { const p = parseImport(x); if (p) setImp(p); else toast.error(t('settings.importBad')); }); }} />
            <Row icon="doc" label={t('settings.terms')} onClick={() => navigate('/terms')}>{chev}</Row>
            <Row icon="shield" label={t('settings.privacy')} onClick={() => navigate('/privacy')}>{chev}</Row>
            <Row icon="trashPlain" label={t('settings.del')} danger onClick={() => setAccModal('del1')} />
          </div>
        </div>
      )}
      {show('about') && (
        <div>
          <div className={s.groupTitle}>{t('settings.about')}</div>
          <div className={s.list}>
            <Row icon="alert" label={t('settings.versionLabel')}>
              <span style={{ font: 'var(--fw-medium) 12px var(--font-mono)', color: 'var(--text-muted)' }}>{`${ACCOUNT.version} · ${__BUILD__}`}</span>
            </Row>
          </div>
          <div className={s.groupTitle} style={{ marginTop: 18 }}>{t('settings.shortcuts')}</div>
          <div className={s.list}>
            {SHORTCUTS.map(([k, id]) => (
              <div key={k} className={s.row}>
                <span style={{ flex: 1, minWidth: 0, font: 'var(--fw-medium) 14px var(--font-ui)' }}>{t(`settings.keys.${id}` as never)}</span>
                <kbd className={s.kbd}>{k}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className={s.scroll} style={{ padding: isDesktop ? '28px 36px 40px' : '18px 10px 30px' }} data-scroll>
      {header}
      {langOpen ? langScreen : isDesktop ? (
        <div style={{ marginTop: 26, display: 'grid', gridTemplateColumns: '220px minmax(0,640px)', gap: 28, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 0 }}>
            {groups.map(([id, label]) => (
              <button key={id} type="button" className={s.groupBtn} aria-pressed={group === id} onClick={() => setGroup(id)}>{label}</button>
            ))}
          </div>
          {content}
        </div>
      ) : (
        <div style={{ marginTop: 22 }}>{content}</div>
      )}

      <ConfirmDialog
        open={arcModal} title={t('settings.newArcTitle')} body={t('settings.newArcBody', { d: hd.arcDay, n: hd.arcLength })}
        confirmLabel={t('settings.newArcOk')} cancelLabel={t('settings.cancel')}
        onConfirm={() => {
          setArcModal(false);
          if (hasBackend) void startNewArc().then(() => qc.invalidateQueries({ queryKey: SYSTEM_KEY })).catch(() => toast.error(t('common.saveFailed')));
        }}
        onCancel={() => setArcModal(false)}
      />
      <ConfirmDialog open={!!imp} title={t('settings.importTitle')} confirmLabel={importing ? '…' : t('settings.importOk')} cancelLabel={t('settings.cancel')}
        body={imp ? t('settings.importBody', { h: imp.summary.habits, l: imp.summary.logs, q: imp.summary.quits, g: imp.summary.goals, e: imp.summary.events, d: imp.summary.days }) : ''}
        onConfirm={() => {
          if (!imp || importing) return;
          if (!hasBackend) { setImp(null); return; }
          setImporting(true);
          void runImport(imp.file).then((r) => {
            toast.success(r.goalsSkipped ? t('settings.importDoneSkipped', { n: r.goalsSkipped }) : t('settings.importDone'));
            void qc.invalidateQueries({ queryKey: SYSTEM_KEY });
          }).catch(() => toast.error(t('settings.importFailed'))).finally(() => { setImporting(false); setImp(null); });
        }}
        onCancel={() => setImp(null)} />
      <OathSheet open={oathOpen} onClose={() => setOathOpen(false)} arcId={active?.id ?? null} current={active?.oath ?? ''} />
      <AccountDialogs modal={accModal} setModal={setAccModal}
        onLogout={() => { if (hasBackend) void signOut().then(() => navigate('/welcome')); else navigate('/welcome'); }}
        onDelete={async () => { if (hasBackend) await deleteAccount(); navigate('/welcome'); }} />
    </div>
  );
}
export type { T };

/** Whether this device can actually show notifications, and the one step to fix it. */
function DeviceNotif({ t }: { t: T }) {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const [perm, setPerm] = useState(supported ? Notification.permission : 'default');
  const state = !supported ? (ios && !standalone ? 'home' : 'unsupported') : perm;
  const allow = async () => { await askPermission(); setPerm(Notification.permission); };
  return (
    <div className={s.row} data-notif={state}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', font: 'var(--fw-regular) 15px var(--font-ui)' }}>{t(`settings.dev.${state === 'granted' ? 'on' : state === 'denied' ? 'denied' : state === 'home' ? 'home' : state === 'unsupported' ? 'unsupported' : 'off'}`)}</span>
        <span style={{ display: 'block', font: 'var(--fw-regular) 12px/1.4 var(--font-ui)', color: 'rgba(232,237,243,.6)', marginTop: 3 }}>{t(`settings.dev.${state === 'granted' ? 'onD' : state === 'denied' ? 'deniedD' : state === 'home' ? 'homeD' : state === 'unsupported' ? 'unsupportedD' : 'offD'}`)}</span>
      </span>
      {state === 'default' && <button type="button" className="pill pill-white pill-sm" onClick={() => { void allow(); }}>{t('settings.dev.allow')}</button>}
      {state === 'granted' && <span style={{ color: 'var(--dot-mint)', display: 'grid' }}><Icon name="check" size={18} sw={2} /></span>}
    </div>
  );
}
