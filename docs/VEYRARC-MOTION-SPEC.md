# VeyrArc — Motion Design Spec

> **Для Claude Code.** Этот документ — не идеи, а рабочее ТЗ. Каждый пункт — минимум одна конкретная правка в конкретный файл. Порядок фаз обязателен: базовый слой ставит библиотеку и токены; дальше — по одной поверхности, независимо друг от друга. Можно сдавать по PR на фазу.
>
> Стек, к которому мы приводим проект: **`motion` v12+** (`motion/react`, наследник Framer Motion / Motion One), **View Transitions API** для маршрутов, точечно **Lottie** только для двух «wow»-моментов. Никакого GSAP, R3F, Lenis — они не окупятся для мобильного PWA-трекера.
>
> Главный принцип из скилла /motion: *«Если убрать эту анимацию — заметит ли пользователь, что чего-то не хватает?»* Если ответ «нет» — режем. Ниже — только то, что оставили после этого фильтра.

---

## 0. Аудит текущего состояния (краткий диагноз)

**Что уже хорошо** (не трогать без веской причины):
- Токены `--spring / --ease-screen / --ease-burst` заведены грамотно. Оставляем и переиспользуем.
- Nav-пилюля (`Rail` / `BottomBar`) с расширением по ширине/высоте на `--spring` — сильное решение, читается как «якорь» текущей секции.
- Auth-флоу: `wwSlideL/R` между шагами, `wwShake` на ошибке, `wwPop` на success-бейдже, `wwBurst` (конфетти) на Day One — уровень нормальный. Оставляем логику, но выносим на `motion/react` (см. Фаза 3).

**Что критично отсутствует** (перечислено по убыванию цены):

| # | Пробел | Где | Почему больно |
|---|---|---|---|
| 1 | Нет переходов между роутами | `router.tsx`, `AppShell` | Приложение «щёлкает» экранами. Для PWA — главный удар по «нативности». |
| 2 | Отметка привычки — плоская | `HabitRow.tsx` | Это **основной жест дня**. Сейчас — 150 мс opacity-cross. Пользователь не получает награду. |
| 3 | Кольцо прогресса дотягивает молча | `HabitRow`, `ProgressRing` | Замыкание 100% — эмоциональный пик, сейчас его нет. |
| 4 | Числа (streak, счётчики, таймеры) моментально подменяются | Today, Tracker, Pomodoro | Ломает восприятие «живого» трекера. |
| 5 | Композер добавления привычки появляется без motion | `Tracker.tsx` | FAB нажали → форма просто «появилась». Разрыв контекста. |
| 6 | Список привычек не переставляется/не добавляется анимированно | `Today`, `Tracker` | При добавлении/удалении — резкое перескакивание. |
| 7 | Модалка (`AccountDialogs`) — только `wwUp` на фоне | `AccountDialogs.module.css` | Карточка внутри стоит статично. |
| 8 | Календарь — переключение месяца/недели без направления | `Calendar.tsx` | Пользователь не понимает, «вперёд» он ушёл или «назад». |
| 9 | Pomodoro-таймер не празднует завершение сессии | `Today.tsx` (pomo блок) | Сессия дошла до 00:00 — тишина. |
| 10 | Goals Recap (`recapWrap`) — просто `position: fixed` | `goals.module.css` | Достижение цели — кинематографический момент, а сейчас — скачок. |
| 11 | Toast/undo (`.undoBar`) — тоже статично | `tracker.module.css` | Ожидается slide-up из-под safe-area, есть только `position: fixed`. |
| 12 | Нет `prefers-reduced-motion` нигде | глобально | Accessibility-баг и потенциальный триггер. |
| 13 | Нет орchestrated stagger в списках при первом монтаже | все страницы со списками | Первый экран после логина «дёргает» глаз. |
| 14 | PRO CTA (золотой градиент) без shimmer | `Pro.tsx`, `Today.tsx` PRO-карта | Единственная платная поверхность — не «зовёт». |

**Не пробел, а изъян логики:**
- `wwBreathe` (7s бесконечный пульс) висит на auth-глоу постоянно. На батарею и внимание — влияет. Оставляем, но с `will-change: transform` и стопом при `document.visibilityState !== 'visible'` (см. §1.3).

---

## 1. Фаза 1 — Motion Foundation (базовый слой)

Ничего не анимируем на этом этапе. Ставим фундамент, на который встанут остальные фазы.

### 1.1 Зависимости

`app/package.json` — добавить в `dependencies`:

```json
"motion": "^12.0.0",
"lottie-react": "^2.4.1"
```

Установить: `pnpm add motion lottie-react` (или `npm i`). **Не ставим** framer-motion (мигрировали в `motion`), не ставим gsap.

### 1.2 Motion-токены — расширение существующих

Файл: `app/src/styles/tokens.css`, в блок `/* motion */` (после `--ease-burst`) — добавить:

