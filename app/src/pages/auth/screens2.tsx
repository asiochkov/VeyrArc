import { useQuery } from '@tanstack/react-query';
import { useHeader } from '../../data/header';
import { buildToday } from '../../data/today';
import { todayRawOf, useSystem } from '../../state/system';
import { fetchAccountStats } from '../../data/profile';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AccountDialogs, type AccountModal } from '../../app/AccountDialogs';
import { config } from '../../config';
import { useLangStore, useT } from '../../i18n';
import { deleteAccount, signOut, useAuth, userEmail, isProPlan } from '../../lib/auth';
import { saveOnboarding } from '../../lib/onboarding';
import { askPermission, notificationsSupported } from '../../lib/reminders';
import { hasBackend } from '../../lib/supabase';
import { Icon } from '../../ui/Icon';
import { Cta, PhotoImg } from '../../ui/primitives';
import { pickPhoto, saveAvatar } from '../../lib/avatar';
import { toast } from '../../ui/toast';
import s from './auth.module.css';
import { AuthLayout, up } from './AuthLayout';
import { DIR_ICONS, DIRS, TIME_OPTS, useFlow, type DirId } from './flow';

const BURST_COLORS = ['#2D6CF0', '#FFFFFF', '#004BE0', '#6E9BFF', '#5FBF9B'];

/* confetti from burst(n, spread, colors) */
function Burst({ n, spread }: { n: number; spread: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (i % 2 ? 0.2 : 0);
        const r = spread * (0.65 + (i % 3) * 0.18);
        const style = {
          position: 'absolute', left: '50%', top: '50%', width: i % 3 ? 7 : 10, height: i % 3 ? 7 : 4, marginLeft: -4, marginTop: -3,
          borderRadius: i % 2 ? '50%' : 2, background: BURST_COLORS[i % BURST_COLORS.length],
          '--dx': Math.round(Math.cos(a) * r) + 'px', '--dy': Math.round(Math.sin(a) * r) + 'px',
          animation: `wwBurst .95s cubic-bezier(.15,.8,.3,1) ${(i % 4) * 25}ms forwards`,
        } as CSSProperties;
        return <span key={i} style={style} />;
      })}
    </div>
  );
}

/* ---------------- Onboarding ---------------- */

