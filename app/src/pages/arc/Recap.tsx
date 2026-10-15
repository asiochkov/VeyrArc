import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { roman } from '../../app/AppHeader';
import { addDays, indexLogs, isLogged, scheduled } from '../../data/model';
import { useT } from '../../i18n';
import { isoDay } from '../../lib/day';
import { haptic } from '../../lib/haptics';
import { setPendingRecap } from '../../lib/maintenance';
import { updateHabit } from '../../state/actions';
import { arcSummary, dayStatus, type ArcSummary } from '../../state/compute';
import { useSystem } from '../../state/system';
import { PageState } from '../../ui/PageState';
import { toast } from '../../ui/toast';
import r from './recap.module.css';
import st from './story.module.css';
import { shareCard } from './shareCard';

/*
 * Arc Recap as a story (audit 1.13, Spotify-Wrapped style): one thing per slide — the arc, the
 * promise, the days kept (a dot per day), the best run, the index, focus and goals, a card to
 * share, and (when the arc has just ended) what stays Core next time. Tap right / left to move.
 */
const COLORS = ['#2D6CF0', '#FFFFFF', '#004BE0', '#6E9BFF', '#5FBF9B'];
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Recap() {
  const t = useT();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const end = params.get('end') === '1';
  const q = useSystem((x) => x);
  const [i, setI] = useState(0);
  const [keep, setKeep] = useState<Record<string, boolean> | null>(null);
  const [busy, setBusy] = useState(false);

  const data = useMemo(() => {
    const sys = q.data;
    if (!sys) return null;
    const arc = sys.arcs.find((a) => a.id === id);
    if (!arc) return { arc: null } as const;
    const stored = arc.summary as Partial<ArcSummary> | null;
    const sum = stored && stored.daysPct != null ? { ...arcSummary(sys, arc), ...stored } : arcSummary(sys, arc);
    const next = Math.max(...sys.arcs.map((a) => a.number)) + (sys.arcs.some((a) => !a.ended_on) ? 0 : 1);
    const ix = indexLogs(sys.logs);
    const today = isoDay();
    const to = arc.ended_on ?? (today < addDays(arc.started_on, arc.length_days - 1) ? today : addDays(arc.started_on, arc.length_days - 1));
    // one dot per day of the arc: kept (or frozen), paused, or still ahead
    const idx = { habits: sys.habits, logs: sys.logs, days: sys.days };
    const days = Array.from({ length: arc.length_days }, (_, k) => {
      const d = addDays(arc.started_on, k);
      if (d > to) return 'ahead';
      const s = dayStatus(idx, d, today, 23);
      return s === 'earned' || s === 'frozen' ? 'kept' : 'pause';
    });
    const kept = days.filter((x) => x === 'kept').length;
    const prev = sys.arcs.filter((a) => a.number < arc.number).sort((a, b) => b.number - a.number)[0];
    const prevIndex = prev ? ((prev.summary as Partial<ArcSummary> | null)?.index ?? arcSummary(sys, prev).index) : null;
    const core = sys.habits.filter((h) => h.core && !h.archived_at).map((h) => {
      let due = 0, hit = 0;
      for (let d = arc.started_on; d <= to; d = addDays(d, 1)) {
        if (h.created_at.slice(0, 10) > d || !scheduled(h, d)) continue;
        due++; if (isLogged(ix, h.id, d)) hit++;
      }
      return { h, pct: due ? Math.round((hit / due) * 100) : 0 };
    });
    return { arc, sum, next, core, running: !arc.ended_on, days, kept, prevIndex } as const;
  }, [q.data, id]);

  useEffect(() => {
    if (data?.arc && keep == null && 'core' in data) setKeep(Object.fromEntries(data.core.map((x) => [x.h.id, x.pct > 60])));
  }, [data, keep]);
  // the first slide moves on by itself
  useEffect(() => { if (i !== 0 || reduced()) return; const tm = setTimeout(() => setI(1), 2600); return () => clearTimeout(tm); }, [i]);

  if (!data) return <PageState error={q.isError && !q.data} onRetry={() => { void q.refetch(); }} />;
  if (!data.arc) {
    return (
      <div className={r.root}>
        <div className={r.center}>
          <p className={r.oath}>{t('arc.recap.notFound')}</p>
          <button type="button" className={r.cta} onClick={() => navigate('/')}>{t('arc.recap.back')}</button>
        </div>
      </div>
    );
  }
  const { arc, sum, next, core, running, days, kept, prevIndex } = data;
  const n = roman(arc.number);
  const finish = () => {
    if (end) {
      for (const { h } of core) if (keep && keep[h.id] === false) updateHabit(h.id, { core: false });
      setPendingRecap(null);
      navigate('/', { replace: true });
    } else if (window.history.length > 1) navigate(-1); else navigate('/');
  };
  const share = async () => {
    setBusy(true);
    try {
      const res = await shareCard({
        arc: `Arc ${n}`, oath: arc.oath ?? '', kept, len: arc.length_days, best: sum.bestStreak, index: sum.index,
        focusH: Math.round(sum.focusMin / 6) / 10, goals: sum.goalsDone, days,
        labels: { kept: t('arc.story.cardKept'), best: t('arc.story.cardBest'), index: t('arc.story.cardIndex'), focus: t('arc.story.cardFocus') },
      });
      if (res === 'saved') toast.success(t('arc.story.saved'));
    } catch { toast.error(t('common.saveFailed')); }
    finally { setBusy(false); }
  };
  const start = new Date(arc.started_on + 'T12:00:00').toLocaleDateString(t.lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long' });

  const slides: { key: string; body: React.ReactNode }[] = [
    { key: 'arc', body: (
      <>
        <div className={st.kicker}>{running ? t('arc.recap.running', { n }) : t('arc.recap.done', { n })}</div>
        <div className={st.word}>Arc {n}</div>
      </>
    ) },
    { key: 'oath', body: (
      <>
        <div className={st.kicker}>{t('arc.story.oathOn', { d: start })}</div>
        <p className={st.quote}>{arc.oath ? `«${arc.oath}»` : t('arc.noOathShort')}</p>
      </>
    ) },
    { key: 'days', body: (
      <>
        <div className={st.big}>{kept}<small> / {arc.length_days}</small></div>
        <div className={st.line}>{t('arc.story.daysKept')}</div>
        <div className={st.dots} aria-hidden="true">{days.map((d, k) => <i key={k} data-s={d} style={{ '--k': k } as CSSProperties} />)}</div>
      </>
    ) },
    { key: 'best', body: (
      <>
        <div className={st.big}>{sum.bestStreak}</div>
        <div className={st.line}>{t('arc.story.best')}</div>
        <p className={st.note}>{sum.bestStreak >= 21 ? t('arc.story.bestHigh') : t('arc.story.bestLow')}</p>
      </>
    ) },
    { key: 'index', body: (
      <>
        <div className={st.big}>{sum.index}<small> / 1000</small></div>
        <div className={st.line}>{t('arc.story.index')}</div>
        {prevIndex != null && <p className={st.note}>{t('arc.story.vsPrev', { d: (sum.index >= prevIndex ? '+' : '−') + Math.abs(sum.index - prevIndex) })}</p>}
      </>
    ) },
    { key: 'focus', body: (
      <div className={st.pair}>
        <div><div className={st.mid}>{Math.round(sum.focusMin / 6) / 10}</div><div className={st.line}>{t('arc.recap.focusH')}</div></div>
        <div><div className={st.mid}>{sum.goalsDone}</div><div className={st.line}>{t('arc.recap.goalsDone')}</div></div>
      </div>
    ) },
    { key: 'share', body: (
      <>
        <div className={st.kicker}>{t('arc.story.shareKicker')}</div>
        <div className={st.card}>
          <span className={st.cardArc}>Arc {n}</span>
          <span className={st.cardNum}>{kept}<small>/{arc.length_days}</small></span>
          <span className={st.cardLab}>{t('arc.story.cardKept')}</span>
          {arc.oath && <span className={st.cardOath}>«{arc.oath}»</span>}
        </div>
        <button type="button" className={st.btn} disabled={busy} onClick={(e) => { e.stopPropagation(); void share(); }}>{t('arc.story.share')}</button>
      </>
    ) },
    { key: 'end', body: (
      <div onClick={(e) => e.stopPropagation()} className={st.end}>
        {!reduced() && <Confetti />}
        {end && core.length > 0 ? (
          <fieldset className={r.carry}>
            <legend>{t('arc.recap.carryTitle', { n: roman(next) })}</legend>
            {core.map(({ h, pct }) => (
              <label key={h.id} className={r.carryRow}>
                <input type="checkbox" checked={keep?.[h.id] ?? true} onChange={(e) => setKeep({ ...(keep ?? {}), [h.id]: e.target.checked })} />
                <span className={r.carryName}>{h.name}</span>
                <span className={r.carryPct}>{pct}%</span>
              </label>
            ))}
            <p className={r.hint}>{t('arc.recap.carryHint')}</p>
          </fieldset>
        ) : <p className={st.quote}>{t('arc.story.thanks')}</p>}
        <button type="button" className={st.btn} onClick={finish}>{end ? t('arc.recap.start', { n: roman(next) }) : t('arc.recap.back')}</button>
      </div>
    ) },
  ];
  const go = (d: number) => { const k = Math.max(0, Math.min(slides.length - 1, i + d)); if (k !== i) { haptic('tap'); setI(k); if (k === slides.length - 1) haptic('milestone'); } };
  const tap = (e: React.MouseEvent) => { const x = e.clientX / window.innerWidth; go(x < 0.3 ? -1 : 1); };

  return (
    <div className={st.root} onClick={tap} role="region" aria-label={`Arc ${n}`}>
      <div className={st.glow} aria-hidden="true" />
      <div className={st.bars} aria-hidden="true">{slides.map((s, k) => <i key={s.key} data-on={k <= i} />)}</div>
      <button type="button" className={st.close} onClick={(e) => { e.stopPropagation(); finish(); }} aria-label={t('common.close')}>×</button>
      <div key={slides[i].key} className={st.slide}>{slides[i].body}</div>
      {i < slides.length - 1 && <div className={st.hint}>{t('arc.recap.skip')}</div>}
    </div>
  );
}

/* 24 pieces, one second, only here (Master Changeset section 13). */
function Confetti() {
  return (
    <div className={r.confetti} aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        const d = 110 + (i % 3) * 40;
        return (
          <span key={i} style={{
            background: COLORS[i % COLORS.length], borderRadius: i % 2 ? '50%' : 2,
            '--dx': Math.round(Math.cos(a) * d) + 'px', '--dy': Math.round(Math.sin(a) * d - 40) + 'px',
          } as CSSProperties} />
        );
      })}
    </div>
  );
}
