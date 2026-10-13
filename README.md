# Online Coach — запись на тренировки и оплата

Мобильное приложение (iOS + Android) для тренера: клиенты видят расписание, записываются на тренировку и сразу оплачивают её. Тренер добавляет тренировки и видит, кто записался.

**Стек:** React Native + Expo (Expo Router) · Supabase (база, авторизация, edge-функции) · Stripe (карта, BLIK, Przelewy24, Apple Pay, Google Pay; валюта PLN).

## Что умеет

**Клиент**
- Регистрация и вход по email и паролю
- Расписание на 30 дней вперёд, сгруппированное по дням, с ценой и свободными местами
- Запись и оплата в одно касание (Stripe PaymentSheet)
- «Мои записи»: предстоящие и прошедшие, статус оплаты
- Отмена: неоплаченная — сразу; оплаченная — с автоматическим возвратом денег, если до начала больше 24 часов
- Профиль: имя и телефон
- Интерфейс на польском или русском — по языку телефона (`src/lib/i18n.ts`)

**Тренер** (вкладка видна только с ролью `coach`)
- Добавить тренировку: услуга, дата и время, количество мест, место проведения
- Список ближайших тренировок с записавшимися (имя, телефон, статус оплаты)
- Отменить тренировку

**Защита от двойного бронирования:** место бронируется на сервере с блокировкой строки. Неоплаченная запись держит место 15 минут, потом оно снова свободно.

## Структура

```
src/app/                 экраны (Expo Router)
  (auth)/login.tsx       вход и регистрация
  (tabs)/index.tsx       расписание
  (tabs)/bookings.tsx    мои записи
  (tabs)/coach.tsx       экран тренера
  (tabs)/profile.tsx     профиль
  slot/[id].tsx          тренировка + оплата
src/lib/                 Supabase-клиент, авторизация, тексты, форматирование, цвета
supabase/migrations/     схема базы, RLS-политики, функции бронирования
supabase/functions/
  create-payment-intent  бронь + платёж Stripe
  stripe-webhook         отмечает запись оплаченной
  cancel-booking         отмена и возврат денег
```

## Запуск

### 1. Supabase
1. Создайте проект на [supabase.com](https://supabase.com) (бесплатного тарифа хватит на старт).
2. Установите [Supabase CLI](https://supabase.com/docs/guides/cli) и привяжите проект:
   ```bash
   supabase login
   supabase link --project-ref <ваш-project-ref>
   supabase db push          # создаст таблицы и демо-услуги
   ```
   Без CLI: откройте SQL Editor в панели Supabase и выполните файл `supabase/migrations/20261013000000_init.sql`.
3. Отредактируйте услуги и цены в таблице `services` (цены в грошах: 15000 = 150 zł).

### 2. Stripe
1. Зарегистрируйтесь на [stripe.com](https://stripe.com), страна — Польша.
2. **Settings → Payment methods:** включите Cards, BLIK, Przelewy24, Apple Pay, Google Pay.
3. Передайте секреты в edge-функции и задеплойте их:
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
   supabase functions deploy create-payment-intent
   supabase functions deploy cancel-booking
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
4. **Developers → Webhooks → Add endpoint:**
   - URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
   - События: `payment_intent.succeeded`, `payment_intent.canceled`
   - Скопируйте Signing secret и выполните `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`

### 3. Приложение
```bash
npm install
cp .env.example .env      # заполните ключи
npx expo start
```
Stripe-модуль нативный, поэтому для полноценной проверки оплаты нужна development-сборка:
```bash
npx expo run:android      # или run:ios на Mac
# либо в облаке без Android Studio/Xcode:
npx eas-cli@latest build --profile development
```

### 4. Сделать себя тренером
Зарегистрируйтесь в приложении, затем в Supabase → SQL Editor:
```sql
update profiles set role = 'coach'
where id = (select id from auth.users where email = 'ваш@email.com');
```
Перезапустите приложение — появится вкладка «Тренер».

## Тестовая оплата
С ключами `pk_test_` / `sk_test_` используйте карту `4242 4242 4242 4242`, любой будущий срок и любой CVC. BLIK в тестовом режиме — любой 6-значный код.

## Перед публикацией в сторах
- В `app.json` замените `com.example.coachbooking` на свой идентификатор (например, `pl.oleksandr.coach`), а также `merchantIdentifier` для Apple Pay — и там же в `src/app/_layout.tsx`.
- Замените иконки в `assets/`.
- Переключите Stripe на live-ключи.
- Оплата персональных тренировок через Stripe допускается правилами App Store и Google Play: это услуга, оказываемая вживую, а не цифровой контент.

## Что можно добавить дальше
- Пакеты и абонементы (например, 10 тренировок со скидкой)
- Push-напоминания за день до тренировки (expo-notifications)
- Онлайн-программы тренировок для удалённых клиентов
- Календарь для тренера вместо ввода даты текстом