```css
/* motion — расширенный слой */
--dur-micro: 140ms;         /* hover/press/focus */
--dur-comp: 260ms;          /* dropdown/toast/modal */
--dur-layout: 420ms;        /* route/list-reorder */
--dur-section: 720ms;       /* section reveal / scroll-trigger */
--dur-cinematic: 1400ms;    /* hero / celebration */

/* дополнительные easings под конкретные жанры */
--ease-out-quint: cubic-bezier(.22,1,.36,1);   /* exit */
--ease-in-quint: cubic-bezier(.64,0,.78,0);    /* enter */
--ease-emphasized: cubic-bezier(.2,0,0,1);     /* Material M3 emphasized */
--ease-standard: cubic-bezier(.2,0,0,1);       /* стандарт (алиас) */

/* spring-конфиги для motion/react */
--spring-soft: 260 stiffness / 26 damping;     /* габарит документации, не CSS */
```

`--spring` (уже есть) остаётся мастер-easing для nav-пилюль и всего, что «щёлкает» с overshoot. Не удалять.

### 1.3 Reduced motion — глобальный переключатель

Файл: `app/src/styles/global.css` — в конец добавить:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
  /* но кросс-фейд языка — оставляем, он функциональный */
  .ww-keep-motion, .ww-keep-motion * {
    animation-duration: inherit !important;
    transition-duration: inherit !important;
  }
}
```

Новый хук — файл `app/src/lib/useMotionPrefs.ts`:

```ts
import { useEffect, useState } from 'react';

/*
 * useMotionPrefs — единая точка правды для motion.
 * reduced: пользователь просил ОС уменьшить анимации.
 * offscreen: вкладка не видна — не тратим CPU на бесконечные циклы.
 */
export function useMotionPrefs() {
  const [reduced, setReduced] = useState(false);
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => setReduced(mq.matches);
    onMq(); mq.addEventListener('change', onMq);

    const onVis = () => setOffscreen(document.visibilityState !== 'visible');
    onVis(); document.addEventListener('visibilitychange', onVis);

    return () => { mq.removeEventListener('change', onMq); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  return { reduced, offscreen, quiet: reduced || offscreen };
}
```

### 1.4 Motion-примитивы (обёртки над motion/react)

Новый файл: `app/src/ui/motion.tsx`. Здесь — вся motion-механика, которую переиспользуют экраны.

```tsx
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from 'motion/react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

/*
 * Единый MotionProvider — оборачивает <App>. Прокидывает spring-конфиг,
 * уважает prefers-reduced-motion (motion/react делает это сам, но мы
 * дополнительно даём "reducedMotion=user" для явности).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 260, damping: 26, mass: 0.9 }}>
      {children}
    </MotionConfig>
  );
}

export { AnimatePresence, LayoutGroup, motion, useReducedMotion };

/* ----------- shared variants (используются на нескольких экранах) ----------- */

export const upSpring = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { type: 'spring', stiffness: 280, damping: 28 },
};

export const scaleSpring = {
  initial: { opacity: 0, scale: 0.94 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: { type: 'spring', stiffness: 320, damping: 30 },
};

/* Stagger-контейнер для орchestрации детей (используется в списках, композере, onboarding) */
export const staggerParent = (delayChildren = 0.02, staggerChildren = 0.045) => ({
  animate: { transition: { delayChildren, staggerChildren } },
});
export const staggerChild = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 26 } },
};

/* Press-scale обёртка: любой tap-элемент. Сделано в 1 месте, чтобы не размазывать
 * transition:transform по всему CSS. Заменит whileTap-паттерны. */
type PressProps = ComponentPropsWithoutRef<typeof motion.button>;
export function Press({ children, ...rest }: PressProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.94, transition: { type: 'spring', stiffness: 500, damping: 20 } }}
      whileHover={{ scale: 1.02 }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
```

### 1.5 Подключение провайдера

Файл: `app/src/main.tsx` — обернуть `RouterProvider` в `<MotionProvider>`:

```tsx
import { MotionProvider } from './ui/motion';
// ...
root.render(
  <StrictMode>
    <MotionProvider>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MotionProvider>
  </StrictMode>
);
```

### 1.6 Правила игры (для всех остальных фаз)

1. **Тайминги** берутся ТОЛЬКО из токенов `--dur-*`. Никаких магических `.24s` в CSS.
2. **Ease** — из токенов `--ease-*` или `--spring-*`. Один экран — один ease, максимум два.
3. Любая анимация, живущая дольше 1 сек в цикле, обязана уважать `useMotionPrefs().quiet` и уходить в `paused`.
4. Всё, что можно, — через `transform` + `opacity`. Никаких `left/top/width/height` в keyframes на 60fps путях.
5. `whileTap` — только на элементах ≥ 40×40 (иначе тапхит не читается на iOS).
6. Каждая анимация проходит тест «убрать → заметно ли?». Если нет — удалить.

**После фазы 1**: коммит `feat(motion): foundation — motion, tokens, MotionProvider`.

---

## 2. Фаза 2 — Route Transitions (переходы между экранами)

**Цель:** приложение перестаёт «щёлкать». Смена вкладок в Rail/BottomBar даёт направленный shared-element переход с якорем на активной пилюле.

### 2.1 Стратегия

Two-layer подход:
- **База (везде):** `<AnimatePresence mode="wait">` вокруг `<Outlet />` с cross-fade + slight-y (`upSpring`). Duration 260 мс. Безопасно, работает в Safari, iOS, iPad.
- **Bonus (Chrome/Edge/Safari 18+):** параллельно включаем `document.startViewTransition` — auto-morph общих элементов (аватар в шапке, активная пилюля Rail'а). Fallback деградирует до базы без визуальных артефактов.
- **Общий якорь:** активная пилюля Rail/BottomBar получает `layoutId="nav-active"`. Motion сам делает FLIP-морф между двумя экземплярами.

### 2.2 Замены

Файл: `app/src/app/AppShell.tsx` — заменить `<Outlet />` на `<AnimatedOutlet />`.

Новый файл: `app/src/app/AnimatedOutlet.tsx`:

```tsx
import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from '../ui/motion';
import { navIdFor, NAV } from './nav';

/* Направление слайда высчитывается по индексу вкладки, чтобы Today→Calendar
 * ехал в одну сторону, а Calendar→Today — в обратную. Для не-nav-роутов
 * (auth, pro, settings) используется мягкий вертикальный cross-fade. */
const idx = (path: string) => NAV.findIndex((n) => n.id === navIdFor(path));
const isNavPath = (path: string) => idx(path) >= 0;

export function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const reduced = useReducedMotion();

  const dir = getDirection(location.pathname, location.state);
  const variants = reduced ? reducedVariants : dir === 'none' ? crossFade : slide(dir);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        {...variants}
        style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}

