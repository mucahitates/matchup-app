-- ============================================
-- MatchUp veritabanı şeması
-- Her blok, Supabase SQL Editor'de test edildikten sonra
-- buraya kaydediliyor (kayıt altında tutmak ve projeyi
-- başka bir ortamda yeniden kurabilmek için).
-- ============================================


-- ============================================
-- 1) SPORTS: sabit referans listesi (futbol, basketbol vs.)
-- ============================================
create table sports (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('team', 'individual')),
  min_players int not null,
  max_players int not null
);

insert into sports (name, category, min_players, max_players) values
  ('Halısaha (5v5)', 'team', 10, 14),
  ('Basketbol', 'team', 6, 10),
  ('Voleybol', 'team', 8, 12),
  ('Tenis (Tekli)', 'individual', 2, 2),
  ('Tenis (Çiftli)', 'individual', 4, 4),
  ('Padel', 'individual', 4, 4),
  ('Masa Tenisi', 'individual', 2, 2);


-- ============================================
-- 2) PROFILES: auth.users'ı genişletir, uygulamaya özel
-- bilgileri tutar. Telefon numarası burada YOK (mahremiyet
-- kararı) - o sadece Supabase'in auth.users tablosunda kalıyor.
-- ============================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_url text,
  bio text,
  city text default 'İstanbul',
  created_at timestamptz default now()
);

-- Oyuncu kiralama özelliği (basit versiyon):
-- Fiyat sadece bilgi amaçlı, gerçek ödeme uygulama dışında.
alter table profiles
  add column available_for_hire boolean not null default false,
  add column hire_price numeric(10,2);


-- ============================================
-- 3) ACTIVITIES: kaptanın açtığı aktiviteler.
-- district = herkese açık (bölge/mahalle bilgisi)
-- full_address = veritabanında her zaman dolu, ama erişimi
-- activities_public view'ı ile kısıtlanıyor (aşağıda).
-- ============================================
create table activities (
  id uuid primary key default gen_random_uuid(),
  captain_id uuid not null references profiles(id) on delete cascade,
  sport_id uuid not null references sports(id),
  title text not null,
  description text,
  district text not null,
  full_address text not null,
  scheduled_at timestamptz not null,
  capacity int not null check (capacity > 0),
  price_per_person numeric(10,2),
  status text not null default 'open' check (status in ('open', 'full', 'completed', 'cancelled')),
  created_at timestamptz default now()
);


-- ============================================
-- 4) ACTIVITY_PARTICIPANTS: başvuru / onay / waitlist / takım ataması.
-- ============================================
create table activity_participants (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'waitlisted', 'cancelled')),
  team text check (team in ('A', 'B')),
  applied_at timestamptz default now(),

  unique (activity_id, user_id)
);


-- ============================================
-- OTOMASYON 1: Waitlist
-- Bir başvuru geldiğinde, kontenjan zaten doluysa (onaylı sayısı
-- >= capacity), yeni başvuruyu otomatik olarak 'waitlisted' yap.
-- ============================================
create function fn_apply_or_waitlist()
returns trigger as $$
declare
  v_capacity int;
  v_approved_count int;
begin
  select capacity into v_capacity from activities where id = new.activity_id;

  select count(*) into v_approved_count
    from activity_participants
    where activity_id = new.activity_id and status = 'approved';

  if v_approved_count >= v_capacity then
    new.status := 'waitlisted';
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_apply_or_waitlist
  before insert on activity_participants
  for each row execute function fn_apply_or_waitlist();


-- ============================================
-- OTOMASYON 2: Waitlist terfisi
-- Onaylı bir katılımcı iptal ederse veya reddedilirse, waitlist'teki
-- en eski başvuran kişi otomatik olarak onaylanır.
-- ============================================
create function fn_promote_waitlist()
returns trigger as $$
declare
  v_next_id uuid;
begin
  if old.status = 'approved' and new.status in ('cancelled', 'rejected') then
    select id into v_next_id
      from activity_participants
      where activity_id = old.activity_id and status = 'waitlisted'
      order by applied_at asc
      limit 1;

    if v_next_id is not null then
      update activity_participants set status = 'approved'
        where id = v_next_id;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_promote_waitlist
  after update on activity_participants
  for each row execute function fn_promote_waitlist();