export function Onboarding() {
  const t = useT();
  const navigate = useNavigate();
  const { f, setF, habits, toggleHabit, time, setTime, perm, setPerm, ob, setOb, oath, setOath } = useFlow();
  const [sdir, setSdir] = useState<1 | -1>(1);
  const [focus, setFocus] = useState<DirId | null>('body');
  const [photo, setPhoto] = useState<string | null>(useAuth.getState().profile?.avatar_url ?? null);
  const initials = ((f.pname || f.first || 'А')[0] + ((f.last || 'П')[0] || '')).toUpperCase();
  // Core picks (everything but quits) — up to 5, the Free limit (Master Changeset task 23)
  const quitIds = new Set(DIRS.filter(([id]) => id === 'quit').flatMap(([, l]) => l.map((h) => h.ru)));
  const coreCount = habits.filter((h) => !quitIds.has(h)).length;
  const pick = (id: string) => {
    if (!habits.includes(id) && !quitIds.has(id) && coreCount >= 5) { toast.info(t('auth.coreMax')); return; }
    toggleHabit(id);
  };
  const valid = ob === 0 ? !!f.pname.trim() : ob === 1 ? habits.length >= 1 : true;
  const go = (n: number) => { setSdir(n > ob ? 1 : -1); setOb(n); };
  const next = () => { if (ob < 2) go(ob + 1); else navigate('/day-one'); };
  const slide = sdir > 0 ? s.slideL : s.slideR;
  const stepLabels = t.list('auth.obSteps');

  return (
    <AuthLayout screen="onboarding">
      {({ dir }) => (
        <div className={dir > 0 ? s.screenL : s.screenR}>
          <div className={s.obProgress} style={up(1)}>
            <div className={s.obBar} role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={ob + 1}><span style={{ width: ((ob + 1) / 4) * 100 + '%' }} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
              {stepLabels.map((label, i) => (
                <button key={i} type="button" className={s.obStep} data-on={i === ob} onClick={() => { if (i <= ob) go(i); }}>
                  <span className={s.obNum} style={i === ob ? undefined : { color: i < ob ? '#FFFFFF' : 'rgba(232,237,243,.38)' }}>{'0' + (i + 1)}</span>
                  <span className={s.obLabel}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {ob === 0 && (
            <div key="s0" className={slide}>
              <div className={s.h1} style={{ marginTop: 26 }}>{t('auth.obNameTitle')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
                <span className={s.avatarLg} style={{ overflow: 'hidden' }}>{photo ? <PhotoImg src={photo} /> : initials}</span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, flex: 'none' }}>
                  <button type="button" className={s.ghostSm} onClick={() => { void pickPhoto().then((u) => { if (u) { setPhoto(u); if (hasBackend) void saveAvatar(u).catch(() => toast.error(t('common.saveFailed'))); } }); }}>{t('auth.addPhoto')}</button>
                  <span className={s.small}>{t('auth.optional')}</span>
                </div>
              </div>
              <div style={{ marginTop: 22 }}>
                <label className={s.label}>{t('auth.firstName')}</label>
                <input className={s.field} value={f.pname} onChange={(e) => setF('pname', e.target.value)} placeholder={t('auth.phFirst')} />
              </div>
              <div style={{ marginTop: 18 }}>
                <label className={s.label} htmlFor="ob-oath">{t('auth.oathLabel')}</label>
                <textarea id="ob-oath" className={s.field} style={{ height: 84, paddingTop: 12, resize: 'none', lineHeight: 1.4 }} maxLength={200}
                  value={oath} onChange={(e) => setOath(e.target.value)} placeholder={t('auth.oathPh')} />
                <div className={s.small} style={{ marginTop: 6 }}>{t('auth.oathHint')}</div>
              </div>
            </div>
          )}

          {ob === 1 && (
            <div key="s1" className={slide}>
              <div className={s.h1} style={{ marginTop: 26 }}>{t('auth.obChangeTitle')}</div>
              <div className={s.sub} style={{ marginTop: 8 }}>{t('auth.obCoreSub', { n: coreCount })}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
                {DIRS.map(([id, list]) => {
                  const open = focus === id;
                  const cnt = list.filter((h) => habits.includes(h.ru)).length;
                  return (
                    <div key={id} className={s.dirCard} data-open={open}>
                      <button type="button" className={s.dirHead} onClick={() => setFocus(open ? null : id)}>
                        <span className={s.dirIcon}><Icon name={DIR_ICONS[id]} size={18} sw={1.8} /></span>
                        <span style={{ flex: 1, minWidth: 0, font: 'var(--fw-bold) 15px var(--font-ui)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(`auth.dirs.${id}`)}</span>
                        {cnt > 0 && <span className={s.dirCount}>{cnt}</span>}
                        <span style={{ display: 'grid', color: 'rgba(232,237,243,.54)', transition: 'transform .2s', transform: `rotate(${open ? 90 : 0}deg)` }}><Icon name="chevron" size={16} sw={2} /></span>
                      </button>
                      {open && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 14px 14px', animation: 'wwUp .3s ease both' }}>
                          {list.map((h) => {
                            const on = habits.includes(h.ru);
                            return (
                              <button key={h.ru} type="button" className={s.habitChip} aria-pressed={on} onClick={() => pick(h.ru)}>
                                {on ? <Icon name="check" size={14} sw={3} /> : <Icon name="plus" size={14} sw={2.2} />}<span>{t.pick(h)}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {ob === 2 && (
            <div key="s2" className={slide}>
              <div className={s.h1} style={{ marginTop: 26 }}>{t('auth.obRemindTitle')}</div>
              <div className={s.sub} style={{ marginTop: 8 }}>{t('auth.obRemindSub')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 20 }}>
                {TIME_OPTS.map(([tm, sub]) => (
                  <button key={tm} type="button" className={s.timeOpt} aria-pressed={time === tm} onClick={() => setTime(tm)}>
                    <span style={{ display: 'block', font: 'var(--fw-bold) 15px var(--font-mono)' }}>{tm}</span>
                    <span style={{ display: 'block', font: 'var(--fw-semibold) 11px var(--font-ui)', marginTop: 4, opacity: 0.6 }}>{t(`auth.timeSubs.${sub}`)}</span>
                  </button>
                ))}
              </div>
              <div className={s.permCard}>
                <span className={s.iconTile}><Icon name="bellAuth" size={20} sw={1.8} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: 'var(--fw-bold) 15px var(--font-ui)' }}>{t('auth.notifications')}</div>
                  <div className={s.small} style={{ marginTop: 3 }}>{perm ? t('auth.permOn', { t: time }) : t('auth.permOff')}</div>
                </div>
                {perm ? (
                  <span className={s.permOk}><Icon name="check" size={14} sw={2.6} /> {t('auth.permGranted')}</span>
                ) : (
                  <button type="button" className={s.ctaSm} onClick={() => { void askPermission().then((ok) => setPerm(ok || !notificationsSupported())); }}>{t('auth.allow')}</button>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
            <Cta variant="ghost" style={{ flex: 1 }} onClick={next}>{t('auth.skip')}</Cta>
            <Cta style={{ flex: 1.4 }} disabled={!valid} onClick={() => valid && next()}>{t('auth.next')}</Cta>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}

/* ---------------- Day 1 (hold to start) ---------------- */

export function DayOne() {
  const t = useT();
  const navigate = useNavigate();
  const { f, habits, time, oath, setCreated, resetOnboarding } = useFlow();
  const [holdP, setHoldP] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const raf = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { cancelAnimationFrame(raf.current); clearTimeout(timer.current); }, []);

  const holdStart = (ev: React.PointerEvent<HTMLButtonElement>) => {
    if (celebrate) return;
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 800); // shorter hold: sign-up felt slow
      setHoldP(p);
      if (p >= 1) {
        setCelebrate(true);
        if (navigator.vibrate) navigator.vibrate(30);
        setSaveErr(false);
        const wait = new Promise((r) => { timer.current = setTimeout(r, 600); });
        const save = hasBackend ? saveOnboarding({ name: f.pname, habits, time, oath }).then(setCreated) : Promise.resolve();
        // the start only counts once it is saved: on failure the user sees why and holds again
        void Promise.all([wait, save]).then(() => { resetOnboarding(); navigate('/', { replace: true }); }, () => { setCelebrate(false); setHoldP(0); setSaveErr(true); });
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  const holdEnd = () => { if (celebrate) return; cancelAnimationFrame(raf.current); setHoldP(0); };

  return (
    <AuthLayout screen="final">
      {({ dir, isDesktop }) => (
        <div className={dir > 0 ? s.screenL : s.screenR} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: isDesktop ? 560 : 640 }}>
          <div style={{ font: 'var(--fw-heavy) 50px/1.04 var(--font-ui)', letterSpacing: '-.03em', ...up(1) }}>{t('auth.day1')}</div>
          <div style={{ font: 'var(--fw-heavy) 50px/1.04 var(--font-ui)', letterSpacing: '-.03em', color: '#FFFFFF', ...up(2) }}>{t('auth.ready')}</div>
          <div style={{ position: 'relative', width: 156, height: 156, marginTop: 46, ...up(3) }}>
            <svg width="156" height="156" viewBox="0 0 156 156" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
              <circle cx="78" cy="78" r="74" fill="none" stroke="rgba(168,203,239,.12)" strokeWidth="4" />
              <circle cx="78" cy="78" r="74" fill="none" stroke={celebrate ? '#1F9C79' : '#2D6CF0'} strokeWidth="4" strokeLinecap="round" strokeDasharray="464.96" strokeDashoffset={(464.96 * (1 - holdP)).toFixed(1)} />
            </svg>
            <button
              type="button" onPointerDown={holdStart} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd} onContextMenu={(e) => e.preventDefault()}
              style={{
                position: 'absolute', inset: 12, borderRadius: '50%', border: 'none', cursor: 'pointer', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
                font: 'var(--fw-heavy) 17px var(--font-ui)', transition: 'transform .15s, background-color .3s', transform: `scale(${holdP > 0 && !celebrate ? 0.94 : 1})`,
                background: celebrate ? '#0B7358' : 'var(--c-on)', color: celebrate ? '#fff' : '#FFFFFF', boxShadow: '0 14px 40px rgba(0,75,224,.25)',
              }}
            >{t('auth.imIn')}</button>
            {celebrate && <Burst n={18} spread={120} />}
          </div>
          <div className={s.small} role={saveErr ? 'alert' : undefined} style={{ marginTop: 20, minHeight: 20, ...up(4), ...(saveErr ? { color: 'var(--error)' } : {}) }}>
            {saveErr ? t('auth.startFailed') : celebrate ? t('auth.go') : holdP > 0 ? t('auth.holding') : t('auth.holdHint')}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}

/* ---------------- Account ---------------- */

export function Account() {
  const t = useT();
  const navigate = useNavigate();
  const flow = useFlow();
  const { session, profile, plan: realPlan } = useAuth();
  // backend: real name / email / plan; otherwise the design's example values
  const f = hasBackend
    ? { ...flow.f, pname: profile?.first_name ?? '', first: profile?.first_name ?? '', last: profile?.last_name ?? '', nick: profile?.nickname ?? '', email: userEmail(session) }
    : flow.f;
  const plan = hasBackend ? (isProPlan(realPlan) ? 'pro' : 'free') : flow.plan;
  const setPlan = hasBackend ? () => {} : flow.setPlan;
  const lang = useLangStore((x) => x.lang);
  const setLang = useLangStore((x) => x.setLang);
  const [secOpen, setSecOpen] = useState(false);
  const [appleLinked, setAppleLinked] = useState(false);
  const [modal, setModal] = useState<AccountModal>(null);
  const hasEmail = !!session?.user.email;
  const googleLinked = !!session?.user.identities?.some((x) => x.provider === 'google');
  // real numbers for the header (the design's sample numbers only without a backend)
  const hd = useHeader();
  const qToday = useSystem(todayRawOf);
  const qStats = useQuery({ queryKey: ['accountStats'], queryFn: fetchAccountStats, enabled: hasBackend && !!session });
  const streakNow = hasBackend ? (qToday.data ? buildToday(qToday.data, { initials: '', freezesAllowed: 1 }).stats.streak : '—') : 14;
  const statHabits = hasBackend ? (qStats.data?.habitsDone ?? '—') : 186;
  const statFocus = hasBackend ? (qStats.data?.focusHours ?? '—') : 42;
  const arcDay = hasBackend ? hd.arcDay : 14, arcLen = hasBackend ? hd.arcLength : 90;
  const initials = ((f.pname || f.first || 'А')[0] + ((f.last || 'П')[0] || '')).toUpperCase();
  const chev = <span className={s.chev}><Icon name="chevron" size={16} sw={2} /></span>;

  return (
    <AuthLayout screen="account">
      {({ dir }) => (
        <div className={dir > 0 ? s.screenL : s.screenR}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...up(0) }}>
            <div className={s.h2}>{t('auth.account')}</div>
            {!config.beta && <button type="button" className={s.planBadge} data-pro={plan === 'pro'} onClick={() => (hasBackend ? navigate('/pro') : setPlan(plan === 'free' ? 'pro' : 'free'))}>{plan === 'free' ? 'Free' : 'Pro'}</button>}
          </div>

          <div className={s.accHeader} style={up(1)}>
            <div className={s.accGlow} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16 }}>
              <button type="button" className={s.avatarLg} style={{ overflow: 'hidden', border: 'none', cursor: 'pointer', padding: 0 }} aria-label={t('auth.addPhoto')}
                onClick={() => { void pickPhoto().then((u) => { if (u) void saveAvatar(u).then(() => toast.success(t('auth.photoSaved'))).catch(() => toast.error(t('common.saveFailed'))); }); }}>
                {profile?.avatar_url ? <PhotoImg src={profile.avatar_url} /> : initials}
              </button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ font: 'var(--fw-heavy) 20px var(--font-ui)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hasBackend ? [f.first, f.last].filter(Boolean).join(' ') : (f.pname || f.first || 'Анна') + ' ' + (f.last || 'Петрова')}</div>
                <div className={s.muted} style={{ font: 'var(--fw-semibold) 13px var(--font-ui)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hasBackend ? (f.nick ? '@' + f.nick : '') : '@' + (f.nick || 'anna.arc')}</div>
                <div className={s.faint} style={{ font: 'var(--fw-medium) 13px var(--font-ui)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hasBackend ? f.email : f.email || 'anna.petrova@gmail.com'}</div>
              </div>
            </div>
            <div className={s.arcPill}>
              <Icon name="snowSm" size={14} sw={1.8} />
              <span>{t('auth.arcPillA')}<span style={{ fontFamily: 'var(--font-mono)' }}>{arcDay}</span>{t('auth.arcPillOf')}<span style={{ fontFamily: 'var(--font-mono)' }}>{arcLen}</span></span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, marginTop: 12, ...up(2) }}>
            <div className={s.stat}><span className={s.statIcon}><Icon name="flame" size={16} sw={1.8} /></span><span className={s.statNum}>{streakNow}</span><span className={s.statLabel}>{t('auth.statStreak')}</span></div>
            <div className={s.stat}><span className={s.statIcon}><Icon name="check" size={14} sw={2.6} /></span><span className={s.statNum}>{statHabits}</span><span className={s.statLabel}>{t('auth.statHabits')}</span></div>
            <div className={s.stat}><span className={s.statIcon}><Icon name="bolt" size={15} sw={1.6} /></span><span className={s.statNum}>{t('units.h', { h: statFocus })}</span><span className={s.statLabel}>{t('auth.statFocus')}</span></div>
          </div>

          {plan === 'free' && !config.beta && (
            <div className={s.upsell} style={up(3)}>
              <span className={s.upsellIcon}><Icon name="lock" size={20} sw={1.8} /></span>
              <div style={{ flex: '1 1 calc(100% - 56px)', minWidth: 0 }}>
                <div style={{ font: 'var(--fw-heavy) 15px var(--font-ui)', color: '#f2e2c4' }}>{t('auth.upsellTitle')}</div>
                <div style={{ font: 'var(--fw-medium) 13px/1.45 var(--font-ui)', color: 'rgba(232,237,243,.58)', marginTop: 3 }}>{t('auth.upsellSub')}</div>
              </div>
              <Link to="/pro" className={s.goldBtn}>{t('auth.openPro')}</Link>
            </div>
          )}

          <div className={s.list} style={up(4)}>
            <button type="button" className={s.row} onClick={() => setModal('name')}><span className={s.rowIcon}><Icon name="user" size={18} sw={1.8} /></span><span className={s.rowText}>{t('auth.personal')}</span>{chev}</button>
            <button type="button" className={s.row} onClick={() => setSecOpen(!secOpen)}>
              <span className={s.rowIcon}><Icon name="shield" size={18} sw={1.8} /></span><span className={s.rowText}>{t('auth.security')}</span>
              <span className={s.chev} style={{ transition: 'transform .2s', transform: `rotate(${secOpen ? 90 : 0}deg)` }}><Icon name="chevron" size={16} sw={2} /></span>
            </button>
            {secOpen && (
              <div className={s.subList}>
                {(!hasBackend || hasEmail) && <button type="button" className={s.subRow} onClick={() => setModal('password')}><span style={{ flex: 1, textAlign: 'left' }}>{t('auth.changePassword')}</span>{chev}</button>}
                {(!hasBackend || googleLinked) && <div className={s.subRow}><span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}><Icon name="google" size={18} /><span>Google</span></span><span className={s.linked}><Icon name="check" size={14} sw={2.6} /> {t('auth.linked')}</span></div>}
                {hasBackend && !hasEmail && <div className={s.subRow} style={{ cursor: 'default' }}><span style={{ flex: 1, color: 'var(--text-muted)' }}>{t('auth.guestSecurity')}</span></div>}
                {config.auth.apple && (
                  <div className={s.subRow}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}><Icon name="apple" size={18} /><span>Apple</span></span>
                    <button type="button" onClick={() => setAppleLinked(!appleLinked)} style={{ height: 34, padding: '0 14px', borderRadius: 10, cursor: 'pointer', font: 'var(--fw-bold) 12px var(--font-ui)', ...(appleLinked ? { background: 'transparent', border: '1px solid rgba(168,203,239,.12)', color: 'rgba(232,237,243,.58)' } : { background: '#2D6CF0', border: 'none', color: '#FFFFFF' }) }}>
                      {appleLinked ? t('auth.unlink') : t('auth.link')}
                    </button>
                  </div>
                )}
              </div>
            )}
            <Link to="/settings" className={s.row}><span className={s.rowIcon}><Icon name="bellAuth" size={20} sw={1.8} /></span><span className={s.rowText}>{t('auth.notifications')}</span>{chev}</Link>
            {/* A1: only the dark theme — static row instead of the Night/Daylight/System switch */}
            <div className={s.row} style={{ cursor: 'default' }}>
              <span className={s.rowIcon}><Icon name="moon" size={18} sw={1.8} /></span><span className={s.rowText}>{t('auth.theme')}</span>
              <span className={s.rowValue}>{t('auth.themeDark')}</span>
            </div>
            <div className={s.row} style={{ cursor: 'default' }}>
              <span className={s.rowIcon}><Icon name="globe" size={18} sw={1.8} /></span><span className={s.rowText}>{t('auth.language')}</span>
              <div className={s.seg2}>
                <button type="button" className={s.segBtn} aria-pressed={lang === 'ru'} onClick={() => setLang('ru')}>RU</button>
                <button type="button" className={s.segBtn} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
              </div>
            </div>
            {!config.beta && <Link to="/pro" className={s.row}><span className={s.rowIcon}><Icon name="crown" size={18} sw={1.8} /></span><span className={s.rowText}>{t('auth.subscription')}</span><span className={s.rowValue}>{plan === 'free' ? 'Free' : 'Pro'}</span>{chev}</Link>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18, ...up(5) }}>
            <Cta variant="ghost" onClick={() => setModal('logout')}>{t('auth.logout')}</Cta>
            <Cta variant="danger" onClick={() => setModal('del1')}>{t('auth.deleteAccount')}</Cta>
          </div>
          <AccountDialogs modal={modal} setModal={setModal}
            onLogout={() => { if (hasBackend) void signOut().then(() => navigate('/welcome')); else navigate('/welcome'); }}
            onDelete={async () => { if (hasBackend) await deleteAccount(); navigate('/welcome'); }} />
        </div>
      )}
    </AuthLayout>
  );
}
