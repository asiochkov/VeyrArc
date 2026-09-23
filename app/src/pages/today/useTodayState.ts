import { useCallback, useEffect, useRef, useState } from 'react';
import { todayHabits, todayStats, type TodayHabit } from '../../mock/today';
import { isDone } from './HabitRow';

/* Interaction logic from VeyrArc Today.dc.html (componentDidMount / patchHabit / flash). */
export function useTodayState() {
  const [habits, setHabits] = useState<TodayHabit[]>(todayHabits);
  const [moodSel, setMoodSel] = useState(todayStats.moodSel);
  const [activeTab, setActiveTab] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flash = useCallback((id: string) => {
    setFlashId(id);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), 400);
  }, []);

  const patch = useCallback((id: string, fn: (h: TodayHabit) => Partial<TodayHabit>) => {
    setHabits((list) => list.map((h) => (h.id === id ? ({ ...h, ...fn(h) } as TodayHabit) : h)));
  }, []);

  // duration timers tick once a second
  useEffect(() => {
    const t = setInterval(() => {
      setHabits((list) => {
        if (!list.some((h) => h.type === 'duration' && h.running)) return list;
        return list.map((h) => {
          if (h.type !== 'duration' || !h.running) return h;
          const left = Math.max(0, h.left - 1);
          if (left === 0) setTimeout(() => flash(h.id), 0);
          return { ...h, left, running: left > 0 };
        });
      });
    }, 1000);
    return () => {
      clearInterval(t);
      clearTimeout(flashTimer.current);
    };
  }, [flash]);

  const actions = (h: TodayHabit) => ({
    onToggle: () => patch(h.id, (x) => (x.type === 'binary' ? { checked: !x.checked } : {})),
    onInc: () => {
      if (h.type !== 'counter' || h.count >= h.goal) return;
      patch(h.id, (x) => (x.type === 'counter' ? { count: x.count + 1 } : {}));
      if (h.count + 1 >= h.goal) flash(h.id);
    },
    onDec: () => patch(h.id, (x) => (x.type === 'counter' ? { count: Math.max(0, x.count - 1) } : {})),
    onPlay: () => {
      if (isDone(h)) return;
      patch(h.id, (x) => (x.type === 'duration' ? { running: !x.running, started: true } : {}));
    },
    onStop: () => patch(h.id, (x) => (x.type === 'duration' ? { running: false, started: false, left: x.minutes * 60 } : {})),
  });

  const doneN = habits.filter(isDone).length;
  const dayPct = habits.length ? Math.round((doneN / habits.length) * 100) : 0;
  // "Тело" / "Разум" / "Дисциплина" come from the first part of the category label
  const catFrac = (cat: string) => {
    const list = habits.filter((h) => h.cat.ru.split(' · ')[0] === cat);
    return list.filter(isDone).length + '/' + list.length;
  };

  return {
    habits, moodSel, setMoodSel, activeTab, setActiveTab, flashId, actions,
    doneN, dayPct, catBody: catFrac('Тело'), catMind: catFrac('Разум'), catDisc: catFrac('Дисциплина'),
  };
}