const slide = (dir: 'left' | 'right') => ({
  initial: { opacity: 0, x: dir === 'left' ? 24 : -24 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.32, ease: [.2, 0, 0, 1] } },
  exit: { opacity: 0, x: dir === 'left' ? -24 : 24, transition: { duration: 0.22, ease: [.5, 0, .75, 0] } },
});
const crossFade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [.2, 0, 0, 1] } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.18 } },
};
const reducedVariants = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

let lastPath = '/';
function getDirection(pathname: string, _state: unknown): 'left' | 'right' | 'none' {
  const a = idx(lastPath), b = idx(pathname);
  lastPath = pathname;
  if (a < 0 || b < 0) return 'none';
  return b > a ? 'left' : b < a ? 'right' : 'none';
}
```

Родитель (`AppShell` `.desktopMain` и `.mobileMain`) должен получить `position: relative` (уже есть) и `overflow: hidden` при смене (чтобы уходящий экран не давал вертикальный скролл в момент перехода). Патч в `AppShell.module.css`:

```css
.desktopMain, .mobileMain { position: relative; }
.desktopMain > *, .mobileMain > * { min-height: 0; }
```

### 2.3 Shared-element для активной пилюли

Файл: `app/src/app/Rail.tsx` и `BottomBar.tsx` — на активной пилюле добавить `layoutId`:

```tsx
// в Rail.tsx и BottomBar.tsx на элементе с className={s.active}:
<motion.div layoutId="nav-active" className={`${s.active} ${ready ? s.ready : ''}`} ...>
```

Импорт `motion` — из `../ui/motion`. Тогда пилюля будет **пере**морфироваться между позициями при смене роута (FLIP). Читается как единый объект, скользящий по рельсу.

### 2.4 Bonus: View Transitions API

Файл `app/src/main.tsx` — заменить `<RouterProvider router={router} />` на компонент-обёртку, которая перехватывает переходы и оборачивает их в `startViewTransition`. Готовое решение — `unstable_HistoryRouter` из `react-router-dom` не подойдёт; проще — свой navigate-wrapper:

```tsx
// app/src/lib/viewTransition.ts
export function withViewTransition(cb: () => void) {
  if (typeof document !== 'undefined' && 'startViewTransition' in document) {
    (document as any).startViewTransition(cb);
  } else {
    cb();
  }
}
```

И в `Rail.tsx`/`BottomBar.tsx` заменить `<Link>` на кастомный `<Link>`, использующий `useNavigate()` + `withViewTransition`. Пример:

```tsx
const nav = useNavigate();
const go = (to: string) => (e: MouseEvent) => { e.preventDefault(); withViewTransition(() => nav(to)); };
// <a href={to} onClick={go(to)} ...>
```

Плюс — CSS-хук для VT (файл `styles/global.css`):
```css
@view-transition { navigation: auto; }
::view-transition-old(root) { animation: none; }
::view-transition-new(root) { animation: none; }
/* элементы с view-transition-name морфятся браузером */
.avatar-shared { view-transition-name: user-avatar; }
```

Аватар в шапках (`Today.Header`, `Profile.Header`) — навесить `className="avatar-shared"`. Тогда браузер сам сделает морф между экранами.

**Тест «уберём — заметно?»:** да, критично. Оставляем.

**После фазы 2**: коммит `feat(motion): route transitions with shared nav pill`.

---

## 3. Фаза 3 — The Habit Check (главный жест приложения)

Это тот самый момент дофамина. Обработка — в `HabitRow.tsx`. Сейчас там `opacity .15s`. Заменяем на композицию из четырёх слоёв: чек, кольцо, счётчик, streak.

### 3.1 Спецификация «правильной» отметки

Когда пользователь тапнул на binary-привычке и она стала `done`:

1. **0 мс — press**: `Press` (из `motion.tsx`) даёт `scale 0.94` за 100 мс.
2. **0–180 мс — box fill**: чекбокс `--ice-25 → --accent`, spring из `wwPop`, но переписан на motion (см. код ниже). Иконка check рисуется через SVG `pathLength` от 0 → 1 (280 мс, `--ease-out-quint`). Не opacity, а **обводка**.
3. **80–280 мс — halo burst**: полупрозрачный круг `--accent` расширяется от `scale(1)` до `scale(2.4)`, `opacity 0.3 → 0`. 200 мс, `--ease-burst`. Ощущение «вспышки».
4. **160–520 мс — ring close** (только для counter/duration): дуга дозакрывается за 360 мс с `--ease-out-quint`, при 100% — короткий glow-pulse (box-shadow spread 0→8→0px) 400 мс.
5. **320 мс — streak counter roll-up**: цифра стрика инкрементируется через `motion`'s `animate()` с numeric transition (см. §3.3).
6. **380 мс — micro-haptic**: `navigator.vibrate?.(6)` (5–8 мс — почти неощутимо тактильно, но добавляет плотность на Android).

### 3.2 Замена HabitRow

Файл: `app/src/pages/today/HabitRow.tsx` — рефакторинг. Ключевые импорты:

```tsx
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, animate } from '../../ui/motion';
```

Box-часть (замена текущего `.box`):

```tsx
{h.type === 'binary' && (
  <motion.button type="button" className={s.hit} onClick={onToggle}
    whileTap={{ scale: 0.92 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}
    role="checkbox" aria-checked={done} aria-label={t.pick(h.title)}>
    <motion.span
      className={s.box}
      data-on={done}
      animate={done
        ? { scale: [1, 1.18, 1], backgroundColor: 'var(--accent)', borderColor: 'transparent' }
        : { scale: 1, backgroundColor: 'transparent', borderColor: 'var(--ice-25)' }}
      transition={{
        scale: { type: 'spring', stiffness: 380, damping: 14 },
        backgroundColor: { duration: 0.18 },
        borderColor: { duration: 0.18 },
      }}
    >
      <AnimatePresence>
        {done && (
          <motion.svg key="chk" width="13" height="13" viewBox="0 0 13 13"
            initial={{ scale: 0.4 }} animate={{ scale: 1 }} exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 460, damping: 20 }}>
            <motion.path d="M2 6.8 L5.4 10 L11 3" stroke="var(--ink)" strokeWidth="2.6"
              strokeLinecap="round" strokeLinejoin="round" fill="none"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ duration: 0.28, ease: [.22, 1, .36, 1] }} />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.span>

    {/* Halo burst — только на клике-ON */}
    <AnimatePresence>
      {done && (
        <motion.span key="halo" aria-hidden
          style={{ position: 'absolute', width: 22, height: 22, borderRadius: '50%',
                   background: 'var(--accent)', pointerEvents: 'none' }}
          initial={{ scale: 1, opacity: 0.35 }}
          animate={{ scale: 2.6, opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [.22, 1, .36, 1] }} />
      )}
    </AnimatePresence>
  </motion.button>
)}
```

Ring-часть (для counter/duration) — заменить существующий SVG на motion:

```tsx
const pct = h.type === 'counter' ? h.count / h.goal : h.type === 'duration' ? 1 - h.left / (h.minutes * 60) : 0;

