import { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useAddAction } from '../../app/nav';
import { useT, type Bilingual, type T } from '../../i18n';
import { useIsDesktop } from '../../lib/useIsDesktop';
import { FREE_GOAL_LIMIT, GOALS_TODAY, type Goal } from '../../mock/goals';
import { todayStats } from '../../mock/today';
import { Icon } from '../../ui/Icon';
import { Avatar, MoodFace, Segmented } from '../../ui/primitives';
import s from './goals.module.css';
import { parseYmd, useGoals, ymd, type GoalsState } from './useGoals';

const pad = (n: number) => String(n).padStart(2, '0');
const text = (t: T, v: Bilingual | string) => (typeof v === 'string' ? v : t.pick(v));
const hit = (px: number) => ({ '--hit': `-${px}px` }) as CSSProperties;

export function Goals() {
  const t = useT();
  const isDesktop = useIsDesktop();
  const g = useGoals();

  const setHandler = useAddAction((x) => x.setHandler);
  useEffect(() => {
    setHandler(g.startAddGoal);
    return () => setHandler(null);
  });

  return (
    <>
      {isDesktop ? <Desktop t={t} g={g} /> : <Mobile t={t} g={g} />}
      {g.recapGoalId && <Recap t={t} g={g} />}
    </>
  );
}

/* ---------------- shared ---------------- */

