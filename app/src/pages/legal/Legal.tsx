import { config } from '../../config';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLangStore } from '../../i18n';
import { Icon } from '../../ui/Icon';
import { LegalLinks, type DocId } from './LegalLinks';

/*
 * /terms and /privacy — not in the design; required by the sign-up links and
 * Google's consent screen. Built from the app's type and colours.
 */
type Doc = { title: string; updated: string; sections: [string, string][] };
const S = config.seller;
const CONTACT = S.email || config.site.support;
const SITE = config.site.url;

const DOCS: Record<DocId, Record<'ru' | 'en', Doc>> = {
  contacts: {
    ru: {
      title: 'Контакты и реквизиты', updated: '',
      sections: [
        ['Продавец', S.name],
        ['ИНН', S.inn],
        ...(S.ogrnip ? [['ОГРНИП', S.ogrnip] as [string, string]] : []),
        ['Email', CONTACT],
        ...(S.phone ? [['Телефон', S.phone] as [string, string]] : []),
        ['Сайт', SITE],
        ['Поддержка', `Пишите на ${CONTACT} — отвечаем в течение 1 рабочего дня.`],
      ],
    },
    en: {
      title: 'Contacts', updated: '',
      sections: [
        ['Seller', `${S.name} (sole proprietor)`],
        ['INN', S.inn],
        ...(S.ogrnip ? [['OGRNIP', S.ogrnip] as [string, string]] : []),
        ['Email', CONTACT],
        ...(S.phone ? [['Phone', S.phone] as [string, string]] : []),
        ['Website', SITE],
        ['Support', `Email ${CONTACT} — we reply within one business day.`],
      ],
    },
  },
  terms: {
    ru: {
      title: 'Условия использования', updated: 'Обновлено 29 сентября 2026',
      sections: [
        ['Сервис', 'VeyrArc — веб-приложение для привычек, отказов от вредного, целей и планирования. Пользуясь им, вы соглашаетесь с этими условиями.'],
        ['Аккаунт', 'Можно начать без регистрации: данные хранятся в гостевом аккаунте. Чтобы не потерять прогресс, привяжите email. Вы отвечаете за сохранность пароля.'],
        ['Бесплатно', 'VeyrArc бесплатен: все функции доступны без оплаты и подписок.'],
        ['Ваш контент', 'Названия привычек, записи дневника и заметки принадлежат вам. Мы храним их только для работы приложения.'],
        ['Ограничения', 'Не используйте сервис для незаконных целей и не пытайтесь получить доступ к чужим данным. VeyrArc не является медицинской рекомендацией.'],
        ['Удаление', 'Аккаунт можно удалить в Настройках → Данные. Все данные удаляются без возможности восстановления.'],
        ['Изменения', 'Мы можем обновлять условия; о существенных изменениях сообщим в приложении.'],
        ['Контакты', `Вопросы — ${CONTACT}.`],
      ],
    },
    en: {
      title: 'Terms of use', updated: 'Updated September 29, 2026',
      sections: [
        ['The service', 'VeyrArc is a web app for habits, quitting bad habits, goals and planning. By using it you agree to these terms.'],
        ['Account', 'You can start without signing up: your data lives in a guest account. Link an email to keep your progress. You are responsible for your password.'],
        ['Free', 'All VeyrArc features are free, with no payments or subscriptions.'],
        ['Your content', 'Habit names, journal entries and notes are yours. We store them only to run the app.'],
        ['Acceptable use', 'Do not use the service unlawfully or try to access other people’s data. VeyrArc is not medical advice.'],
        ['Deletion', 'Delete your account in Settings → Data. All data is removed permanently.'],
        ['Changes', 'We may update these terms; we will tell you in the app about significant changes.'],
        ['Contact', `Questions — ${CONTACT}.`],
      ],
    },
  },
  privacy: {
    ru: {
      title: 'Политика конфиденциальности', updated: 'Обновлено 29 сентября 2026',
      sections: [
        ['Что мы собираем', 'Email, имя и фамилию (если вы их указали), язык и часовой пояс; ваши привычки, отметки, отказы, цели, записи дневника, задачи планера, настроение и фокус-сессии.'],
        ['Зачем', 'Только чтобы приложение работало: показывать прогресс, считать серии и индекс дисциплины, отправлять коды входа и напоминания, которые вы включили.'],
        ['Где хранится', `Данные хранятся в базе Supabase в ЕС. Письма отправляются через Resend. Сайт размещён на Render. Доступ к вашим данным есть только у вашего аккаунта.`],
        ['Кому передаём', 'Никому не продаём и не передаём данные для рекламы. Подрядчики выше обрабатывают данные только для работы сервиса.'],
        ['Вход через Google', 'При входе через Google мы получаем ваш email и имя. Другие данные Google-аккаунта не запрашиваются.'],
        ['Ваши права', 'Экспорт всех данных — Настройки → Данные → Экспортировать. Удаление аккаунта и всех данных — там же. По другим запросам пишите на почту ниже.'],
        ['Cookies и аналитика', 'Локальное хранилище браузера используется для входа, настроек и сохранения изменений без интернета. Если включена Яндекс Метрика, ей передаются события использования без текстов ваших привычек и записей; запись сеансов отключена.'],
        ['Контакты', `${CONTACT}`],
      ],
    },
    en: {
      title: 'Privacy policy', updated: 'Updated September 29, 2026',
      sections: [
        ['What we collect', 'Email, first and last name (if you give them), language and time zone; your habits, check-ins, quits, goals, journal entries, planner tasks, mood and focus sessions.'],
        ['Why', 'Only to run the app: show progress, compute streaks and the discipline index, send sign-in codes and the reminders you turned on.'],
        ['Where it is stored', 'Data is stored in a Supabase database in the EU. Emails are sent via Resend. The site is hosted on Render. Only your account can access your data.'],
        ['Sharing', 'We never sell data or share it for advertising. The providers above process it only to run the service.'],
        ['Google sign-in', 'With Google sign-in we receive your email and name. No other Google account data is requested.'],
        ['Your rights', 'Export all data in Settings → Data → Export. Delete the account and all data there too. For other requests, email us below.'],
        ['Cookies and analytics', 'Browser storage is used for sign-in, preferences and offline changes. When Yandex Metrika is enabled, it receives usage events without the text of your habits or notes; session replay is disabled.'],
        ['Contact', `${CONTACT}`],
      ],
    },
  },
};