<svg width="34" height="34" viewBox="0 0 34 34" className={s.ring}>
  <circle cx="17" cy="17" r="15" fill="none" stroke="rgba(168,203,239,.14)" strokeWidth="2.5" />
  <motion.circle
    cx="17" cy="17" r="15" fill="none" stroke="#6FA0D6" strokeWidth="2.5" strokeLinecap="round"
    strokeDasharray="94.25"
    initial={false}
    animate={{ strokeDashoffset: 94.25 * (1 - pct) }}
    transition={{ type: 'spring', stiffness: 140, damping: 22 }}
  />
  {/* Glow на замыкании */}
  <AnimatePresence>
    {pct >= 0.999 && (
      <motion.circle key="glow" cx="17" cy="17" r="15" fill="none" stroke="#6FA0D6" strokeWidth="2.5"
        initial={{ opacity: 0.7, scale: 1 }}
        animate={{ opacity: 0, scale: 1.35 }}
        exit={{ opacity: 0 }}
        style={{ transformOrigin: '17px 17px' }}
        transition={{ duration: 0.6, ease: [.22, 1, .36, 1] }} />
    )}
  </AnimatePresence>
</svg>
```

Убрать `flash`-логику (`onToggle` больше не должен ставить `flash: true` через 320 мс) — она больше не нужна, motion сам управляет момент check-in. Уменьшить `useTodayState` соответственно.

### 3.3 Streak counter roll-up

Новый компонент `app/src/ui/motion.tsx` — добавить:

```tsx
export function AnimatedNumber({ value, className, format = (n: number) => Math.round(n).toString() }: {
  value: number; className?: string; format?: (n: number) => string;
}) {
  const mv = useMotionValue(value);
  const [display, setDisplay] = useState(format(value));
  useEffect(() => {
    const controls = animate(mv, value, { type: 'spring', stiffness: 140, damping: 22, mass: 1 });
    const unsub = mv.on('change', (v) => setDisplay(format(v)));
    return () => { controls.stop(); unsub(); };
  }, [value]); // eslint-disable-line
  return <span className={className}>{display}</span>;
}
```

Применить в `HabitRow.tsx` для `.habitStreak`:
```tsx
<AnimatedNumber value={h.streak} className={s.habitStreak} />
```

**Тест:** уберите — приложение стало «стерильным». Оставляем, это дофамин-петля.

**После фазы 3**: коммит `feat(motion): habit check moment — box, ring, streak`.

---

## 4. Фаза 4 — Composer & List Choreography

### 4.1 Композер в Tracker.tsx

Сейчас `.composer` появляется через `useState(composing)` без motion. Заменяем на `AnimatePresence` с layout-животением, чтобы FAB превращался в форму (feels like origin из точки).

Файл: `app/src/pages/tracker/Tracker.tsx` — обернуть блок композера:

```tsx
<AnimatePresence initial={false}>
  {composing && (
    <motion.div key="composer" layout
      initial={{ opacity: 0, scale: 0.92, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -10 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      style={{ originY: 0, originX: 1 /* attach to FAB corner */ }}
    >
      {/* существующий JSX композера */}
    </motion.div>
  )}
</AnimatePresence>
```

FAB `.fab` — сделать `motion.button` с `layoutId="composer-origin"`. Это включит FLIP-переход между FAB и композером (карточка «раскрывается» из кнопки).

### 4.2 Layout-animation для карточек привычек

`Tracker.tsx` — обернуть список в `<LayoutGroup>` и каждую `HabitCard` — в `motion.div layout`. При `expanded` карточка плавно вырастет, соседи — «расступятся». При удалении:

```tsx
<AnimatePresence mode="popLayout">
  {habits.map((h) => (
    <motion.div key={h.id} layout
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
      <HabitCard ... />
    </motion.div>
  ))}
</AnimatePresence>
```

`mode="popLayout"` — исчезающий элемент **не** сдвигает соседей резко; они плавно съезжают на его место.

### 4.3 Первый монтаж Today — stagger reveal

`Today.tsx`, обёртка контента (grid или mobileScroll):

```tsx
<motion.div initial="initial" animate="animate" variants={staggerParent(0.05, 0.06)}>
  <motion.div variants={staggerChild}>{/* Header */}</motion.div>
  <motion.div variants={staggerChild}>{/* Week */}</motion.div>
  <motion.div variants={staggerChild}>{/* Habits card */}</motion.div>
  {/* ... */}
</motion.div>
```

**НО:** stagger играется только на **первом** монтаже Today после логина/refresh. Между вкладками — не играется (иначе будет замусоривать переходы). Условие:

```tsx
const [firstMount, setFirstMount] = useState(true);
useEffect(() => { const t = setTimeout(() => setFirstMount(false), 1000); return () => clearTimeout(t); }, []);
// используем variants только пока firstMount === true
```

### 4.4 Undo-bar (toast)

`tracker.module.css` уже держит `.undoBar` в `position: fixed`. Обернуть рендер:

```tsx
<AnimatePresence>
  {slipId && (
    <motion.div className={s.undoBar}
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 340, damping: 30 }}>
      {/* содержимое */}
    </motion.div>
  )}
