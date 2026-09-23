# VeyrArc — настройка сервисов (пошагово)

Ваша часть — создать аккаунты и ключи, это примерно 40–60 минут. Остальное (настройки входа, письма, лимиты, деплой) я делаю сам через API, когда получу ключи.

**Ключи и пароли не присылайте в чат.** Их нужно положить в настройки среды Claude, это шаг 6. Там же открывается доступ к сервисам в сети: сейчас среда их блокирует.

Записывайте всё, что получаете, в менеджер паролей или заметку. В конце понадобятся 9 значений (таблица в шаге 6).

---

## 1. Домен veyrarc.com

Домен уже куплен?
- **Да** — запомните, где он куплен: там будем добавлять DNS-записи для почты и сайта.
- **Нет** — купите его, например, в Cloudflare Registrar (cloudflare.com → Domain Registration → Register). Это около $10–11 в год, без наценки, и DNS там удобный. Подойдёт любой регистратор.

## 2. Supabase — база данных и вход

1. Зайдите на **supabase.com** → Start your project → войдите через GitHub.
2. Нажмите **New project**:
   - Name: `veyrarc`
   - Database Password: нажмите Generate и **сохраните пароль** → это `SUPABASE_DB_PASSWORD`
   - Region: **Central EU (Frankfurt)**
   - План: Free
3. Когда проект создастся, скопируйте ID проекта из адреса страницы: `supabase.com/dashboard/project/`**`abcdefghijklmnop`**. Это `SUPABASE_PROJECT_REF`.
4. Создайте ключ доступа для меня: аватар справа вверху → **Account preferences → Access Tokens → Generate new token**. Имя: `claude`. Скопируйте ключ → `SUPABASE_ACCESS_TOKEN`.

Больше в Supabase ничего нажимать не нужно. Вход по email с кодом, гостевой режим, Google и адреса сайта я настрою сам.

## 3. Google — кнопка «Войти через Google»

1. Откройте **console.cloud.google.com** → вверху выбор проекта → **New Project** → имя `VeyrArc` → Create.
2. Меню → **APIs & Services → OAuth consent screen** (может называться **Google Auth Platform → Branding**):
   - App name: `VeyrArc`
   - User support email: ваш email
   - Audience / User type: **External**
   - Developer contact: ваш email
   - Сохраните. Если есть кнопка **Publish app** — нажмите: иначе войти смогут только тестовые пользователи.
3. **Credentials** (или **Clients**) → **Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `VeyrArc web`
   - Authorized redirect URIs → Add URI: `https://ВАШ_PROJECT_REF.supabase.co/auth/v1/callback`. Подставьте ID из шага 2.3.
   - Create.
4. Появятся **Client ID** → `GOOGLE_CLIENT_ID` и **Client secret** → `GOOGLE_CLIENT_SECRET`.

## 4. Resend — письма с кодом и уведомления

1. Зайдите на **resend.com** → Sign up.
2. **Domains → Add Domain** → `veyrarc.com`. Регион: **EU (Ireland)**.
3. Resend покажет 3–4 DNS-записи (MX, TXT/SPF, TXT/DKIM). Добавьте их у регистратора домена (шаг 1) в раздел DNS: тип, имя и значение — один в один. Потом нажмите **Verify** в Resend. Проверка занимает от минут до пары часов.
4. **API Keys → Create API Key**:
   - Name: `veyrarc`
   - Permission: **Full access**, чтобы я мог сам настроить отправку
   - Скопируйте ключ → `RESEND_API_KEY`.

Если с DNS будут вопросы — пришлите скриншот экрана Resend со списком записей (там нет секретов), подскажу.

## 5. Render — хостинг сайта

1. Зайдите на **render.com** → Get Started → войдите через **GitHub**. Когда спросит доступ к репозиториям, выберите `asiochkov/veyrarc`.
2. **Account Settings → API Keys → Create API Key** → имя `claude` → скопируйте ключ → `RENDER_API_KEY`.

Сам сайт я создам через API: статический сайт из ветки, бесплатный план. Когда он заработает, дам 2 DNS-записи для `veyrarc.com`.

## 6. Настройки среды Claude — ключи и доступ к сети

В этой сессии Claude: название среды в заголовке сессии → **Edit**.

**Переменные окружения** (Environment variables / API credentials) — добавьте 9 строк:

| Имя | Где взяли |
|---|---|
| `SUPABASE_PROJECT_REF` | шаг 2.3 |
| `SUPABASE_ACCESS_TOKEN` | шаг 2.4 |
| `SUPABASE_DB_PASSWORD` | шаг 2.2 |
| `GOOGLE_CLIENT_ID` | шаг 3.4 |
| `GOOGLE_CLIENT_SECRET` | шаг 3.4 |
| `RESEND_API_KEY` | шаг 4.4 |
| `RENDER_API_KEY` | шаг 5.2 |
| `VEYRARC_DOMAIN` | `veyrarc.com` |
| `VEYRARC_REPO` | `asiochkov/veyrarc` |

**Network access** — разрешите эти адреса или выберите уровень доступа, который их включает:

```
api.supabase.com
*.supabase.co
*.pooler.supabase.com
api.resend.com
api.render.com
```

Уровни доступа описаны здесь: https://code.claude.com/docs/en/claude-code-on-the-web

**Важно:** новые переменные и сетевой доступ видит только **новая сессия**. Когда всё добавите, откройте новую сессию в этой среде и напишите: «Продолжай VeyrArc, этап 3. Ключи добавлены». Всё нужное для продолжения лежит в репозитории: ветка `veyrarc-app`, файлы `docs/stage-*.md`, `docs/setup-guide.md`, `supabase/migrations/`.

---

## Что я сделаю сам после этого

- Применю миграции базы (после вашего «ок» на `docs/stage-3-schema.md`).
- В Supabase:
  - вход по email с 6-значным кодом;
  - гостевой режим;
  - Google;
  - адреса `https://veyrarc.com` и адрес Render;
  - письма через Resend с адреса `no-reply@veyrarc.com`;
  - шаблоны писем RU/EN в стиле приложения.
- **B27 (повторная отправка кода).** Кнопка «Отправить ещё раз» в дизайне появляется через 45 секунд. Supabase по умолчанию разрешает новое письмо только через 60. Выставлю в Supabase 45 секунд, чтобы кнопка и сервер совпадали.

  Ещё одна причина для Resend: встроенная почта Supabase отправляет всего несколько писем в час и годится только для тестов.
- Render: сайт из ветки с автообновлением при каждом пуше. Когда подключим домен — HTTPS.