export function Legal({ doc }: { doc: DocId }) {
  const lang = useLangStore((x) => x.lang);
  const d = DOCS[doc][lang];
  const navigate = useNavigate();
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 18px 60px' }}>
        <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          style={{ cursor: 'pointer', padding: 0, width: 44, height: 44, borderRadius: '50%', background: 'var(--card)', border: '1px solid rgba(168,203,239,.1)', display: 'grid', placeItems: 'center', color: 'rgba(var(--fg-rgb),.7)' }}
          aria-label="back"><Icon name="back" size={18} sw={2} /></button>
        <div style={{ font: 'var(--fw-bold) 10px var(--font-mono)', letterSpacing: '.24em', color: 'rgba(var(--fg-rgb),.5)', marginTop: 26 }}>VEYRARC</div>
        <h1 style={{ font: 'var(--fw-heavy) 30px/1.15 var(--font-ui)', margin: '10px 0 0', color: 'var(--text-strong)', textWrap: 'balance' } as CSSProperties}>{d.title}</h1>
        {d.updated && <div style={{ font: 'var(--fw-medium) 12px var(--font-mono)', color: 'rgba(var(--fg-rgb),.56)', marginTop: 10 }}>{d.updated}</div>}
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {d.sections.map(([h, p]) => (
            <section key={h}>
              <h2 style={{ font: 'var(--fw-bold) 15px var(--font-ui)', margin: 0, color: 'var(--text-strong)' }}>{h}</h2>
              <p style={{ font: 'var(--fw-regular) 14px/1.6 var(--font-ui)', margin: '8px 0 0', color: 'rgba(var(--fg-rgb),.7)', maxWidth: '65ch' }}>{p}</p>
            </section>
          ))}
        </div>
        <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid rgba(var(--fg-rgb),.08)' }}><LegalLinks lang={lang} current={doc} /></div>
      </div>
    </div>
  );
}