</AnimatePresence>
```

**После фазы 4**: коммит `feat(motion): composer, list choreography, toast`.

---

## 5. Фаза 5 — Calendar & Goals (крупные поверхности)

### 5.1 Calendar — направленное перелистывание

`Calendar.tsx` держит `st.monthOpen` и переключение месяцев через chevron. Добавить свайп + направленный слайд.

**Директива**: месяц-грид (див, где рисуется таблица дней) — обернуть в `AnimatePresence mode="wait"` с `key={monthKey}`. Направление = знак `newMonth - oldMonth`:

```tsx
const [[monthKey, dir], setMonth] = useState<[string, 1 | -1]>([initialKey, 1]);
// при next-month: setMonth([newKey, 1]); при prev: setMonth([newKey, -1]);

<AnimatePresence mode="wait" custom={dir}>
  <motion.div key={monthKey} custom={dir}
    variants={{
      enter: (d) => ({ x: d > 0 ? 40 : -40, opacity: 0 }),
      center: { x: 0, opacity: 1 },
      exit: (d) => ({ x: d > 0 ? -40 : 40, opacity: 0 }),
    }}
    initial="enter" animate="center" exit="exit"
    transition={{ duration: 0.3, ease: [.2,0,0,1] }}>
    {/* grid */}
  </motion.div>
</AnimatePresence>
```

**Свайп-жест** — новый хук `app/src/lib/useSwipe.ts`, использующий `motion`'s `PanInfo`:

```tsx
import { motion } from '../ui/motion';
// в Calendar:
<motion.div drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2}
  onDragEnd={(_, info) => {
    if (info.offset.x < -60) goNextMonth();
    else if (info.offset.x > 60) goPrevMonth();
  }}>
  {/* grid */}
