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
const P = config.pricing;
const rub = (v: number) => `${v.toLocaleString('ru-RU')} ₽`;
const SITE = config.site.url;
const REQ_RU = `${S.name}, ИНН ${S.inn}, ОГРНИП ${S.ogrnip}. Email: ${CONTACT}${S.phone ? `, телефон ${S.phone}` : ''}.`;
const REQ_EN = `${S.name} (sole proprietor), INN ${S.inn}, OGRNIP ${S.ogrnip}. Email: ${CONTACT}${S.phone ? `, phone ${S.phone}` : ''}.`;

const DOCS: Record<DocId, Record<'ru' | 'en', Doc>> = {
  pricing: {
    ru: {
      title: 'Тарифы', updated: 'Обновлено 15 октября 2026',
      sections: [
        ['Что такое VeyrArc', 'VeyrArc — веб-приложение для привычек, целей и планирования дня в формате 90-дневных арок: отметки привычек, серии, отказ от вредного, цели с шагами, планер, фокус-таймер, аналитика и голосовой ассистент. Работает в браузере на телефоне и компьютере, его можно установить на экран «Домой».'],
        ['Бесплатно — 0 ₽', `Все основные функции: до ${config.limits.free.core} основных привычек и без ограничений дополнительных, до ${config.limits.free.goals} активных целей, планер, фокус-таймер, ассистент, ${config.limits.free.freezesPerWeek} заморозка серии в неделю.`],
        [`Pro на месяц — ${rub(P.ru.monthly)}`, 'Безлимит основных привычек и целей, полная история и сравнение всех арок, корреляции настроения и привычек, 2 заморозки серии в неделю, полный отчёт по завершении арки. Доступ на 1 месяц с автопродлением, которое можно отключить в любой момент.'],
        [`Pro на год — ${rub(P.ru.yearly)}`, `То же, что Pro на месяц, на 12 месяцев (выгоднее помесячной оплаты на ${Math.round((1 - P.ru.yearly / (P.ru.monthly * 12)) * 100)}%). С автопродлением, которое можно отключить в любой момент.`],
        ['Пробный период', `${P.trialDays} дней Pro бесплатно, один раз на аккаунт, без привязки карты и без списаний.`],
        ['Как получить услугу', 'Услуга оказывается онлайн, ничего не доставляется физически. После оплаты Pro включается в вашем аккаунте сразу — на сайте и во всех устройствах, где вы вошли. Подтверждение и кассовый чек приходят на email аккаунта.'],
        ['Оплата', 'Банковской картой, через СБП или SberPay на защищённой странице ЮKassa. Данные карты мы не получаем и не храним.'],
        ['Возврат', `В течение ${P.refundDays} дней после списания — по письму на ${CONTACT}. Подробно — в публичной оферте.`],
        ['Продавец', REQ_RU],
      ],
    },
    en: {
      title: 'Pricing', updated: 'Updated October 15, 2026',
      sections: [
        ['What VeyrArc is', 'VeyrArc is a web app for habits, goals and day planning in 90-day arcs: habit check-ins, streaks, quitting, goals with steps, a planner, a focus timer, analytics and a voice assistant. It runs in the browser on phone and desktop and can be installed to the home screen.'],
        ['Free — 0 ₽', `All the basics: up to ${config.limits.free.core} Core habits and unlimited Extra, up to ${config.limits.free.goals} active goals, planner, focus timer, assistant, ${config.limits.free.freezesPerWeek} streak freeze a week.`],
        [`Pro monthly — ${rub(P.ru.monthly)}`, 'Unlimited Core habits and goals, full history and comparison of every arc, mood and habit correlations, 2 streak freezes a week, the full end-of-arc recap. One month of access, renews automatically, can be turned off any time.'],
        [`Pro yearly — ${rub(P.ru.yearly)}`, 'Everything in Pro monthly for 12 months. Renews automatically, can be turned off any time.'],
        ['Trial', `${P.trialDays} days of Pro free, once per account, no card, no charges.`],
        ['How you receive it', 'The service is online; nothing is shipped. After payment Pro turns on in your account at once on every device you are signed in on. The confirmation and receipt are emailed to your account address.'],
        ['Payment', 'Card, SBP or SberPay on the secure YooKassa page. We never receive or store card details.'],
        ['Refunds', `Within ${P.refundDays} days of a charge — email ${CONTACT}. Details in the public offer.`],
        ['Seller', REQ_EN],
      ],
    },
  },
  offer: {
    ru: {
      title: 'Публичная оферта', updated: 'Редакция от 15 октября 2026',
      sections: [
        ['1. Общие положения', `${S.name} (далее — Исполнитель) предлагает любому лицу (далее — Пользователь) заключить договор на условиях настоящей оферты. Акцептом оферты является оплата подписки Pro на сайте ${SITE} или в приложении VeyrArc. С момента акцепта договор считается заключённым (ст. 437, 438 ГК РФ).`],
        ['2. Предмет', 'Исполнитель предоставляет Пользователю доступ к расширенным функциям веб-приложения VeyrArc (подписка Pro) на оплаченный период, а Пользователь оплачивает доступ. Состав функций указан на странице «Тарифы». Услуга оказывается дистанционно через интернет.'],
        ['3. Стоимость и оплата', `Стоимость: ${rub(P.ru.monthly)} за 1 месяц или ${rub(P.ru.yearly)} за 12 месяцев, НДС не облагается. Оплата производится банковской картой, через СБП или SberPay с помощью платёжного сервиса ЮKassa (ООО НКО «ЮМани»). Кассовый чек направляется на email Пользователя.`],
        ['4. Автопродление', 'Отмечая согласие при оформлении, Пользователь поручает Исполнителю списывать стоимость того же тарифа тем же способом оплаты в начале каждого следующего периода. Списание производится не ранее чем за сутки до окончания оплаченного периода. Автопродление отключается в приложении: Настройки → План → «Отключить автопродление»; доступ сохраняется до конца оплаченного периода, сохранённый способ оплаты отвязывается. Если списание не прошло, доступ к Pro прекращается по окончании оплаченного периода.'],
        ['5. Пробный период', `Один раз на аккаунт предоставляется бесплатный пробный период ${P.trialDays} дней без привязки карты. По его окончании списаний не происходит.`],
        ['6. Порядок оказания услуги', 'Доступ к Pro открывается автоматически сразу после поступления оплаты в аккаунте, с которого она совершена. Услуга считается оказанной надлежащим образом, если в течение оплаченного периода функции Pro доступны Пользователю.'],
        ['7. Возврат', `Пользователь вправе отказаться от подписки и вернуть оплату за текущий период, направив письмо на ${CONTACT} в течение ${P.refundDays} дней с даты списания. Возврат производится тем же способом, которым была произведена оплата, в течение 10 рабочих дней; доступ к Pro при этом прекращается. По истечении этого срока оплата за начавшийся период не возвращается, но автопродление можно отключить в любой момент.`],
        ['8. Права и обязанности', 'Исполнитель обеспечивает работу сервиса и сохранность данных Пользователя, вправе проводить технические работы и обновлять функции без ухудшения оплаченного объёма. Пользователь обязуется не нарушать работу сервиса и не передавать доступ третьим лицам.'],
        ['9. Ответственность', 'Сервис предоставляется «как есть». Исполнитель не отвечает за перерывы в работе, вызванные обстоятельствами вне его контроля (сбои связи, хостинга, платёжных систем). VeyrArc не является медицинской или психологической услугой. Ответственность Исполнителя ограничена суммой, уплаченной Пользователем за текущий период.'],
        ['10. Персональные данные', 'Обработка персональных данных — в соответствии с Политикой конфиденциальности, размещённой на сайте.'],
        ['11. Срок действия и изменения', 'Договор действует до окончания оплаченного периода и продлевается при автопродлении. Исполнитель вправе изменять оферту; новая редакция действует с момента публикации и применяется к следующим периодам. Об изменении цены Пользователь уведомляется не позднее чем за 7 дней до списания.'],
        ['12. Споры', 'Споры решаются путём переговоров, претензия рассматривается в течение 10 дней. Применяется право Российской Федерации.'],
        ['13. Реквизиты Исполнителя', REQ_RU],
      ],
    },
    en: {
      title: 'Public offer', updated: 'Version of October 15, 2026',
      sections: [
        ['Note', 'The binding version of this offer is the Russian one. Summary below.'],
        ['Subject', 'Access to VeyrArc Pro features for the paid period (1 or 12 months), delivered online. Paying for Pro accepts this offer.'],
        ['Price and payment', `${rub(P.ru.monthly)} per month or ${rub(P.ru.yearly)} per year, no VAT, paid through YooKassa (card, SBP, SberPay). A receipt is emailed.`],
        ['Auto-renewal', 'The same plan is charged with the same method at the start of each next period, at most a day before the paid period ends. Turn it off in Settings → Plan; access stays until the end of the paid period.'],
        ['Refunds', `Email ${CONTACT} within ${P.refundDays} days of a charge to get that period refunded within 10 business days; Pro access ends.`],
        ['Seller', REQ_EN],
      ],
    },
  },
  contacts: {
    ru: {
      title: 'Контакты и реквизиты', updated: '',
      sections: [
        ['Продавец', S.name],
        ['ИНН', S.inn],
        ['ОГРНИП', S.ogrnip],
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
        ['OGRNIP', S.ogrnip],
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
        config.beta
          ? ['Бета-версия', 'Сейчас VeyrArc работает в бета-версии: все функции доступны бесплатно и без ограничений. Никаких платежей и списаний нет. Перед появлением платных возможностей мы заранее сообщим об этом в приложении.']
          : ['Подписка Pro', `Базовые функции бесплатны. Pro оформляется на месяц (${config.pricing.ru.monthly} ₽) или на год (${config.pricing.ru.yearly} ₽); один раз доступен бесплатный пробный период ${config.pricing.trialDays} дней без карты. Оплата проходит через ЮKassa (карта, СБП, SberPay); данные карты мы не получаем и не храним.`],
        ...(config.beta ? [] : [
          ['Автопродление', 'Оформляя подписку, вы соглашаетесь, что по окончании оплаченного периода стоимость того же тарифа списывается автоматически тем же способом оплаты. Отключить автопродление можно в любой момент: Настройки → План → «Отключить автопродление»; доступ к Pro сохранится до конца оплаченного периода, способ оплаты отвязывается.'] as [string, string],
          ['Возврат', `Если Pro не подошёл, напишите на ${CONTACT} в течение ${config.pricing.refundDays} дней после списания — вернём деньги за этот период, доступ к Pro при этом закончится. Чек об оплате приходит на email аккаунта.`] as [string, string],
        ]),
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
        config.beta
          ? ['Beta', 'VeyrArc is in beta: every feature is free and unlimited. There are no payments or charges. We will tell you in the app well before any paid features appear.']
          : ['Pro subscription', `The basics are free. Pro is monthly or yearly; a ${config.pricing.trialDays}-day free trial without a card is available once. Payments go through YooKassa (card, SBP, SberPay); we never receive or store card details.`],
        ...(config.beta ? [] : [
          ['Auto-renewal', 'By subscribing you agree that at the end of each paid period the same plan is charged automatically with the same payment method. Turn auto-renewal off any time in Settings → Plan; Pro stays until the end of the paid period and the payment method is removed.'] as [string, string],
          ['Refunds', `If Pro isn’t for you, write to ${CONTACT} within ${config.pricing.refundDays} days of a charge and we refund that period; Pro access ends. The receipt is sent to your account email.`] as [string, string],
        ]),
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
        ['Где хранится', `Данные хранятся в базе Supabase в ЕС (Франкфурт). Письма отправляются через Resend. Сайт размещён на Render.${config.beta ? '' : ' Платежи обрабатывает ЮKassa (ООО НКО «ЮМани»): мы получаем только статус оплаты и маску карты, сами данные карты остаются у ЮKassa.'} Доступ к вашим данным есть только у вашего аккаунта.`],
        ['Кому передаём', 'Никому не продаём и не передаём данные для рекламы. Подрядчики выше обрабатывают данные только для работы сервиса.'],
        ['Вход через Google', 'При входе через Google мы получаем ваш email и имя. Другие данные Google-аккаунта не запрашиваются.'],
        ['Ваши права', 'Экспорт всех данных — Настройки → Данные → Экспортировать. Удаление аккаунта и всех данных — там же. По другим запросам пишите на почту ниже.'],
        ['Cookies', 'Используется только локальное хранилище браузера для входа и языка. Рекламных и аналитических трекеров нет.'],
        ['Контакты', `${CONTACT}`],
      ],
    },
    en: {
      title: 'Privacy policy', updated: 'Updated September 29, 2026',
      sections: [
        ['What we collect', 'Email, first and last name (if you give them), language and time zone; your habits, check-ins, quits, goals, journal entries, planner tasks, mood and focus sessions.'],
        ['Why', 'Only to run the app: show progress, compute streaks and the discipline index, send sign-in codes and the reminders you turned on.'],
        ['Where it is stored', 'Data is stored in a Supabase database in the EU (Frankfurt). Emails are sent via Resend. The site is hosted on Render. Only your account can access your data.'],
        ['Sharing', 'We never sell data or share it for advertising. The providers above process it only to run the service.'],
        ['Google sign-in', 'With Google sign-in we receive your email and name. No other Google account data is requested.'],
        ['Your rights', 'Export all data in Settings → Data → Export. Delete the account and all data there too. For other requests, email us below.'],
        ['Cookies', 'Only the browser’s local storage is used for sign-in and language. No advertising or analytics trackers.'],
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
