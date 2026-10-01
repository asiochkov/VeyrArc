import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { roman } from '../../app/AppHeader';
import { addDays, indexLogs, isLogged, scheduled } from '../../data/model';
import { useT } from '../../i18n';
import { isoDay } from '../../lib/day';
import { setPendingRecap } from '../../lib/maintenance';
import { updateHabit } from '../../state/actions';
import { arcSummary, type ArcSummary } from '../../state/compute';
import { useSystem } from '../../state/system';
import { PageState } from '../../ui/PageState';
import r from './recap.module.css';

/*
 * Arc Recap (Master Changeset task 22, F14): the one ceremonial screen. Three stages —
 * intro (the arc and its promise), reveal (four numbers), complete (24 confetti pieces, once).
 * Opened from Today right after an arc ends (?end=1, with the Core carry-over list),
 * or from the sidebar archive at any time.
 */
type Stage = 'intro' | 'reveal' | 'complete';
const COLORS = ['#6FA0D6', '#A8CBEF', '#C8A66A', '#9B87D6', '#5FBF9B'];
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Recap() {
  const t = useT();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const end = params.get('end') === '1';
  const q = useSystem((x) => x);
  const [stage, setStage] = useState<Stage>(() => (reduced() ? 'complete' : 'intro'));
  const [keep, setKeep] = useState<Record<string, boolean> | null>(null);

  const data = useMemo(() => {
    const sys = q.data;
    if (!sys) return null;
    const arc = sys.arcs.find((a) => a.id === id);
    if (!arc) return { arc: null } as const;
    const stored = arc.summary as Partial<ArcSummary> | null;
    const sum = stored && stored.daysPct != null ? { ...arcSummary(sys, arc), ...stored } : arcSummary(sys, arc);
    const next = Math.max(...sys.arcs.map((a) => a.number)) + (sys.arcs.some((a) => !a.ended_on) ? 0 : 1);
    // Core habits and how often each was done during the arc: over 60 % stays Core by default
    const ix = indexLogs(sys.logs);
    const to = arc.ended_on ?? isoDay();
    const core = sys.habits.filter((h) => h.core && !h.archived_at).map((h) => {
      let due = 0, hit = 0;
      for (let d = arc.started_on; d <= to; d = addDays(d, 1)) {
        if (h.created_at.slice(0, 10) > d || !scheduled(h, d)) continue;
        due++; if (isLogged(ix, h.id, d)) hit++;
      }
      return { h, pct: due ? Math.round((hit / due) * 100) : 0 };
    });
    return { arc, sum, next, core, running: !arc.ended_on } as const;
  }, [q.data, id]);

  // intro → reveal → complete; a tap skips ahead
  useEffect(() => {
    if (stage === 'complete') return;
    const tm = setTimeout(() => setStage(stage === 'intro' ? 'reveal' : 'complete'), stage === 'intro' ? 2600 : 1600);
    return () => clearTimeout(tm);
  }, [stage]);

  useEffect(() => {
    if (data?.arc && keep == null && 'core' in data) setKeep(Object.fromEntries(data.core.map((x) => [x.h.id, x.pct > 60])));
  }, [data, keep]);

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
  const { arc, sum, next, core, running } = data;
  const finish = () => {
    if (end) {
      for (const { h } of core) if (keep && keep[h.id] === false) updateHabit(h.id, { core: false });
      setPendingRecap(null);
      navigate('/', { replace: true });
    } else if (window.history.length > 1) navigate(-1); else navigate('/');
  };
  const tiles = [
    { v: sum.daysPct + '%', l: t('arc.recap.daysPct') },
    { v: String(sum.bestStreak), l: t('arc.recap.bestStreak') },
    { v: String(Math.round(sum.focusMin / 6) / 10), l: t('arc.recap.focusH') },
    { v: String(sum.goalsDone), l: t('arc.recap.goalsDone') },
  ];

  return (
    <div className={r.root} data-stage={stage} onClick={() => { if (stage !== 'complete') setStage(stage === 'intro' ? 'reveal' : 'complete'); }}>
      <div className={r.center}>
        <div className={r.kicker}>{running ? t('arc.recap.running', { n: roman(arc.number) }) : t('arc.recap.done', { n: roman(arc.number) })}</div>
        <h1 className={r.title}>Arc {roman(arc.number)}</h1>
        <p className={r.oath}>{arc.oath ? `«${arc.oath}»` : t('arc.noOathShort')}</p>

        {stage !== 'intro' && (
          <div className={r.tiles}>
            {tiles.map((x, i) => (
              <div key={i} className={r.tile} style={{ animationDelay: i * 140 + 'ms' }}>
                <b>{x.v}</b><span>{x.l}</span>
              </div>
            ))}
          </div>
        )}
        {stage !== 'intro' && <div className={r.index}>{t('arc.recap.index', { n: sum.index })}</div>}

        {stage === 'complete' && (
          <div className={r.done} onClick={(e) => e.stopPropagation()}>
            {!reduced() && <Confetti />}
            {end && core.length > 0 && (
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
            )}
            <button type="button" className={r.cta} onClick={finish}>
              {end ? t('arc.recap.start', { n: roman(next) }) : t('arc.recap.back')}
            </button>
          </div>
        )}
        {stage !== 'complete' && <div className={r.skip}>{t('arc.recap.skip')}</div>}
      </div>
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
