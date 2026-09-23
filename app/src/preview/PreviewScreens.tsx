import { Link, Outlet, useLocation } from 'react-router-dom';
import { useLangStore, type Lang } from '../i18n';
import s from './preview.module.css';

/* Preview-only screen list. Not in the design and not in the production build. */

type Item = { path: string; ru: string; en: string };
type Group = { ru: string; en: string; items: Item[] };

const GROUPS: Group[] = [
  {
    ru: 'Приложение', en: 'App',
    items: [
      { path: '/', ru: 'Сегодня', en: 'Today' },
      { path: '/habits', ru: 'Трекер — привычки и отказы', en: 'Tracker — habits and quits' },
      { path: '/calendar', ru: 'Календарь', en: 'Calendar' },
      { path: '/goals', ru: 'Цели', en: 'Goals' },
      { path: '/profile', ru: 'Профиль', en: 'Profile' },
      { path: '/settings', ru: 'Настройки', en: 'Settings' },
      { path: '/pro', ru: 'VeyrArc Pro', en: 'VeyrArc Pro' },
    ],
  },
  {
    ru: 'Вход и онбординг', en: 'Sign-in and onboarding',
    items: [
      { path: '/welcome', ru: 'Приветствие', en: 'Welcome' },
      { path: '/onboarding', ru: 'Онбординг', en: 'Onboarding' },
      { path: '/day-one', ru: 'День 1', en: 'Day one' },
      { path: '/start', ru: 'Первый экран', en: 'First home' },
      { path: '/signup', ru: 'Регистрация', en: 'Sign up' },
      { path: '/verify', ru: 'Код из письма', en: 'Email code' },
      { path: '/login', ru: 'Вход', en: 'Log in' },
      { path: '/reset', ru: 'Сброс пароля', en: 'Reset password' },
      { path: '/settings/account', ru: 'Аккаунт', en: 'Account' },
    ],
  },
];

const COPY = {
  ru: { title: 'Превью VeyrArc', sub: 'Этап 2: вёрстка на тестовых данных. Сервера пока нет — изменения не сохраняются после перезагрузки.', screens: 'Экраны' },
  en: { title: 'VeyrArc preview', sub: 'Stage 2: layout on sample data. No server yet — changes reset on reload.', screens: 'Screens' },
};

export function PreviewScreens() {
  const lang = useLangStore((st) => st.lang);
  const setLang = useLangStore((st) => st.setLang);
  const c = COPY[lang];
  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <div className={s.head}>
          <div>
            <h1 className={s.title}>{c.title}</h1>
            <p className={s.sub}>{c.sub}</p>
          </div>
          <div className={s.langs} role="group" aria-label="Language">
            {(['ru', 'en'] as Lang[]).map((l) => (
              <button key={l} type="button" className={s.lang} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
        {GROUPS.map((g) => (
          <section key={g.en} className={s.group}>
            <h2 className={s.groupTitle}>{g[lang]}</h2>
            <div className={s.list}>
              {g.items.map((it) => (
                <Link key={it.path} to={it.path} className={s.item}>
                  <span>{it[lang]}</span>
                  <span className={s.path}>{it.path}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function PreviewLayout() {
  const { pathname } = useLocation();
  const lang = useLangStore((st) => st.lang);
  return (
    <>
      <Outlet />
      {pathname !== '/__screens' && (
        <Link to="/__screens" className={s.tab}>{COPY[lang].screens}</Link>
      )}
    </>
  );
}