-- ============================================
-- OTOMASYON 3: Otomatik rastgele takım oluşturma
-- Takım sporlarında (sports.category = 'team') kontenjan tam
-- dolunca, onaylı katılımcılar rastgele iki takıma (A/B) bölünür.
-- ============================================
create function fn_assign_teams()
returns trigger as $$
declare
  v_capacity int;
  v_category text;
  v_approved_count int;
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then

    select a.capacity, s.category into v_capacity, v_category
      from activities a
      join sports s on s.id = a.sport_id
      where a.id = new.activity_id;

    select count(*) into v_approved_count
      from activity_participants
      where activity_id = new.activity_id and status = 'approved';

    if v_category = 'team' and v_approved_count >= v_capacity then
      with shuffled as (
        select id, ntile(2) over (order by random()) as grp
        from activity_participants
        where activity_id = new.activity_id and status = 'approved'
      )
      update activity_participants ap
      set team = case when s.grp = 1 then 'A' else 'B' end
      from shuffled s
      where ap.id = s.id;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_assign_teams
  after update on activity_participants
  for each row execute function fn_assign_teams();


-- ============================================
-- RLS (ROW LEVEL SECURITY) - tüm tablolar için eksiksiz
-- ============================================

-- SPORTS: herkes okuyabilir, kimse yazamaz (sabit liste)
alter table sports enable row level security;
create policy "sports_select_all" on sports for select using (true);

-- PROFILES: herkes okuyabilir, sadece kendi profilini günceller
alter table profiles enable row level security;
create policy "profiles_select_all" on profiles for select using (true);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- Kayıt olunca profili OTOMATİK oluşturan mekanizma:
-- auth.users tablosuna yeni bir kullanıcı eklendiğinde (SMS doğrulama
-- tamamlandığında), bu trigger devreye girip profiles tablosunda
-- karşılık gelen satırı kendisi açar.
create function fn_create_profile_for_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.phone, 'Yeni Kullanıcı'));
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_create_profile_for_new_user
  after insert on auth.users
  for each row execute function fn_create_profile_for_new_user();

-- ACTIVITIES: herkes okuyabilir, sadece kaptan yazabilir/değiştirebilir
alter table activities enable row level security;
create policy "activities_select_all" on activities for select using (true);
create policy "activities_insert_own" on activities for insert with check (auth.uid() = captain_id);
create policy "activities_update_captain" on activities for update using (auth.uid() = captain_id);
create policy "activities_delete_captain" on activities for delete using (auth.uid() = captain_id);

-- ADRES GİZLİLİĞİ view'ı: full_address sadece kaptan veya onaylı
-- katılımcı için dolu gelir, aksi halde null. Uygulama artık ham
-- 'activities' yerine bu view'ı sorgulamalı.
create view activities_public as
select
  a.id, a.captain_id, a.sport_id, a.title, a.description,
  a.district, a.scheduled_at, a.capacity, a.price_per_person,
  a.status, a.created_at,
  case
    when auth.uid() = a.captain_id then a.full_address
    when exists (
      select 1 from activity_participants p
      where p.activity_id = a.id and p.user_id = auth.uid() and p.status = 'approved'
    ) then a.full_address
    else null
  end as full_address
from activities a;

-- View'lar RLS'ten ayrı olarak erişim izni (GRANT) gerektirir -
-- RLS "hangi satırı görebilirsin", GRANT "bu view'a erişimin var mı" sorusu.
grant select on activities_public to anon, authenticated;

-- ACTIVITY_PARTICIPANTS: kullanıcı kendi başvurusunu, kaptan kendi
-- aktivitesinin tüm başvurularını görebilir; kullanıcı kendi adına
-- başvurabilir/iptal edebilir, kaptan onaylayıp/reddedebilir.
alter table activity_participants enable row level security;
create policy "participants_select" on activity_participants for select
  using (
    auth.uid() = user_id
    or auth.uid() in (select captain_id from activities where id = activity_id)
  );
create policy "participants_insert_own" on activity_participants for insert with check (auth.uid() = user_id);
create policy "participants_update" on activity_participants for update
  using (
    auth.uid() = user_id
    or auth.uid() in (select captain_id from activities where id = activity_id)
  );