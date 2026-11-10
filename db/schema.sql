-- DavsCode: схема основной базы данных.
-- Скрипт идемпотентен: его можно запускать повторно (npm run db:migrate).

create sequence if not exists lead_number_seq start 1;

-- Заявки. Основной источник правды по статусам; Google Sheets — только отображение.
create table if not exists leads (
  id               text primary key default ('DC-' || lpad(nextval('lead_number_seq')::text, 6, '0')),
  idempotency_key  text not null unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  source           text not null check (source in ('site', 'bot')),
  project_type     text not null check (project_type in ('site', 'bot', 'automation', 'other')),
  description      text not null check (char_length(description) between 10 and 2000),
  budget           text not null check (budget in ('lt20', '20_50', '50_100', 'gt100', 'undecided')),
  timeline         text not null check (timeline in ('urgent', 'month', 'flexible')),
  name             text not null check (char_length(name) between 1 and 80),
  contact_method   text not null check (contact_method in ('telegram', 'phone', 'email')),
  contact          text not null check (char_length(contact) between 1 and 200),
  telegram_user_id bigint,
  status           text not null default 'new' check (status in ('new', 'in_progress', 'rejected', 'done')),
  reject_reason    text check (reject_reason in ('expensive', 'not_my_profile', 'changed_mind', 'no_contact', 'other')),
  reject_note      text,
  case_url         text,
  result_note      text,
  first_touch      jsonb not null default '{}'::jsonb,
  last_touch       jsonb not null default '{}'::jsonb,
  sheet_synced_at  timestamptz
);

create index if not exists leads_created_at_idx on leads (created_at);
create index if not exists leads_status_idx on leads (status);

-- Согласие на обработку персональных данных: факт, время и версия текста.
create table if not exists consents (
  id         bigserial primary key,
  lead_id    text not null references leads (id) on delete cascade,
  version    text not null,
  given_at   timestamptz not null default now(),
  channel    text not null check (channel in ('site', 'bot'))
);

-- Журнал изменений заявки: кто, когда, из какого статуса в какой.
create table if not exists lead_events (
  id          bigserial primary key,
  lead_id     text not null references leads (id) on delete cascade,
  created_at  timestamptz not null default now(),
  actor       text not null,
  action      text not null,
  from_status text,
  to_status   text,
  payload     jsonb not null default '{}'::jsonb
);

create index if not exists lead_events_lead_idx on lead_events (lead_id, created_at);

-- Задания на доставку уведомлений и синхронизацию (outbox с повторными попытками).
create table if not exists jobs (
  id            bigserial primary key,
  lead_id       text not null references leads (id) on delete cascade,
  kind          text not null check (kind in ('notify_owner', 'sync_sheet')),
  status        text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts      int not null default 0,
  max_attempts  int not null default 10,
  next_run_at   timestamptz not null default now(),
  locked_until  timestamptz,
  last_error    text,
  last_error_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Не больше одного ожидающего задания одного типа на заявку.
create unique index if not exists jobs_one_pending_idx on jobs (lead_id, kind) where status = 'pending';
create index if not exists jobs_due_idx on jobs (next_run_at) where status in ('pending', 'running');

-- Пользователи Telegram, которые писали боту.
create table if not exists telegram_users (
  tg_id        bigint primary key,
  username     text,
  first_name   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Состояние диалога с ботом (бриф, вопрос, ввод причины отказа и т. п.).
create table if not exists bot_sessions (
  tg_id      bigint primary key,
  state      text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Связь «сообщение у владельца → клиент», чтобы ответ уходил нужному человеку.
create table if not exists message_links (
  owner_message_id bigint primary key,
  client_tg_id     bigint not null,
  lead_id          text references leads (id) on delete set null,
  created_at       timestamptz not null default now()
);

-- Уже обработанные update_id Telegram: защита от повторной доставки вебхука.
create table if not exists processed_updates (
  update_id  bigint primary key,
  created_at timestamptz not null default now()
);

-- Счётчики rate limit, общие для всех serverless-вызовов.
create table if not exists rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);