</motion.div>
```

### 5.2 «Сегодня» подсветка в month grid

Дневная ячейка с `data-state='today'` — сейчас статичный `border`. Добавить мягкий бесконечный breath 4 сек (респектируя `quiet`):

```tsx
<motion.div className={s.dayCell} data-state="today"
  animate={quiet ? {} : { boxShadow: ['0 0 0 0 rgba(232,183,94,0)', '0 0 0 6px rgba(232,183,94,.14)', '0 0 0 0 rgba(232,183,94,0)'] }}
  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
```

Не для всех today-ячеек — только для одной в текущей неделе (иначе перебор).

### 5.3 Goals — рекап цели (главный «кинематик»)

Файл: `app/src/pages/goals/Goals.tsx`, компонент `Recap`. Сейчас — `position: fixed` overlay. Заменить на полноэкранный motion-морф:

**Хореография (общая 1400 мс):**
1. 0–200 мс — оверлей `backdrop-filter: blur(0px → 12px)`, `opacity 0 → 1`.
2. 100–520 мс — карточка `.recap` — `scale 0.85 → 1`, `y 40 → 0`, spring stiff=200 damp=22.
3. 300–800 мс — тайлы `.recapTile` — stagger с задержкой 60 мс на элемент, `y 20 → 0`, `opacity 0 → 1`.
4. 800–1400 мс — если цель завершена — **confetti burst** через `motion` (не canvas; 30 частиц через простые `motion.span` с `wwBurst`-подобной анимацией и рандомизированными `--dx/--dy`).
5. Финальный «печатный» акцент: цифра «дней стрика» — `AnimatedNumber` из §3.3, tick-up от 0 до финального значения за 800 мс.

Опционально (для платной ощущения) — **Lottie** на успех:
- Один файл `app/public/lottie/goal-complete.json` (векторная звезда с обводкой). ~40 kb.
- Проигрывается 1 раз, поверх заголовка recap. Пример:

```tsx
import Lottie from 'lottie-react';
import goalAnim from '/lottie/goal-complete.json';
// ...
<Lottie animationData={goalAnim} loop={false} style={{ width: 120, height: 120 }} />
```

Взять готовый Lottie: **LottieFiles → «Confetti Burst» / «Achievement Star»** (бесплатные, MIT). Не рисовать вручную.

### 5.4 Пилюли целей (chips)

`goals.module.css` `.chip` при `sel` → `background: goal.hue`. Оборачиваем в `<LayoutGroup>` + активный chip получает `layoutId="active-goal"` с подложкой:

```tsx
<div style={{ position: 'relative' }}>
  {sel && <motion.div layoutId="active-goal"
            style={{ position: 'absolute', inset: 0, borderRadius: 999, background: goal.hue, zIndex: -1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
  {t.pick(goal.title)}
</div>
```

Тогда переключение между целями даст мягкий морф подложки между chips (как в iOS Segmented control).

**После фазы 5**: коммит `feat(motion): calendar swipe, goals recap cinematic`.

---

## 6. Фаза 6 — Micro-polish (много мелких, каждый — стоит)

### 6.1 Pomodoro — завершение сессии

`Today.tsx` pomo-блок. При `remaining === 0`:
- `.timerBig` цифры делают soft-pop (scale 1 → 1.08 → 1, 600 мс).
- Круглая кнопка Play (`.ctrlPlay`) на 1.2 сек получает `box-shadow` breathing: `0 6px 20px rgba(111,160,214,.35) → 0 6px 32px rgba(111,160,214,.65)` и обратно.
- Опционально: короткий Lottie «wave» позади цифр (10 kb).

### 6.2 PRO gold CTA — shimmer

Файл: `app/src/pages/pro/pro.module.css` и `today.module.css` `.proLink`, `.gold` в `ui.module.css` — добавить бесконечный shimmer (respectирует `quiet`):

```css
.goldShimmer {
  position: relative;
  overflow: hidden;
  isolation: isolate;
}
.goldShimmer::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,.35) 50%, transparent 70%);
  transform: translateX(-120%);
  animation: goldShine 3.6s ease-in-out infinite;
  animation-delay: 1.4s;
  pointer-events: none;
}
@keyframes goldShine { 0%,20% { transform: translateX(-120%); } 60%,100% { transform: translateX(120%); } }
```

Класс `goldShimmer` добавить на: `.proLink` (Today) и `.gold` в Pro-экране. Один цикл раз в ~4 сек — не раздражает, но приковывает.

### 6.3 Mood face — press feedback

`Today.tsx` moodBtn — уже имеет CSS-transition. Заменить на `motion.button` с `whileTap={{ scale: 0.88, rotate: -6 }}` и `whileHover={{ scale: 1.08 }}` — даст живое ощущение выбора.

### 6.4 Chevron/expand — из бинарного ротейта в spring

Везде, где `transform: rotate(90deg)` через CSS transition (Tracker card, Settings archive, Calendar month-toggle) — заменить на `motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ type:'spring', stiffness:400, damping:26 }}`. Дает лёгкий overshoot — читается как «щёлк».

### 6.5 Auth — миграция на motion

Файл: `app/src/pages/auth/screens.tsx` — все `wwSlideL/R/wwShake/wwPop` заменить на `motion.div` c AnimatePresence. Логика та же, но с interruptibility (если пользователь передумал и нажал back — переход прервётся плавно, а не «щёлкнет» в конечное положение).

Пример замены для `.screenL`:
```tsx
<motion.div key={step}
  initial={{ opacity: 0, x: dir === 'forward' ? 48 : -48 }}
  animate={{ opacity: 1, x: 0 }}
  exit={{ opacity: 0, x: dir === 'forward' ? -48 : 48 }}
  transition={{ duration: 0.38, ease: [.2,.8,.2,1] }}>
