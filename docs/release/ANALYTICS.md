# Аналитика

События пишутся в нашу базу Supabase, в таблицу `app_events` (миграция `20261022000002_events.sql`).
Сторонних сервисов нет, в событиях нет текстов привычек, заметок и имён. Читать данные можно в Supabase → SQL Editor.

Яндекс Метрика (необязательно): создайте счётчик на metrika.yandex.ru и задайте на Render переменную
`VITE_METRIKA_ID` с его номером (это публичный номер, не секрет). События уйдут туда как цели.
Если включите Метрику, в политике конфиденциальности нужно добавить упоминание о ней.

## События

| Событие | Когда | Данные |
|---|---|---|
| `app_open` | первый заход за сессию | |
| `onboarding_step` | шаг онбординга | `step` (0–2), `habits` |
| `onboarding_done` | сохранён старт («Я в деле») | `habits` |
| `signup` | подтверждена почта | `via` |
| `first_check` | первая отметка (в первые 7 дней аккаунта) | `minutes_since_signup` |
| `day_kept` | закрыты все Core за день | `streak` |
| `streak_lost` | серия оборвалась (раз в день) | |
| `push_enabled` | разрешены уведомления | |
| `push_open` | открыли приложение из пуша | `k` (вид: reminder, evening, silence, plan…) |
| `trial_start` | начат пробный период | |
| `paywall_view` | открыт экран Pro | |
| `comeback_shown`, `comeback_choice` | экран возвращения и выбор | `gap`; `choice` = keep / fresh |
| `referral_joined` | пришёл по приглашению | |

## Готовые запросы

Воронка онбординга (сколько людей дошли до каждого шага), за 7 дней:

```sql
select name || coalesce(' ' || (props->>'step'), '') as step, count(distinct user_id) as people
from app_events
where at > now() - interval '7 days'
  and (name in ('app_open','onboarding_done','first_check') or name = 'onboarding_step')
group by 1 order by 2 desc;
```

Доля новых пользователей с первой отметкой за час:

```sql
with s as (select u.id, u.created_at from auth.users u where u.created_at > now() - interval '14 days')
select count(*) as new_users,
       count(*) filter (where exists (select 1 from app_events e where e.user_id = s.id and e.name = 'first_check'
                                       and e.at < s.created_at + interval '1 hour')) as first_check_1h
from s;
```

Возврат D1 / D7 / D30 (вернулся в приложение в этот день после регистрации):

```sql
with s as (select id, created_at::date as d0 from auth.users where created_at > now() - interval '60 days')
select d0,
  count(*) as users,
  count(*) filter (where exists (select 1 from app_events e where e.user_id = s.id and e.name = 'app_open' and e.at::date = d0 + 1)) as d1,
  count(*) filter (where exists (select 1 from app_events e where e.user_id = s.id and e.name = 'app_open' and e.at::date = d0 + 7)) as d7,
  count(*) filter (where exists (select 1 from app_events e where e.user_id = s.id and e.name = 'app_open' and e.at::date = d0 + 30)) as d30
from s group by d0 order by d0 desc;
```

Какие пуши возвращают людей:

```sql
select props->>'k' as push, count(*) as opens, count(distinct user_id) as people
from app_events where name = 'push_open' and at > now() - interval '30 days' group by 1 order by 2 desc;
```

## События голосового ассистента

Включаются вместе с остальной аналитикой. Тексты фраз в события не попадают, пока человек не включил в настройках «Помогать улучшать ассистента»; тогда добавляется свойство `t` (до 120 символов). Звук не отправляется никогда.

| Событие | Свойства |
|---|---|
| `voice_open` | `src` — mark / sidebar / hotkey / link / push / hold |
| `voice_stt` | `engine`, `lang`, `alts`, `conf` (округлено до 0,1 или -1), `ms`, `early` (досрочное завершение) |
| `voice_intent` | `kind`, `conf` (0,1), `risk`, `source` — voice / text / chip / link / flow / palette |
| `voice_outcome` | `kind`, `result` — ok / confirm / clarify / reject / error, `ms` |
| `voice_undo` | `kind` |
| `voice_error` | `code` |
| `voice_flow` | `id`, `step`, `result` — done / quit / timeout |
| `voice_wrong` | `kind` (без текста) |