function Chips({ t, g, m }: { t: T; g: GoalsState; m: boolean }) {
  return (
    <>
      <div style={{ marginTop: m ? 14 : 18, display: 'flex', gap: m ? 7 : 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {g.active.map((goal) => {
          const sel = g.selected?.id === goal.id;
          return (
            <button key={goal.id} type="button" className={s.chip} style={sel ? { background: goal.hue, color: '#06121f' } : undefined}
              onClick={() => { g.setSelectedGoalId(goal.id); g.setMenuGoalId(null); }}
              onContextMenu={(e) => { e.preventDefault(); g.setMenuGoalId(goal.id); g.setRenaming(false); }}>
              <span className={s.chipDot} style={{ background: sel ? '#06121f' : goal.hue }} />{t.pick(goal.title)}
            </button>
          );
        })}
        {!g.addingGoal && (
          <button type="button" className={s.addChip} style={{ width: m ? 32 : 34, height: m ? 32 : 34, ...hit(m ? 6 : 5) }} onClick={g.startAddGoal} aria-label={t('common.add')}>
            <Icon name="plus" size={22} sw={2} />
          </button>
        )}
      </div>
      {g.completed.length > 0 && (
        <div style={{ marginTop: m ? 7 : 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {g.completed.map((goal) => (
            <button key={goal.id} type="button" className={s.doneChip} onClick={() => g.setRecapGoalId(goal.id)}>✓ {t.pick(goal.title)}</button>
          ))}
        </div>
      )}
    </>
  );
}

function MenuAndForms({ t, g, m }: { t: T; g: GoalsState; m: boolean }) {
  const menuOpen = !!g.menuGoalId && !g.renaming && g.goals.some((x) => x.id === g.menuGoalId);
  return (
    <>
      {menuOpen && (
        <div className={s.menu} style={m ? undefined : { maxWidth: 300 }}>
          <button type="button" className={s.menuItem} onClick={g.menu.rename}>{t('goals.rename')}</button>
          <button type="button" className={s.menuItem} onClick={g.menu.complete}>{t('goals.complete')}</button>
          <button type="button" className={s.menuItem} style={{ color: '#D96A5B' }} onClick={g.menu.remove}>{t('goals.delete')}</button>
          <button type="button" className={s.menuItem} style={{ color: 'rgba(232,237,243,.4)', fontSize: 12 }} onClick={g.menu.close}>{t('goals.close')}</button>
        </div>
      )}
      {g.renaming && (
        <div style={{ marginTop: m ? 8 : 10, display: 'flex', gap: 8, maxWidth: m ? undefined : 340 }}>
          <input className={s.pillInput} value={g.renameValue} onChange={(e) => g.setRenameValue(e.target.value)} />
          <button type="button" className={s.amberPill} style={{ padding: '8px 14px' }} onClick={g.menu.confirmRename}>{t('goals.ok')}</button>
        </div>
      )}
      {g.addingGoal && g.limitReached && (
        <div className={s.limit} style={{ marginTop: m ? 12 : 14, padding: m ? 18 : 20, maxWidth: m ? undefined : 420 }}>
          <div style={{ color: '#E8B75E' }}><Icon name="lock" size={18} /></div>
          <div style={{ font: `700 ${m ? 13.5 : 14}px var(--font-ui)`, color: '#f2e2c4' }}>{t('goals.limitTitle')}</div>
          <div style={{ font: `400 ${m ? 11.5 : 12}px/1.5 var(--font-ui)`, color: 'rgba(232,237,243,.55)' }}>
            {t(m ? 'goals.limitDescShort' : 'goals.limitDesc', { n: FREE_GOAL_LIMIT })}
          </div>
          <button type="button" className={s.goldPill} style={m ? undefined : { marginTop: 4 }} onClick={() => g.setAddingGoal(false)}>{t('goals.gotIt')}</button>
        </div>
      )}
      {g.addingGoal && !g.limitReached && (
        <div className={s.form} style={{ marginTop: m ? 12 : 14, padding: m ? 16 : 20, maxWidth: m ? undefined : 380 }}>
          <input className={s.field} style={{ borderRadius: 12, padding: '10px 14px', fontSize: 13 }} value={g.newGoalName}
            onChange={(e) => g.setNewGoalName(e.target.value)} placeholder={t('goals.namePlaceholder')} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className={s.typeBtn} aria-pressed={g.newGoalType === 'process'} onClick={() => g.setNewGoalType('process')}>{t('goals.typeProcess')}</button>
            <button type="button" className={s.typeBtn} aria-pressed={g.newGoalType === 'number'} onClick={() => g.setNewGoalType('number')}>{t('goals.typeNumber')}</button>
          </div>
          {m ? (
            <input type="date" className={s.field} style={{ borderRadius: 10, padding: '8px 10px', fontSize: 12 }} value={g.newGoalDeadline} onChange={(e) => g.setNewGoalDeadline(e.target.value)} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ font: '600 11px var(--font-ui)', color: 'rgba(232,237,243,.5)' }}>{t('goals.deadlineOpt')}</span>
              <input type="date" className={s.field} style={{ flex: 1, borderRadius: 10, padding: '7px 10px', fontSize: 12 }} value={g.newGoalDeadline} onChange={(e) => g.setNewGoalDeadline(e.target.value)} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: m ? 0 : 4 }}>
            <button type="button" className={s.cancelBtn} onClick={() => g.setAddingGoal(false)}>{t('goals.cancel')}</button>
            <button type="button" className={s.createBtn} onClick={() => g.confirmAddGoal({ ru: 'Добавьте задание на сегодня', en: 'Add a task for today' })}>{t('goals.create')}</button>
          </div>
        </div>
      )}
    </>
  );
}

function dayLabel(t: T, date: string) {
  const dt = parseYmd(date);
  return t('goals.dayLabel', { d: dt.getDate(), m: t.list('monthsGen')[dt.getMonth()], w: t.list('weekdaysLower')[dt.getDay()] });
}

function DayNav({ t, g, m }: { t: T; g: GoalsState; m: boolean }) {
  const btn = m ? 30 : 32;
  const notToday = g.viewDate !== GOALS_TODAY;
  const todayBtn = notToday && <button type="button" className={s.todayBtn} onClick={() => g.setViewDate(GOALS_TODAY)}>{t('goals.today')}</button>;
  return (
    <>
      <div style={{ marginTop: m ? 14 : 18, display: 'flex', alignItems: 'center', justifyContent: m ? 'center' : undefined, gap: m ? 10 : 12 }}>
        <button type="button" className={s.navBtn} style={{ width: btn, height: btn, ...hit(m ? 7 : 6) }} onClick={() => g.setViewDate(addDaysStr(g.viewDate, -1))}><Icon name="chevronLeft" size={15} sw={2} /></button>
        <div style={{ font: `700 ${m ? 14 : 15}px var(--font-ui)` }}>{dayLabel(t, g.viewDate)}</div>
        <button type="button" className={s.navBtn} style={{ width: btn, height: btn, ...hit(m ? 7 : 6) }} onClick={() => g.setViewDate(addDaysStr(g.viewDate, 1))}><Icon name="chevron" size={15} sw={2} /></button>
        {!m && todayBtn}
      </div>
      {m && notToday && <div style={{ textAlign: 'center', marginTop: 6 }}>{todayBtn}</div>}
    </>
  );
}
const addDaysStr = (d: string, n: number) => { const dt = parseYmd(d); dt.setDate(dt.getDate() + n); return ymd(dt.getFullYear(), dt.getMonth(), dt.getDate()); };

function TasksCard({ t, g, m, goal }: { t: T; g: GoalsState; m: boolean; goal: Goal }) {
  const entry = g.getEntry(goal.id, g.viewDate);
  const streak = g.computeStreak(goal);
  const best = Math.max(goal.bestStreak, streak);
  return (
    <div className={s.card} style={{ borderRadius: 20, padding: m ? 18 : 24, marginTop: m ? 12 : undefined }}>
      <div className={s.caps}>{t('goals.tasks')}</div>
      <div style={{ marginTop: m ? 10 : 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {goal.tasks.map((task) => {
          const done = !!entry.tasksDone[task.id];
          const detail = t.pick(task.detail);
          return (
            <div key={task.id} className={s.taskRow} style={{ padding: m ? '9px 0' : '10px 0' }}>
              <div style={{ display: 'flex', gap: m ? 11 : 12, alignItems: 'flex-start' }}>
                <button type="button" role="checkbox" aria-checked={done} className={s.check}
                  onClick={() => g.patchEntry(goal.id, g.viewDate, { tasksDone: { ...entry.tasksDone, [task.id]: !done } })}>
                  {done && <Icon name="check" size={14} sw={3} />}
                </button>
                <div className={s.taskText} style={{ fontSize: m ? 13.5 : 14 }} onClick={() => detail && g.setExpandedTaskId(g.expandedTaskId === task.id ? null : task.id)}>{t.pick(task.text)}</div>
              </div>
              {g.expandedTaskId === task.id && (
                <div className={s.taskDetail} style={{ marginLeft: m ? 38 : 40, marginTop: m ? 5 : 6, fontSize: m ? 11.5 : 12 }}>{detail}</div>
              )}
            </div>
          );
        })}
        {g.adhocItems.map((a, i) => (
          <div key={i} className={s.adhoc} style={{ gap: m ? 11 : 12, padding: m ? '7px 0' : '8px 0' }}>
            <span style={{ color: '#E8A54B' }}>·</span><span style={{ font: `500 ${m ? 12.5 : 13}px var(--font-ui)`, color: 'rgba(232,237,243,.7)' }}>{a}</span>
          </div>
        ))}
      </div>

      <div className={s.footer} style={{ marginTop: m ? 14 : 18, paddingTop: m ? 14 : 16 }}>
        <button type="button" className={s.streakBtn} onClick={() => g.setStreakPanelOpen(!g.streakPanelOpen)}>
          <span><Icon name="flame" size={18} /></span><span style={{ font: `700 ${m ? 13 : 14}px var(--font-mono)` }}>{streak}</span>
        </button>
        <button type="button" className={s.plusBtn} style={{ width: m ? 30 : 32, height: m ? 30 : 32, ...hit(m ? 7 : 6) }} onClick={() => g.setAdhocOpen(!g.adhocOpen)}>
          <Icon name="plus" size={22} sw={2} />
        </button>
        <div style={{ display: 'flex', gap: m ? 3 : 4 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <button key={i} type="button" className={s.moodBtn} onClick={() => g.patchEntry(goal.id, g.viewDate, { mood: i })}>
              <MoodFace level={i} size={18} color={entry.mood === i ? '#E8A54B' : 'rgba(232,237,243,.4)'} />
            </button>
          ))}
        </div>
      </div>
      {g.streakPanelOpen && (
        <div className={s.panel} style={{ marginTop: m ? 10 : 12, padding: m ? '10px 12px' : '12px 14px', fontSize: m ? 11.5 : 12 }}>
          <span>{t(m ? 'goals.streakNowShort' : 'goals.streakNow', { n: streak })}</span><span>{t('goals.streakBest', { n: best })}</span>
        </div>
      )}
      {g.adhocOpen && (
        <div style={{ marginTop: m ? 10 : 12, display: 'flex', gap: 8 }}>
          <input className={s.adhocInput} style={{ fontSize: m ? 12 : 12.5 }} value={g.adhocText} onChange={(e) => g.setAdhocText(e.target.value)} placeholder={t('goals.adhocPlaceholder')} />
          <button type="button" className={s.adhocAdd} style={{ padding: m ? '8px 12px' : '8px 14px' }} onClick={g.confirmAdhoc}>{m ? '+' : t('goals.add')}</button>
        </div>
      )}
    </div>
  );
}

function DiaryCard({ t, g, m, goal }: { t: T; g: GoalsState; m: boolean; goal: Goal }) {
  const entry = g.getEntry(goal.id, g.viewDate);
  const isFuture = g.viewDate > GOALS_TODAY;
  const allDone = goal.tasks.length > 0 && goal.tasks.every((task) => entry.tasksDone[task.id]);
  const ph = isFuture ? t('goals.phFuture') : allDone ? t('goals.phDone') : t('goals.phMissed');
  return (
    <div className={s.card} style={{ borderRadius: 20, padding: m ? 16 : 24, display: 'flex', flexDirection: 'column', gap: m ? 10 : 14, marginTop: m ? 12 : undefined }}>
      <div style={{ font: `600 ${m ? 12.5 : 13}px var(--font-ui)`, color: 'rgba(232,237,243,.6)' }}>{t('goals.diary')}</div>
      <textarea className={s.diary} style={{ minHeight: m ? 120 : 180, padding: m ? 12 : 14, fontSize: m ? 13 : 13.5 }}
        value={text(t, entry.diary)} disabled={isFuture} placeholder={ph}
        onChange={(e) => g.patchEntry(goal.id, g.viewDate, { diary: e.target.value })} />
    </div>
  );
}

function MonthView({ t, g, m, goal }: { t: T; g: GoalsState; m: boolean; goal: Goal }) {
  const { y, m: mo } = g.viewMonth;
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const offset = (new Date(y, mo, 1).getDay() + 6) % 7;
  const sz = m ? 30 : 38;
  const cells: ({ n: number; date: string } | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => ({ n: i + 1, date: ymd(y, mo, i + 1) }))];
  const notes = Object.keys(g.entries)
    .filter((k) => k.startsWith(goal.id + '|') && g.entries[k].diary)
    .map((k) => ({ key: k.split('|')[1], diary: g.entries[k].diary }))
    .sort((a, b) => b.key.localeCompare(a.key));
  const btn = m ? 28 : 30;
  return (
    <>
      <div style={{ marginTop: m ? 14 : 18, display: 'flex', alignItems: 'center', justifyContent: m ? 'center' : undefined, gap: 10 }}>
        <button type="button" className={s.navBtn} style={{ width: btn, height: btn, ...hit(m ? 8 : 7) }} onClick={() => g.shiftMonth(-1)}><Icon name="chevronLeft" size={15} sw={2} /></button>
        <div style={{ font: `800 ${m ? 18 : 22}px var(--font-ui)` }}>{t('goals.monthLabel', { m: t.list('months')[mo], y })}</div>
        <button type="button" className={s.navBtn} style={{ width: btn, height: btn, ...hit(m ? 8 : 7) }} onClick={() => g.shiftMonth(1)}><Icon name="chevron" size={15} sw={2} /></button>
      </div>
      <div className={s.card} style={{ marginTop: m ? 10 : 14, borderRadius: 20, padding: m ? '16px 14px' : '22px 26px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: m ? '6px 2px' : '8px 4px' }}>
          {t.list('weekdays.short').map((w) => (
            <div key={w} style={{ textAlign: 'center', font: `700 ${m ? 9 : 10}px var(--font-mono)`, letterSpacing: m ? '.08em' : '.1em', color: 'rgba(232,237,243,.35)' }}>{w}</div>
          ))}
          {cells.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {c && (() => {
                const st = g.dayStatus(goal, c.date);
                const style: CSSProperties = { width: sz, height: sz, fontSize: m ? 11 : 12 };
                if (st === 'done') Object.assign(style, { background: goal.hue, color: '#06121f' });
                else if (st === 'partial') Object.assign(style, { background: 'transparent', border: `2px solid ${goal.hue}`, color: goal.hue });
                else if (st === 'missed') Object.assign(style, { background: 'rgba(217,106,91,.14)', color: '#D96A5B' });
                else Object.assign(style, { background: 'rgba(255,255,255,.05)', color: 'rgba(232,237,243,.45)' });
                if (c.date === GOALS_TODAY) style.boxShadow = '0 0 0 2px #E8A54B';
                return <button type="button" className={s.dayCell} style={style} onClick={() => { g.setScreen('day'); g.setViewDate(c.date); }}>{c.n}</button>;
              })()}
            </div>
          ))}
        </div>
        {!m && (
          <div style={{ display: 'flex', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
            <span className={s.legend}><span style={{ width: 10, height: 10, borderRadius: '50%', background: goal.hue, display: 'inline-block' }} />{t('goals.legendDone')}</span>
            <span className={s.legend}><span style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${goal.hue}`, display: 'inline-block' }} />{t('goals.legendPartial')}</span>
            <span className={s.legend}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(217,106,91,.5)', display: 'inline-block' }} />{t('goals.legendMissed')}</span>
          </div>
        )}
      </div>

      <div className={s.caps} style={{ marginTop: m ? 18 : 22 }}>{t('goals.entries')}</div>
      <div style={m ? { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 } : { marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {notes.map((n) => {
          const d2 = parseYmd(n.key);
          return (
            <div key={n.key} className={s.noteCard} style={{ padding: m ? '14px 16px' : '16px 18px' }} onClick={() => { g.setScreen('day'); g.setViewDate(n.key); }}>
              <div style={{ font: `700 ${m ? 10.5 : 11}px var(--font-mono)`, color: 'rgba(232,237,243,.45)' }}>{pad(d2.getDate())}.{pad(d2.getMonth() + 1)} {t.list('weekdaysLower')[d2.getDay()]}</div>
              <div style={{ font: '500 13px/1.5 var(--font-ui)', color: 'rgba(232,237,243,.8)', marginTop: m ? 6 : 8 }}>{text(t, n.diary)}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Empty({ t, g, m }: { t: T; g: GoalsState; m: boolean }) {
  return (
    <div style={{ marginTop: m ? 50 : 60, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: m ? 12 : 14 }}>
      <div style={{ color: '#E8A54B' }}><Icon name="target" size={40} /></div>
      <div style={{ font: `800 ${m ? 19 : 22}px var(--font-ui)` }}>{t('goals.emptyTitle')}</div>
      <div style={{ font: `400 ${m ? 12.5 : 13}px var(--font-ui)`, color: 'rgba(232,237,243,.5)', maxWidth: m ? 260 : 280 }}>{t('goals.emptyDesc')}</div>
      <button type="button" className={s.amberPill} style={{ marginTop: 6, padding: m ? '12px 22px' : '12px 24px', fontSize: 13 }} onClick={g.startAddGoal}>{t('goals.emptyCta')}</button>
      {g.addingGoal && (
        <div style={{ marginTop: 10, maxWidth: m ? undefined : 320, width: m ? '100%' : undefined, display: 'flex', gap: 8 }}>
          <input className={s.pillInput} style={{ padding: '9px 16px' }} value={g.newGoalName} onChange={(e) => g.setNewGoalName(e.target.value)} placeholder={t('goals.namePlaceholder')} />
          <button type="button" className={s.amberPill} style={{ padding: '9px 16px' }} onClick={() => g.confirmAddGoal({ ru: 'Добавьте задание на сегодня', en: 'Add a task for today' })}>{t('goals.create')}</button>
        </div>
      )}
    </div>
  );
}

function ViewSeg({ t, g, m }: { t: T; g: GoalsState; m: boolean }) {
  return (
    <Segmented variant="goals" amber value={g.screen} onChange={g.setScreen}
      options={[{ id: 'day', label: t('goals.views.day') }, { id: 'month', label: t('goals.views.month') }]}
      style={m ? { marginTop: 18 } : { marginTop: 22, maxWidth: 280 }} />
  );
}

/* ---------------- layouts ---------------- */

function Desktop({ t, g }: { t: T; g: GoalsState }) {
  const goal = g.selected;
  return (
    <div className={s.desktop}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ font: '700 10px/1 var(--font-mono)', letterSpacing: '.26em', color: 'rgba(232,237,243,.34)' }}>{t('common.brandCaps')}</div>
          <div style={{ font: '800 34px/1 var(--font-ui)', letterSpacing: '-.01em', marginTop: 10 }}>{t('goals.title')}</div>
        </div>
        <Avatar initials={todayStats.initials} />
      </div>
      {goal ? (
        <>
          <ViewSeg t={t} g={g} m={false} />
          <Chips t={t} g={g} m={false} />
          <MenuAndForms t={t} g={g} m={false} />
          {g.screen === 'day' ? (
            <>
              <DayNav t={t} g={g} m={false} />
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 16, alignItems: 'start' }}>
                <TasksCard t={t} g={g} m={false} goal={goal} />
                <DiaryCard t={t} g={g} m={false} goal={goal} />
              </div>
            </>
          ) : (
            <div style={{ marginTop: 18 }}><MonthView t={t} g={g} m={false} goal={goal} /></div>
          )}
        </>
      ) : (
        <Empty t={t} g={g} m={false} />
      )}
    </div>
  );
}

function Mobile({ t, g }: { t: T; g: GoalsState }) {
  const goal = g.selected;
  return (
    <div className={s.mobileScroll} data-scroll>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ font: '700 10px/1 var(--font-mono)', letterSpacing: '.26em', color: 'rgba(232,237,243,.34)' }}>{t('common.brandCaps')}</div>
          <div style={{ font: '800 28px/1.1 var(--font-ui)', marginTop: 8 }}>{t('goals.title')}</div>
        </div>
        <Avatar initials={todayStats.initials} />
      </div>
      {goal ? (
        <>
          <ViewSeg t={t} g={g} m />
          <Chips t={t} g={g} m />
          <MenuAndForms t={t} g={g} m />
          {g.screen === 'day' ? (
            <>
              <DayNav t={t} g={g} m />
              <TasksCard t={t} g={g} m goal={goal} />
              <DiaryCard t={t} g={g} m goal={goal} />
            </>
          ) : (
            <MonthView t={t} g={g} m goal={goal} />
          )}
        </>
      ) : (
        <Empty t={t} g={g} m />
      )}
    </div>
  );
}

function Recap({ t, g }: { t: T; g: GoalsState }) {
  const r = g.recap(g.recapGoalId!);
  if (!r) return null;
  return createPortal(
    <div className={s.recapWrap}>
      <div className={s.recap}>
        <div style={{ font: '700 10px var(--font-mono)', letterSpacing: '.22em', color: 'rgba(232,237,243,.4)', textAlign: 'center' }}>{t('goals.recapTitle')}</div>
        <div style={{ font: '800 26px var(--font-ui)', textAlign: 'center', marginTop: 10 }}>{t.pick(r.goal.title)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 22 }}>
          {[[r.pct + '%', t('goals.recapDays')], [r.best, t('goals.recapBest')], [r.notes, t('goals.recapNotes')]].map(([v, l], i) => (
            <div key={i} className={s.recapTile}>
              <div style={{ font: '700 20px var(--font-mono)' }}>{v}</div>
              <div style={{ font: '600 9px var(--font-ui)', color: 'rgba(232,237,243,.5)', marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => g.setRecapGoalId(null)} style={{ marginTop: 24, width: '100%', background: '#E8A54B', color: '#06121f', border: 'none', borderRadius: 14, padding: '14px 0', font: '700 14px var(--font-ui)', cursor: 'pointer' }}>
          {t('goals.done')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