```

Shake на ошибке — заменить keyframes на `animate={{ x: [0,-7,6,-4,3,0] }} transition={{ duration: 0.42 }}`.

`wwBurst` (Day One конфетти) — оставить как есть, оно уже хорошее. Только добавить `useMotionPrefs().quiet` short-circuit.

**После фазы 6**: коммит `refactor(motion): micro-polish and auth migration`.

---

## 7. Фаза 7 (опциональная) — Scroll-driven storytelling

Только для маркетингового лендинга `veyrarc.online` или для Onboarding-story. **В самом приложении (habits тrackers) — НЕ ставить.** Мешает.

Если и когда понадобится:
- `useScroll` + `useTransform` из `motion/react`.
- Никакого `IntersectionObserver` вручную — motion делает это лучше через `whileInView`.

Пропускаем в первой итерации.

---

## 8. Проверочный чек-лист (перед сдачей PR)

- [ ] `pnpm typecheck` проходит.
- [ ] `prefers-reduced-motion: reduce` — все анимации коротки (< 20 мс) или заменены на кросс-фейд. Проверить через DevTools → Rendering → Emulate CSS media.
- [ ] На iPhone Safari 17+ роут-переходы играются (без View Transitions API — база на AnimatePresence должна работать).
- [ ] Layoutids уникальны в пределах момента (иначе motion бросит warning).
- [ ] Никаких `animation-fill-mode: forwards` там, где motion управляет состоянием — конфликт с exit-анимацией.
- [ ] `will-change` НЕ проставлен глобально; только на `.fab`, `.avatar-shared` и `.wwBreathe`-элементы (иначе Chrome сжирает GPU-память).
- [ ] Lottie-файлы через dynamic import (`const Lottie = lazy(() => import('lottie-react'))`), чтобы не тащить 30 kb в главный чанк.
- [ ] Battery test: 5 минут на Today-экране в фоне — CPU-usage не должен превышать 1% (проверить через Chrome DevTools Performance).

---

## 9. Как передать это Claude Code (готовые prompts)

Ниже — 6 отдельных промптов, по одному на фазу. Каждый — самодостаточный, можно посылать в новую сессию Claude Code. Внутри каждого промпта — ссылка на этот документ (`docs/VEYRARC-MOTION-SPEC.md`), поэтому положите файл в проект перед стартом.

### Prompt 0 — подготовка

```
Read docs/VEYRARC-MOTION-SPEC.md in full, then read:
- app/src/main.tsx
- app/src/styles/tokens.css
- app/src/styles/global.css
- app/src/app/AppShell.tsx
- app/src/app/router.tsx
- app/src/ui/primitives.tsx

Confirm the plan back to me in 5 bullets. Do NOT change any file yet.
```

### Prompt 1 — Motion Foundation

```
Implement Phase 1 of docs/VEYRARC-MOTION-SPEC.md (sections 1.1–1.6):
1. Add `motion` and `lottie-react` to app/package.json dependencies.
2. Extend app/src/styles/tokens.css with the new motion tokens (§1.2).
3. Add prefers-reduced-motion block to app/src/styles/global.css (§1.3).
4. Create app/src/lib/useMotionPrefs.ts exactly as in §1.3.
5. Create app/src/ui/motion.tsx exactly as in §1.4.
6. Wire <MotionProvider> in app/src/main.tsx (§1.5).

Run `pnpm typecheck`. Commit as `feat(motion): foundation — motion, tokens, MotionProvider`.
```

### Prompt 2 — Route transitions

```
Implement Phase 2 (§2.1–§2.4) of docs/VEYRARC-MOTION-SPEC.md:
1. Create app/src/app/AnimatedOutlet.tsx per §2.2.
2. Replace <Outlet /> with <AnimatedOutlet /> in app/src/app/AppShell.tsx (3 places).
3. Patch app/src/app/AppShell.module.css per §2.2.
4. Add layoutId="nav-active" to active pill in Rail.tsx and BottomBar.tsx (§2.3). Import motion from ../ui/motion.
5. Create app/src/lib/viewTransition.ts and wire navigate wrapping in Rail/BottomBar Link → button (§2.4).
6. Add @view-transition CSS + avatar-shared class to app/src/styles/global.css; add className="avatar-shared" to the Avatar in Today Header and Profile Header.

