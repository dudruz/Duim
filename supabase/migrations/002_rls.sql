begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and active = true
          and role in ('admin', 'barber')
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.business_hours enable row level security;
alter table public.blocked_periods enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.products enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.cash_movements enable row level security;

drop policy if exists "Public read settings" on public.settings;
create policy "Public read settings"
on public.settings for select
to anon, authenticated
using (true);

drop policy if exists "Public read active services" on public.services;
create policy "Public read active services"
on public.services for select
to anon, authenticated
using (active = true);

drop policy if exists "Public read business hours" on public.business_hours;
create policy "Public read business hours"
on public.business_hours for select
to anon, authenticated
using (true);

drop policy if exists "Public read active products" on public.products;
create policy "Public read active products"
on public.products for select
to anon, authenticated
using (
    active = true
    and stock_status <> 'hidden'
    and exists (
        select 1 from public.settings s where s.store_enabled = true
    )
);

drop policy if exists "Profiles read own or admin" on public.profiles;
create policy "Profiles read own or admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "Profiles update own or admin" on public.profiles;
create policy "Profiles update own or admin"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'settings',
        'services',
        'business_hours',
        'blocked_periods',
        'customers',
        'appointments',
        'products',
        'plans',
        'subscriptions',
        'payments',
        'cash_movements'
    ]
    loop
        execute format('drop policy if exists "Admin full access" on public.%I', table_name);
        execute format(
            'create policy "Admin full access" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
            table_name
        );
    end loop;
end $$;

commit;
