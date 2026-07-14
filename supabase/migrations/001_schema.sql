begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$ begin
    create type public.user_role as enum ('admin', 'barber', 'customer');
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.appointment_status as enum ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.appointment_source as enum ('site', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.payment_status as enum ('unpaid', 'paid', 'refunded');
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.stock_status as enum ('available', 'out_of_stock', 'hidden');
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.movement_type as enum ('income', 'expense');
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.subscription_status as enum ('active', 'paused', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.settings (
    id uuid primary key default gen_random_uuid(),
    singleton boolean not null default true unique check (singleton),
    business_name text not null,
    barber_name text not null,
    address text not null,
    phone_display text,
    phone_digits text,
    opening_hours_text text,
    map_url text,
    instagram_url text,
    timezone text not null default 'America/Sao_Paulo',
    slot_interval_minutes integer not null default 10 check (slot_interval_minutes between 5 and 60),
    booking_window_days integer not null default 30 check (booking_window_days between 7 and 90),
    booking_notice_minutes integer not null default 120 check (booking_notice_minutes >= 0),
    cancellation_notice_hours integer not null default 2 check (cancellation_notice_hours >= 0),
    accepting_bookings boolean not null default true,
    store_enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    email text,
    phone text,
    role public.user_role not null default 'customer',
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.services (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    description text,
    duration_minutes integer not null check (duration_minutes between 5 and 480),
    price numeric(10,2) not null check (price >= 0),
    active boolean not null default true,
    featured boolean not null default false,
    position integer not null default 0,
    icon_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.business_hours (
    id uuid primary key default gen_random_uuid(),
    weekday smallint not null unique check (weekday between 0 and 6),
    is_open boolean not null default false,
    opens_at time,
    closes_at time,
    break_start time,
    break_end time,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (
        (is_open = false)
        or (opens_at is not null and closes_at is not null and opens_at < closes_at)
    ),
    check (
        (break_start is null and break_end is null)
        or (break_start is not null and break_end is not null and break_start < break_end)
    )
);

create table if not exists public.blocked_periods (
    id uuid primary key default gen_random_uuid(),
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    reason text,
    all_day boolean not null default false,
    created_by uuid references public.profiles(id) on delete set null default auth.uid(),
    created_at timestamptz not null default now(),
    check (ends_at > starts_at)
);

create table if not exists public.customers (
    id uuid primary key default gen_random_uuid(),
    auth_user_id uuid unique references auth.users(id) on delete set null,
    name text not null,
    phone text not null unique,
    email text,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.customers(id) on delete restrict,
    service_id uuid not null references public.services(id) on delete restrict,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    status public.appointment_status not null default 'pending',
    source public.appointment_source not null default 'site',
    notes text,
    total_amount numeric(10,2) not null default 0 check (total_amount >= 0),
    payment_status public.payment_status not null default 'unpaid',
    payment_method text,
    created_by uuid references public.profiles(id) on delete set null default auth.uid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (ends_at > starts_at)
);

alter table public.appointments
    drop constraint if exists appointments_no_overlap;

alter table public.appointments
    add constraint appointments_no_overlap
    exclude using gist (
        tstzrange(starts_at, ends_at, '[)') with &&
    )
    where (status in ('pending', 'confirmed'));

create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    category text not null,
    description text,
    details text,
    price numeric(10,2) not null check (price >= 0),
    active boolean not null default true,
    featured boolean not null default false,
    stock_status public.stock_status not null default 'available',
    image_url text,
    position integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.plans (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text,
    price numeric(10,2) not null check (price >= 0),
    billing_cycle text not null default 'monthly',
    cuts_included integer not null default 0 check (cuts_included >= 0),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.customers(id) on delete restrict,
    plan_id uuid not null references public.plans(id) on delete restrict,
    starts_on date not null,
    ends_on date,
    status public.subscription_status not null default 'active',
    remaining_uses integer not null default 0 check (remaining_uses >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (ends_on is null or ends_on >= starts_on)
);

create table if not exists public.payments (
    id uuid primary key default gen_random_uuid(),
    appointment_id uuid references public.appointments(id) on delete set null,
    subscription_id uuid references public.subscriptions(id) on delete set null,
    amount numeric(10,2) not null check (amount >= 0),
    method text,
    status public.payment_status not null default 'unpaid',
    paid_at timestamptz,
    external_reference text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.cash_movements (
    id uuid primary key default gen_random_uuid(),
    type public.movement_type not null,
    category text not null,
    description text not null,
    amount numeric(10,2) not null check (amount > 0),
    movement_date date not null default current_date,
    payment_method text,
    appointment_id uuid references public.appointments(id) on delete set null,
    created_by uuid references public.profiles(id) on delete set null default auth.uid(),
    created_at timestamptz not null default now()
);

create index if not exists appointments_starts_at_idx on public.appointments(starts_at);
create index if not exists appointments_customer_idx on public.appointments(customer_id);
create index if not exists appointments_status_idx on public.appointments(status);
create index if not exists blocked_periods_range_idx on public.blocked_periods using gist (tstzrange(starts_at, ends_at, '[)'));
create index if not exists customers_name_idx on public.customers using gin (to_tsvector('simple', name));
create index if not exists cash_movements_date_idx on public.cash_movements(movement_date);
create index if not exists subscriptions_customer_idx on public.subscriptions(customer_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at before update on public.settings
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services
for each row execute function public.set_updated_at();

drop trigger if exists business_hours_set_updated_at on public.business_hours;
create trigger business_hours_set_updated_at before update on public.business_hours
for each row execute function public.set_updated_at();

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at before update on public.appointments
for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at before update on public.plans
for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at before update on public.payments
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, full_name, email, role)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'full_name', ''),
        new.email,
        'customer'
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.settings (
    business_name,
    barber_name,
    address,
    map_url,
    timezone,
    accepting_bookings,
    store_enabled
)
values (
    'Barbearia du Amigo',
    'Duin',
    'R. Santa Clara de Assis, nº 20 - Minaslândia, Belo Horizonte - MG, 31810-340',
    'https://www.google.com/maps/search/?api=1&query=R.%20Santa%20Clara%20de%20Assis%2C%2020%20-%20Minasl%C3%A2ndia%2C%20Belo%20Horizonte%20-%20MG%2C%2031810-340',
    'America/Sao_Paulo',
    true,
    true
)
on conflict (singleton) do nothing;

insert into public.business_hours (weekday, is_open)
select weekday, false
from generate_series(0, 6) as weekday
on conflict (weekday) do nothing;

commit;