Test in a Chromium browser: click each nav tab, verify no hard cut. In Safari, verify graceful degradation.
Run typecheck. Commit as `feat(motion): route transitions with shared nav pill`.
```

### Prompt 3 — Habit check

```
Implement Phase 3 of docs/VEYRARC-MOTION-SPEC.md:
1. Refactor app/src/pages/today/HabitRow.tsx per §3.2 (box, ring, halo, animated check-path).
2. Remove the `flash` prop chain: HabitRow no longer needs it. Update the parent (Today.tsx) and useTodayState.ts to remove flash state.
3. Add AnimatedNumber component to app/src/ui/motion.tsx per §3.3, and use it for `.habitStreak`.
4. Add navigator.vibrate?.(6) call on the successful check-in in useTodayState.ts.

Keep the CSS classes; only the JSX and behavior change.
Run typecheck. Manually verify on Today screen. Commit as `feat(motion): habit check moment — box, ring, streak`.
```

### Prompt 4 — Composer + list

```
Implement Phase 4 of docs/VEYRARC-MOTION-SPEC.md:
1. Wrap composer JSX in Tracker.tsx with AnimatePresence + layout animation per §4.1.
2. Add layoutId="composer-origin" to the .fab button and use motion.button.
3. Wrap habit cards map in <LayoutGroup> and <AnimatePresence mode="popLayout"> per §4.2. Each card is a motion.div with `layout`.
4. Add stagger reveal on Today first mount per §4.3 — the parent uses staggerParent/staggerChild variants from motion.tsx; child wrappers stop animating after 1s.
5. Wrap undoBar rendering in AnimatePresence per §4.4.

Run typecheck. Manually verify: add a habit, delete a habit, expand a card — all should animate smoothly with no jumps.
Commit as `feat(motion): composer, list choreography, toast`.
```

### Prompt 5 — Calendar + Goals

```
Implement Phase 5 of docs/VEYRARC-MOTION-SPEC.md:
1. Wrap month grid in Calendar.tsx with AnimatePresence + directional slide per §5.1. Track [monthKey, dir] state.
2. Add horizontal drag/swipe on the grid — pan threshold 60px → navigate to prev/next month.
3. Add subtle breathing box-shadow on the single "today" cell in current-week only (§5.2).
4. Rewrite the <Recap> component in Goals.tsx per §5.3: overlay blur-in, card scale-spring, tiles stagger, streak number tick-up via AnimatedNumber.
5. If public/lottie/goal-complete.json is missing, download a small (< 60 kb) MIT-licensed "achievement star" lottie from lottiefiles.com and place it there. Otherwise skip step (leave a TODO comment).
6. Chips in Goals — wrap active-chip pill in <LayoutGroup> with layoutId="active-goal" per §5.4.

Run typecheck + manual test.
Commit as `feat(motion): calendar swipe, goals recap cinematic`.
```

### Prompt 6 — Polish + auth migration

```
Implement Phase 6 of docs/VEYRARC-MOTION-SPEC.md:
1. Pomodoro completion pulse (§6.1).
2. .goldShimmer class + apply to .proLink (Today) and .gold in Pro-screen (§6.2).
3. Mood buttons — motion.button with whileTap/whileHover (§6.3).
4. All chevron rotations (Tracker card, Settings, Calendar) — motion.span with spring (§6.4).
5. Migrate app/src/pages/auth/screens.tsx and screens2.tsx wwSlide/wwShake/wwPop usages to motion equivalents (§6.5). Keep wwBurst as CSS but respect useMotionPrefs().quiet.

Verify: no visible regression on auth flow.
Run typecheck. Commit as `refactor(motion): micro-polish and auth migration`.
```

---

## 10. Не-цели (то, что мы сознательно НЕ делаем)

- **Никакой parallax или scroll-hijacking** в самом приложении. Для habit-трекера это анти-паттерн.
- **Никакого 3D / WebGL / Three.js.** Дорого по батарее, ломает восприятие «спокойной» темы.
- **Никаких GSAP timelines** — motion/react закрывает 100% нужного нам, GSAP добавит 30 kb и параллельный API.
- **Никаких Rive** — Lottie достаточно, экосистема шире, тулинг проще.
- **Не анимируем layout всех списков.** Только Tracker и Today. Settings/Legal — статичные, любая анимация будет мусором.
- **Не делаем свои easing-функции.** Всё берём из токенов.
- **Не анимируем текст-transitions** (typewriter, letter-splitting) — не соответствует голосу продукта.

---

## 11. Метрика успеха

После всех 6 фаз:
1. Первый клик по «сегодня отметить привычку» — пользователь чувствует физическое удовольствие. Тест на 3 живых людях: если хотя бы один говорит «вау», это работает.
2. Переход между вкладками — читается как «один жест», а не «загрузка нового экрана». Тест: снимите screen-record на iPhone, покажите знакомому. Спросите «где здесь Native, а где React?». Он не должен различить.
3. FPS на iPhone 12 — 60 fps на всех переходах. Инструмент: Safari DevTools → Timelines.
4. Bundle-размер — +40 kb gzipped (motion+lottie-react). Не больше.
5. Lighthouse Perf на preview — не проседает больше чем на 3 пункта.

---

*Документ подготовлен под скилл /motion. Последний вопрос перед стартом:* **«Если убрать эту анимацию — заметит ли пользователь?»** Если по любому пункту ответ «нет» — этот пункт из спеки удаляйте, а не реализовывайте.
