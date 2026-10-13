# Online Coach — запись на тренировки по тяжёлой атлетике

Мобильное приложение (iOS + Android) для тренера: клиент выбирает вид тренировки, зал и время, записывается и сразу оплачивает. Тренер в настройках ведёт расписание, цены, залы и правила отмены, а о каждой новой записи получает письмо и push-уведомление.

**Стек:** React Native + Expo (Expo Router) · Supabase (база, авторизация, серверные функции) · Stripe (карта, BLIK, Przelewy24, Apple Pay, Google Pay; PLN) · Resend (письма) · Expo Push (уведомления).

## Что умеет

**Клиент**
- Три вида тренировок с иллюстрациями: онлайн тяжёлая атлетика, тяжёлая атлетика в зале (индивидуально), групповая тренировка
- Выбор зала FitFabric Łódź и времени; описание того, что будет на конкретной тренировке
- Запись и оплата в одно касание (Stripe PaymentSheet)
- **Комиссия за отмену видна заранее:** на карточке тренировки и в окне подтверждения перед оплатой
- Отмена: неоплаченная — сразу; оплаченная — возврат минус комиссия, если до начала не меньше заданного числа часов; перед отменой показывается точная сумма возврата и комиссии
- Интерфейс на 4 языках: English, Polski, Українська, Русский (переключатель в профиле и на экране входа, выбор запоминается)

**Тренер** (вкладка «Настройки», видна только с ролью `coach`)
- Новая тренировка: вид, зал, день, время начала, длительность, число мест (для группы), описание
- Ближайшие тренировки с записавшимися (имя, телефон, статус оплаты), отмена тренировки
- Цены трёх видов, размер комиссии за отмену и срок бесплатной отмены
- Список залов: добавить, скрыть, показать
- Письмо и push-уведомление о каждой оплаченной записи

**Защита от двойного бронирования:** место бронируется на сервере с блокировкой строки. Неоплаченная запись держит место 15 минут.

## Демо-режим
Если в `.env` нет ключей Supabase, приложение запускается с тестовыми данными в памяти: можно пощёлкать все экраны без бэкенда и без реальных оплат.
```bash
npm install
npx expo start --web
```

## Структура

```
src/app/                 экраны (Expo Router)
  (auth)/login.tsx       вход, регистрация, выбор языка
  (tabs)/index.tsx       выбор вида тренировки
  (tabs)/bookings.tsx    мои записи, отмена с комиссией
  (tabs)/coach.tsx       настройки тренера
  (tabs)/profile.tsx     профиль и язык
  kind/[kind].tsx        расписание вида: выбор зала и времени
  slot/[id].tsx          тренировка, правила отмены, оплата
src/components/KindArt   иллюстрации трёх видов тренировок
src/lib/i18n.ts          все тексты на 4 языках
supabase/migrations/     схема базы, RLS-политики, функции бронирования
supabase/functions/
  create-payment-intent  бронь + платёж Stripe
  stripe-webhook         отмечает запись оплаченной + письмо и push тренеру
  cancel-booking         отмена и возврат за вычетом комиссии
```

## Запуск

### 1. Supabase
1. Создайте проект на [supabase.com](https://supabase.com) (бесплатного тарифа хватит на старт).
2. Установите [Supabase CLI](https://supabase.com/docs/guides/cli) и привяжите проект:
   ```bash
   supabase login
   supabase link --project-ref <ваш-project-ref>
   supabase db push          # таблицы, 3 вида тренировок, 4 зала FitFabric Łódź
   ```
   Без CLI: откройте SQL Editor в панели Supabase и выполните файл `supabase/migrations/20261013000000_init.sql`.

### 2. Stripe
1. Зарегистрируйтесь на [stripe.com](https://stripe.com), страна — Польша.
2. **Settings → Payment methods:** включите Cards, BLIK, Przelewy24, Apple Pay, Google Pay.
3. Передайте секреты и задеплойте функции:
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
   supabase functions deploy create-payment-intent
   supabase functions deploy cancel-booking
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
4. **Developers → Webhooks → Add endpoint:**
   - URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
   - События: `payment_intent.succeeded`, `payment_intent.canceled`
   - Скопируйте Signing secret: `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`

### 3. Письма о новых записях (бесплатно)
1. Зарегистрируйтесь на [resend.com](https://resend.com) **с тем email, на который хотите получать письма** (бесплатно до 3000 писем в месяц).
2. Создайте API key и выполните:
   ```bash
   supabase secrets set RESEND_API_KEY=re_... COACH_EMAIL=ваш@email.com
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
   Без своего домена Resend отправляет письма только на email владельца аккаунта — для уведомлений тренеру этого достаточно.

### 4. Приложение
```bash
npm install
cp .env.example .env      # заполните ключи
npx eas-cli@latest init   # нужен для push-уведомлений (projectId)
npx expo run:android      # или run:ios на Mac
# либо в облаке без Android Studio/Xcode:
npx eas-cli@latest build --profile development
```
Stripe и push-уведомления — нативные модули, поэтому нужна development-сборка (в Expo Go они не работают).
Для push на Android один раз загрузите ключ Firebase (FCM) в EAS: `npx eas-cli@latest credentials` → Android → Push Notifications.

### 5. Сделать себя тренером
Зарегистрируйтесь в приложении, затем в Supabase → SQL Editor:
```sql
update profiles set role = 'coach'
where id = (select id from auth.users where email = 'ваш@email.com');
```
Перезапустите приложение — появится вкладка «Настройки». Откройте её и разрешите уведомления.

## Тестовая оплата
С ключами `pk_test_` / `sk_test_` используйте карту `4242 4242 4242 4242`, любой будущий срок и любой CVC. BLIK в тестовом режиме — любой 6-значный код.

## Комиссия за отмену
По умолчанию 5 zł и 24 часа — меняется в «Настройки → Цены». Stripe не возвращает свою комиссию (~3 zł) при возврате, поэтому комиссия за отмену её покрывает. Отмена тренером целой тренировки возвратов автоматически не делает — верните деньги в Stripe Dashboard (Payments → Refund).

## Перед публикацией в сторах
- В `app.json` замените `com.example.coachbooking` на свой идентификатор, а также `merchantIdentifier` для Apple Pay (и в `src/lib/payments.native.tsx`).
- Замените иконки в `assets/`.
- Переключите Stripe на live-ключи.
- Оплата персональных тренировок через Stripe допускается правилами App Store и Google Play: это услуга вживую или один на один, а не цифровой контент.
