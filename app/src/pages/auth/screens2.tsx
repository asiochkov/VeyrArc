import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AccountDialogs, type AccountModal } from '../../app/AccountDialogs';
import { config } from '../../config';
import { useLangStore, useT } from '../../i18n';
import { deleteAccount, isAnon, signOut, useAuth, userEmail } from '../../lib/auth';
import { saveOnboarding, setHabitDone } from '../../lib/onboarding';
import { askPermission, notificationsSupported } from '../../lib/reminders';
import { hasBackend } from '../../lib/supabase';
import { Icon } from '../../ui/Icon';
import { Cta } from '../../ui/primitives';
import s from './auth.module.css';
import { AuthLayout, up } from './AuthLayout';
import { DEFAULT_HOME, DIR_ICONS, DIRS, TIME_OPTS, useFlow, type DirId } from './flow';

const BURST_COLORS = ['#6FA0D6', '#A8CBEF', '#E8A54B', '#9B87D6', '#5FBF9B'];

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
  const { f, setF, habits, toggleHabit, time, setTime, perm, setPerm } = useFlow();
  const [ob, setOb] = useState(0);
  const [sdir, setSdir] = useState<1 | -1>(1);
  const [focus, setFocus] = useState<DirId | null>('body');
  const initials = ((f.pname || f.first || 'А')[0] + ((f.last || 'П')[0] || '')).toUpperCase();
  const valid = ob === 0 ? !!f.pname.trim() : ob === 1 ? habits.length >= 1 : true;
  const next = () => { if (ob < 2) { setSdir(1); setOb(ob + 1); } else navigate('/day-one'); };
  const slide = sdir > 0 ? s.slideL : s.slideR;
  const stepLabels = t.list('auth.obSteps');

  return (
    <AuthLayout screen="onboarding">
      {({ dir }) => (
        <div className={dir > 0 ? s.screenL : s.screenR}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, ...up(1) }}>
            {stepLabels.map((label, i) => (
              <button key={i} type="button" className={s.obStep} data-on={i === ob} onClick={() => { if (i <= ob) { setSdir(i > ob ? 1 : -1); setOb(i); } }}>
                <span className={s.obNum} style={i === ob ? undefined : { color: i < ob ? '#A8CBEF' : 'rgba(232,237,243,.38)' }}>{'0' + (i + 1)}</span>
                <span className={s.obLabel}>{label}</span>
              </button>
            ))}
          </div>

          {ob === 0 && (
            <div key="s0" className={slide}>
              <div className={s.h1} style={{ marginTop: 26 }}>{t('auth.obNameTitle')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
                <span className={s.avatarLg}>{initials}</span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, flex: 'none' }}>
                  <button type="button" className={s.ghostSm}>{t('auth.addPhoto')}</button>
                  <span className={s.small}>{t('auth.optional')}</span>
                </div>
              </div>
              <div style={{ marginTop: 22 }}>
                <label className={s.label}>{t('auth.firstName')}</label>
                <input className={s.field} value={f.pname} onChange={(e) => setF('pname', e.target.value)} placeholder={t('auth.phFirst')} />
              </div>
            </div>
          )}

          {ob === 1 && (
            <div key="s1" className={slide}>
              <div className={s.h1} style={{ marginTop: 26 }}>{t('auth.obChangeTitle')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
                {DIRS.map(([id, list]) => {
                  const open = focus === id;
                  const cnt = list.filter((h) => habits.includes(h.ru)).length;
                  return (
                    <div key={id} className={s.dirCard} data-open={open}>
                      <button type="button" className={s.dirHead} onClick={() => setFocus(open ? null : id)}>
                        <span className={s.dirIcon}><Icon name={DIR_ICONS[id]} size={18} sw={1.8} /></span>
                        <span style={{ flex: 1, minWidth: 0, font: '700 15px var(--font-ui)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(`auth.dirs.${id}`)}</span>
                        {cnt > 0 && <span className={s.dirCount}>{cnt}</span>}
                        <span style={{ display: 'grid', color: 'rgba(232,237,243,.38)', transition: 'transform .2s', transform: `rotate(${open ? 90 : 0}deg)` }}><Icon name="chevron" size={16} sw={2} /></span>
                      </button>
                      {open && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 14px 14px', animation: 'wwUp .3s ease both' }}>
                          {list.map((h) => {
                            const on = habits.includes(h.ru);
                            return (
                              <button key={h.ru} type="button" className={s.habitChip} aria-pressed={on} onClick={() => toggleHabit(h.ru)}>
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
                    <span style={{ display: 'block', font: '700 16px var(--font-mono)' }}>{tm}</span>
                    <span style={{ display: 'block', font: '600 11px var(--font-ui)', marginTop: 4, opacity: 0.6 }}>{t(`auth.timeSubs.${sub}`)}</span>
                  </button>
                ))}
              </div>
              <div className={s.permCard}>
                <span className={s.iconTile}><Icon name="bellAuth" size={20} sw={1.8} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '700 14.5px var(--font-ui)' }}>{t('auth.notifications')}</div>
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
  const { f, habits, time, setCreated } = useFlow();
  const [holdP, setHoldP] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const raf = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { cancelAnimationFrame(raf.current); clearTimeout(timer.current); }, []);

  const holdStart = (ev: React.PointerEvent<HTMLButtonElement>) => {
    if (celebrate) return;
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 1500);
      setHoldP(p);
      if (p >= 1) {
        setCelebrate(true);
        if (navigator.vibrate) navigator.vibrate(30);
        const wait = new Promise((r) => { timer.current = setTimeout(r, 1400); });
        const save = hasBackend
          ? saveOnboarding({ name: f.pname, habits, time }).then(setCreated).catch(() => {})
          : Promise.resolve();
        void Promise.all([wait, save]).then(() => navigate('/start'));
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
          <div style={{ font: '800 50px/1.04 var(--font-ui)', letterSpacing: '-.03em', ...up(1) }}>{t('auth.day1')}</div>
          <div style={{ font: '800 50px/1.04 var(--font-ui)', letterSpacing: '-.03em', color: '#A8CBEF', ...up(2) }}>{t('auth.ready')}</div>
          <div style={{ position: 'relative', width: 156, height: 156, marginTop: 46, ...up(3) }}>
            <svg width="156" height="156" viewBox="0 0 156 156" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
              <circle cx="78" cy="78" r="74" fill="none" stroke="rgba(168,203,239,.12)" strokeWidth="4" />
              <circle cx="78" cy="78" r="74" fill="none" stroke={celebrate ? '#5FBF9B' : '#6FA0D6'} strokeWidth="4" strokeLinecap="round" strokeDasharray="464.96" strokeDashoffset={(464.96 * (1 - holdP)).toFixed(1)} />
            </svg>
            <button
              type="button" onPointerDown={holdStart} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd} onContextMenu={(e) => e.preventDefault()}
              style={{
                position: 'absolute', inset: 12, borderRadius: '50%', border: 'none', cursor: 'pointer', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
                font: '800 17px var(--font-ui)', transition: 'transform .15s, background-color .3s', transform: `scale(${holdP > 0 && !celebrate ? 0.94 : 1})`,
                background: celebrate ? '#5FBF9B' : '#F3F6FA', color: celebrate ? '#fff' : '#06121f', boxShadow: '0 14px 40px rgba(111,160,214,.25)',
              }}
            >{t('auth.imIn')}</button>
            {celebrate && <Burst n={18} spread={120} />}
          </div>
          <div className={s.small} style={{ marginTop: 20, minHeight: 20, ...up(4) }}>{celebrate ? t('auth.go') : holdP > 0 ? t('auth.holding') : t('auth.holdHint')}</div>
        </div>
      )}
    </AuthLayout>
  );
}

/* ---------------- First home ---------------- */

export function FirstHome() {
  const t = useT();
  const navigate = useNavigate();
  const habits = useFlow((x) => x.habits);
  const created = useFlow((x) => x.created);
  const session = useAuth((x) => x.session);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [burst, setBurst] = useState(0);
  const all = DIRS.flatMap(([, list]) => list);
  const list = (habits.length ? habits.map((id) => all.find((h) => h.ru === id)!) : DEFAULT_HOME).slice(0, 5);
  const done = list.filter((h) => checked[h.ru]).length;

  return (
    <AuthLayout screen="home">
      {({ dir }) => (
        <div className={dir > 0 ? s.screenL : s.screenR}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, ...up(0) }}>
            <div>
              <div className={s.faint} style={{ font: '700 10px var(--font-mono)', letterSpacing: '.24em', whiteSpace: 'nowrap' }}>{t('common.brandCaps')}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                <span style={{ font: '800 30px/1 var(--font-ui)', whiteSpace: 'nowrap' }}>{t('auth.homeDay')}</span>
                <span className={s.faint} style={{ font: '600 12px var(--font-mono)' }}>{t('auth.homeOf')}</span>
              </div>
            </div>
            {done > 0 && (
              <div className={s.streakPill}>
                <Icon name="flame" size={16} sw={1.8} /><span>{t('auth.streak1')}<span style={{ fontFamily: 'var(--font-mono)' }}>1</span>{t('auth.streak1Days', { n: 1 })}</span>
                {burst > 0 && <div key={burst} style={{ position: 'absolute', inset: 0 }}><Burst n={14} spread={60} /></div>}
              </div>
            )}
          </div>

          {done === 0 && (
            <div className={s.hintCard}>
              <span className={s.iconTile}><Icon name="spark" size={20} sw={1.8} /></span>
              <span style={{ font: '700 14px/1.4 var(--font-ui)' }}>{t('auth.firstCheck')}</span>
            </div>
          )}

          <div className={s.list} style={up(2)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '16px 16px 6px' }}>
              <span style={{ font: '700 17px var(--font-ui)' }}>{t('auth.today')}</span>
              <span className={s.faint} style={{ font: '600 12px var(--font-mono)' }}>{t('auth.countOf', { a: done, b: list.length })}</span>
            </div>
            {list.map((h) => {
              const on = !!checked[h.ru];
              return (
                <button key={h.ru} type="button" className={s.row} onClick={() => {
                  if (done === 0 && !on) setBurst((b) => b + 1);
                  setChecked((c) => ({ ...c, [h.ru]: !c[h.ru] }));
                  const item = created[h.ru];
                  if (hasBackend && item?.kind === 'habit') void setHabitDone(item.id, !on).catch(() => {});
                }}>
                  <span className={s.homeBox} data-on={on}>{on && <Icon name="check" size={14} sw={3.2} />}</span>
                  <span style={{ flex: 1, minWidth: 0, font: '600 15px var(--font-ui)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color .2s', color: on ? 'rgba(232,237,243,.58)' : 'var(--text)' }}>{t.pick(h)}</span>
                </button>
              );
            })}
          </div>

          {done > 0 && (
            <div className={s.saveCard}>
              <div style={{ font: '800 17px var(--font-ui)' }}>{t('auth.signupTitle')}</div>
              <div className={s.small} style={{ marginTop: 6 }}>{t('auth.signupSub')}</div>
              <Cta style={{ marginTop: 14 }} onClick={() => navigate(hasBackend && session && !isAnon(session) ? '/' : '/signup')}>{t('auth.continue')}</Cta>
            </div>
          )}
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
  const plan = hasBackend ? (realPlan?.plan === 'pro' ? 'pro' : 'free') : flow.plan;
  const setPlan = hasBackend ? () => {} : flow.setPlan;
  const lang = useLangStore((x) => x.lang);
  const setLang = useLangStore((x) => x.setLang);
  const [secOpen, setSecOpen] = useState(false);
  const [appleLinked, setAppleLinked] = useState(false);
  const [modal, setModal] = useState<AccountModal>(null);
  const initials = ((f.pname || f.first || 'А')[0] + ((f.last || 'П')[0] || '')).toUpperCase();
  const chev = <span className={s.chev}><Icon name="chevron" size={16} sw={2} /></span>;

  return (
    <AuthLayout screen="account">
      {({ dir }) => (
        <div className={dir > 0 ? s.screenL : s.screenR}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...up(0) }}>
            <div className={s.h2}>{t('auth.account')}</div>
            <button type="button" className={s.planBadge} data-pro={plan === 'pro'} onClick={() => setPlan(plan === 'free' ? 'pro' : 'free')}>{plan === 'free' ? 'Free' : 'Pro'}</button>
          </div>

          <div className={s.accHeader} style={up(1)}>
            <div className={s.accGlow} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16 }}>
              <span className={s.avatarLg}>{initials}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ font: '800 20px var(--font-ui)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hasBackend ? [f.first, f.last].filter(Boolean).join(' ') : (f.pname || f.first || 'Анна') + ' ' + (f.last || 'Петрова')}</div>
                <div className={s.muted} style={{ font: '600 13px var(--font-ui)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hasBackend ? (f.nick ? '@' + f.nick : '') : '@' + (f.nick || 'anna.arc')}</div>
                <div className={s.faint} style={{ font: '500 12.5px var(--font-ui)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hasBackend ? f.email : f.email || 'anna.petrova@gmail.com'}</div>
              </div>
            </div>
            <div className={s.arcPill}>
              <Icon name="snowSm" size={14} sw={1.8} />
              <span>{t('auth.arcPillA')}<span style={{ fontFamily: 'var(--font-mono)' }}>14</span>{t('auth.arcPillOf')}<span style={{ fontFamily: 'var(--font-mono)' }}>90</span></span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, marginTop: 12, ...up(2) }}>
            <div className={s.stat}><span className={s.statIcon}><Icon name="flame" size={16} sw={1.8} /></span><span className={s.statNum}>14</span><span className={s.statLabel}>{t('auth.statStreak')}</span></div>
            <div className={s.stat}><span className={s.statIcon}><Icon name="check" size={14} sw={2.6} /></span><span className={s.statNum}>186</span><span className={s.statLabel}>{t('auth.statHabits')}</span></div>
            <div className={s.stat}><span className={s.statIcon}><Icon name="bolt" size={15} sw={1.6} /></span><span className={s.statNum}>{t('units.h', { h: 42 })}</span><span className={s.statLabel}>{t('auth.statFocus')}</span></div>
          </div>

          {plan === 'free' && (
            <div className={s.upsell} style={up(3)}>
              <span className={s.upsellIcon}><Icon name="lock" size={20} sw={1.8} /></span>
              <div style={{ flex: '1 1 calc(100% - 56px)', minWidth: 0 }}>
                <div style={{ font: '800 15px var(--font-ui)', color: '#f2e2c4' }}>{t('auth.upsellTitle')}</div>
                <div style={{ font: '500 12.5px/1.45 var(--font-ui)', color: 'rgba(232,237,243,.58)', marginTop: 3 }}>{t('auth.upsellSub')}</div>
              </div>
              <Link to="/pro" className={s.goldBtn}>{t('auth.openPro')}</Link>
            </div>
          )}

          <div className={s.list} style={up(4)}>
            <button type="button" className={s.row}><span className={s.rowIcon}><Icon name="user" size={18} sw={1.8} /></span><span className={s.rowText}>{t('auth.personal')}</span>{chev}</button>
            <button type="button" className={s.row} onClick={() => setSecOpen(!secOpen)}>
              <span className={s.rowIcon}><Icon name="shield" size={18} sw={1.8} /></span><span className={s.rowText}>{t('auth.security')}</span>
              <span className={s.chev} style={{ transition: 'transform .2s', transform: `rotate(${secOpen ? 90 : 0}deg)` }}><Icon name="chevron" size={16} sw={2} /></span>
            </button>
            {secOpen && (
              <div className={s.subList}>
                <button type="button" className={s.subRow}><span style={{ flex: 1, textAlign: 'left' }}>{t('auth.changePassword')}</span>{chev}</button>
                <div className={s.subRow}><span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}><Icon name="google" size={18} /><span>Google</span></span><span className={s.linked}><Icon name="check" size={14} sw={2.6} /> {t('auth.linked')}</span></div>
                {config.auth.apple && (
                  <div className={s.subRow}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}><Icon name="apple" size={18} /><span>Apple</span></span>
                    <button type="button" onClick={() => setAppleLinked(!appleLinked)} style={{ height: 34, padding: '0 14px', borderRadius: 10, cursor: 'pointer', font: '700 12px var(--font-ui)', ...(appleLinked ? { background: 'transparent', border: '1px solid rgba(168,203,239,.12)', color: 'rgba(232,237,243,.58)' } : { background: '#6FA0D6', border: 'none', color: '#06121f' }) }}>
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
            <Link to="/pro" className={s.row}><span className={s.rowIcon}><Icon name="crown" size={18} sw={1.8} /></span><span className={s.rowText}>{t('auth.subscription')}</span><span className={s.rowValue}>{plan === 'free' ? 'Free' : 'Pro'}</span>{chev}</Link>
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
