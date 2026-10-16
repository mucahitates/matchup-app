-- ============================================================
-- MatchUp veritabanı şeması
--
-- KULLANIM: BOŞ bir Supabase projesinde, SQL Editor'de tek seferde
-- çalıştırılınca tüm veritabanını kurar. Zaten kurulu bir veritabanında
-- tekrar çalıştırma ("already exists" hatası verir). Canlı veritabanında
-- değişiklik gerekirse ayrı küçük bir SQL çalıştır ve aynı değişikliği
-- BURAYA da işle, dosya her zaman gerçeği yansıtsın.
--
-- Düzen:
--   1) Tablolar                        2) Başlangıç verileri
--   3) Fonksiyonlar ve trigger'lar     4) RLS kuralları
--   5) Adres gizliliği view'ı          6) GRANT'ler
-- ============================================================


-- ============================================================
-- 1) TABLOLAR
-- ============================================================

-- Referans listeleri: kodda sabit tutmak yerine veritabanında.
-- Yeni spor/bölge/ülke eklemek uygulama güncellemesi gerektirmez.
create table sports (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('team', 'individual')),
  min_players int not null,
  max_players int not null
);

create table districts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null default 'İstanbul',
  unique (name, city)
);

-- Telefon girişindeki ülke kodu seçici için.
create table countries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  flag text not null,
  name text not null,
  sort_order int not null default 0
);

-- PROFILES: Supabase'in auth.users tablosunu genişletir.
-- Telefon numarası burada YOK (mahremiyet kararı), sadece auth.users'ta kalır.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_url text,
  bio text,
  city text default 'İstanbul',
  -- Oyuncu kiralama (basit versiyon): fiyat sadece bilgi amaçlı,
  -- gerçek ödeme uygulama dışında.
  available_for_hire boolean not null default false,
  hire_price numeric(10,2),
  -- false iken kullanıcı onboarding (isim) ekranına yönlendirilir.
  profile_completed boolean not null default false,
  created_at timestamptz default now(),
  -- İsim kuralı veritabanında: uygulama atlansa bile geçersiz isim girilemez.
  constraint profiles_full_name_length
    check (char_length(btrim(full_name)) between 2 and 40),
  constraint profiles_bio_length
    check (bio is null or char_length(bio) <= 200),
);

-- ACTIVITIES: kaptanın açtığı aktiviteler.
-- district herkese açıktır. full_address SADECE activities_public view'ı
-- üzerinden (kaptan/onaylı katılımcıya) görünür, bkz. bölüm 5 ve 6.
create table activities (
  id uuid primary key default gen_random_uuid(),
  captain_id uuid not null references profiles(id) on delete cascade,
  sport_id uuid not null references sports(id),
  title text not null,
  description text,
  district text not null,
  full_address text not null,
  scheduled_at timestamptz not null,
  -- Toplam kişi sayısı, KAPTAN DAHİL.
  capacity int not null check (capacity > 0),
  -- Sadece bilgi amaçlı, uygulama içinde tahsilat yok.
  price_per_person numeric(10,2),
  status text not null default 'open'
    check (status in ('open', 'full', 'completed', 'cancelled')),
  created_at timestamptz default now()
);

-- ACTIVITY_PARTICIPANTS: başvuru / onay / bekleme listesi / takım.
-- Kaptan da burada 'approved' bir satırdır (otomatik eklenir).
create table activity_participants (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'waitlisted', 'cancelled')),
  team text check (team in ('A', 'B')),
  applied_at timestamptz default now(),
  unique (activity_id, user_id)
);


-- ============================================================
-- 2) BAŞLANGIÇ VERİLERİ
-- ============================================================
insert into sports (name, category, min_players, max_players) values
  ('Halısaha (5v5)', 'team', 10, 14),
  ('Basketbol', 'team', 6, 10),
  ('Voleybol', 'team', 8, 12),
  ('Tenis (Tekli)', 'individual', 2, 2),
  ('Tenis (Çiftli)', 'individual', 4, 4),
  ('Padel', 'individual', 4, 4),
  ('Masa Tenisi', 'individual', 2, 2);

insert into districts (name, city) values
  ('Kadıköy', 'İstanbul'),
  ('Şişli', 'İstanbul'),
  ('Beşiktaş', 'İstanbul'),
  ('Üsküdar', 'İstanbul'),
  ('Ataşehir', 'İstanbul'),
  ('Bakırköy', 'İstanbul');

insert into countries (code, flag, name, sort_order) values
  ('+90', '🇹🇷', 'Türkiye', 1),
  ('+1', '🇺🇸', 'ABD', 2),
  ('+44', '🇬🇧', 'İngiltere', 3),
  ('+49', '🇩🇪', 'Almanya', 4);


-- ============================================================
-- 3) FONKSİYONLAR VE TRIGGER'LAR (otomasyonlar)
--
-- "security definer" = fonksiyon, onu tetikleyen kullanıcının değil
-- tablo sahibinin yetkisiyle çalışır. Gereken yerlerde şart: örneğin
-- B maçtan ayrılınca terfi edecek C'nin satırı B'ye ait değil, RLS
-- güncellemeyi sessizce yok sayardı. search_path sabitlemek güvenlik içindir.
-- ============================================================

-- 3.1) Yeni kullanıcı kaydolunca profilini otomatik aç.
-- Telefon numarası KOPYALANMAZ, gerçek isim onboarding ekranında alınır.
create function fn_create_profile_for_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, 'Yeni Kullanıcı');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_create_profile_for_new_user
  after insert on auth.users
  for each row execute function fn_create_profile_for_new_user();


-- 3.2) Aktivite açılınca kaptanı otomatik 'approved' katılımcı yap.
-- Sayaç kaptanı da sayar (1/4 ile başlar), takım ataması kaptanı da kapsar.
create function fn_add_captain_as_participant()
returns trigger as $$
begin
  insert into public.activity_participants (activity_id, user_id, status)
  values (new.id, new.captain_id, 'approved');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_add_captain_as_participant
  after insert on activities
  for each row execute function fn_add_captain_as_participant();


-- 3.3) Başvuru eklenirken: durumu SUNUCU belirler.
-- İstemci ne gönderirse göndersin başvuru 'pending' başlar, takım boştur.
-- Kontenjan doluysa 'waitlisted'. Böylece kimse kendini 'approved' ekleyemez.
create function fn_apply_or_waitlist()
returns trigger as $$
declare
  v_captain_id uuid;
  v_capacity int;
  v_status text;
  v_scheduled_at timestamptz;
  v_approved_count int;
begin
  select captain_id, capacity, status, scheduled_at
    into v_captain_id, v_capacity, v_status, v_scheduled_at
    from activities where id = new.activity_id;

  -- Kaptanın kendi satırı sistem tarafından eklenir, ona dokunma.
  if new.user_id = v_captain_id then
    return new;
  end if;

  if v_status in ('completed', 'cancelled') then
    raise exception 'Bu aktivite artık başvuru kabul etmiyor.';
  end if;

  if v_scheduled_at < now() then
    raise exception 'Bu maçın tarihi geçti, başvuru yapılamaz.';
  end if;

  new.status := 'pending';
  new.team := null;

  select count(*) into v_approved_count
    from activity_participants
    where activity_id = new.activity_id and status = 'approved';

  if v_approved_count >= v_capacity then
    new.status := 'waitlisted';
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_enforce_capacity_on_approval
  before update on activity_participants
  for each row execute function fn_enforce_capacity_on_approval();


-- 3.5) Durum geçişi koruması: uygulamadan gelen güncellemeler sadece
-- izin verilen geçişlerden biri olabilir.
--   Kaptan    : pending -> approved/rejected, waitlisted/approved -> rejected
--   Katılımcı : kendi satırını sadece 'cancelled' yapabilir
--   Kimse     : takım, kullanıcı ve aktivite alanını elle değiştiremez
-- İstisnalar:
--   pg_trigger_depth() > 1 : başka bir trigger'ın yaptığı güncellemeler
--                            (terfi, takım ataması, doluluk senkronu)
--   auth.uid() boş         : SQL Editor / sunucu tarafı işlemleri
create function fn_guard_participant_update()
returns trigger as $$
declare
  v_captain_id uuid;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return new;
  end if;

  if new.user_id <> old.user_id
     or new.activity_id <> old.activity_id
     or new.team is distinct from old.team then
    raise exception 'Bu alanlar değiştirilemez.';
  end if;

  select captain_id into v_captain_id from activities where id = old.activity_id;

  if old.user_id = v_captain_id then
    raise exception 'Kaptanın katılımı değiştirilemez.';
  end if;

  if auth.uid() = v_captain_id then
    if not (
      (old.status = 'pending' and new.status in ('approved', 'rejected'))
      or (old.status in ('waitlisted', 'approved') and new.status = 'rejected')
    ) then
      raise exception 'Kaptan bu durum değişikliğini yapamaz.';
    end if;
  elsif auth.uid() = old.user_id then
    if new.status <> 'cancelled'
       or old.status not in ('pending', 'waitlisted', 'approved') then
      raise exception 'Sadece başvurunu iptal edebilirsin.';
    end if;
  else
    raise exception 'Yetkisiz işlem.';
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_guard_participant_update
  before update on activity_participants
  for each row execute function fn_guard_participant_update();


-- 3.6) Waitlist terfisi: onaylı biri iptal olur/reddedilirse, bekleme
-- listesindeki EN ESKİ başvuran otomatik onaylanır.
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
$$ language plpgsql security definer set search_path = public;

create trigger trg_promote_waitlist
  after update on activity_participants
  for each row execute function fn_promote_waitlist();


-- 3.7) Otomatik rastgele takım: takım sporlarında (sports.category =
-- 'team') kontenjan dolunca onaylı herkes (kaptan dahil) rastgele ikiye bölünür.
create function fn_assign_teams()
returns trigger as $$
declare
  v_capacity int;
  v_category text;
  v_approved_count int;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
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
$$ language plpgsql security definer set search_path = public;

create trigger trg_assign_teams
  after update on activity_participants
  for each row execute function fn_assign_teams();


-- 3.8) Doluluk senkronu: onaylı sayısı kontenjana ulaşınca aktivite 'full'
-- olur ve bekleyen (pending) başvurular otomatik 'waitlisted' olur.
-- Yer açılınca aktivite tekrar 'open' olur.
-- security definer şart: aktiviteyi güncelleme yetkisi sadece kaptanda,
-- ama bu işlemi başvuran/ayrılan kullanıcı tetikliyor.
create function fn_sync_activity_fullness()
returns trigger as $$
declare
  v_activity_id uuid;
  v_capacity int;
  v_status text;
  v_approved_count int;
begin
  v_activity_id := coalesce(new.activity_id, old.activity_id);

  select capacity, status into v_capacity, v_status
    from activities where id = v_activity_id;

  select count(*) into v_approved_count
    from activity_participants
    where activity_id = v_activity_id and status = 'approved';

  if v_status = 'open' and v_approved_count >= v_capacity then
    update activities set status = 'full' where id = v_activity_id;
    update activity_participants set status = 'waitlisted'
      where activity_id = v_activity_id and status = 'pending';
  elsif v_status = 'full' and v_approved_count < v_capacity then
    update activities set status = 'open' where id = v_activity_id;
  end if;

  return null;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_sync_activity_fullness
  after insert or update on activity_participants
  for each row execute function fn_sync_activity_fullness();


-- ============================================================
-- 4) RLS: hangi SATIRI görebilir/değiştirebilirsin
-- ============================================================
alter table sports enable row level security;
alter table districts enable row level security;
alter table countries enable row level security;
alter table profiles enable row level security;
alter table activities enable row level security;
alter table activity_participants enable row level security;

-- Referans listeleri: herkes okur, kimse yazamaz.
create policy "sports_select_all" on sports for select using (true);
create policy "districts_select_all" on districts for select using (true);
create policy "countries_select_all" on countries for select using (true);

-- Profiller: herkes okur (isimler zaten herkese açık), sadece kendini günceller.
create policy "profiles_select_all" on profiles for select using (true);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- Aktiviteler: satır seviyesinde herkes okuyabilir. Hassas kolon
-- (full_address) satır kuralıyla değil KOLON YETKİSİYLE korunur (bölüm 6),
-- uygulama aktiviteleri activities_public view'ından okur.
create policy "activities_select_all" on activities for select using (true);
create policy "activities_insert_own" on activities for insert
  with check (auth.uid() = captain_id);
create policy "activities_update_captain" on activities for update
  using (auth.uid() = captain_id);
create policy "activities_delete_captain" on activities for delete
  using (auth.uid() = captain_id);

-- Katılımcılar: herkes ONAYLILARI görür (sayaç ve liste için).
-- pending/waitlisted/rejected/cancelled sadece sahibi ve kaptan tarafından görülür.
-- Postgres'te birden fazla select kuralı OR ile birleşir.
create policy "participants_select_approved_public" on activity_participants
  for select using (status = 'approved');
create policy "participants_select" on activity_participants for select
  using (
    auth.uid() = user_id
    or auth.uid() in (select captain_id from activities where id = activity_id)
  );
create policy "participants_insert_own" on activity_participants for insert
  with check (auth.uid() = user_id);
create policy "participants_update" on activity_participants for update
  using (
    auth.uid() = user_id
    or auth.uid() in (select captain_id from activities where id = activity_id)
  );


-- ============================================================
-- 5) ADRES GİZLİLİĞİ VIEW'I
-- full_address sadece kaptana ve onaylı katılımcıya dolu gelir, diğerlerine
-- null. View, sahibinin yetkisiyle çalışır (bilerek: activities tablosundaki
-- kolon kısıtını aşabilsin), kimin ne göreceğini auth.uid() belirler.
-- Uygulama aktiviteleri HER ZAMAN bu view'dan okumalı.
-- ============================================================
create view activities_public as
select
  a.id, a.captain_id, a.sport_id, a.title, a.description,
  a.district, a.scheduled_at, a.capacity, a.price_per_person,
  a.status, a.created_at,
  case
    when auth.uid() = a.captain_id then a.full_address
    when exists (
      select 1 from activity_participants p
      where p.activity_id = a.id
        and p.user_id = auth.uid()
        and p.status = 'approved'
    ) then a.full_address
    else null
  end as full_address
from activities a;


-- ============================================================
-- 6) GRANT'ler
-- RLS "hangi satırı görebilirsin", GRANT "buna hiç erişimin var mı".
-- Projede "Automatically expose new tables" bilerek kapalı, tüm erişim
-- burada elle verilir. İkisi de olmazsa erişim yoktur.
-- ============================================================
grant select on sports, districts, countries to anon, authenticated;
grant select on activities_public to anon, authenticated;

grant select on profiles to anon;
grant select, insert, update, delete on profiles to authenticated;

-- activities: full_address kolonunu BİLEREK dışarıda bırakıyoruz.
-- authenticated sadece diğer kolonları okuyabilir. RLS kurallarının ve
-- trigger'ların ihtiyaç duyduğu kolonlar (id, captain_id, capacity,
-- status) listede. anon'a hiç okuma izni yok, o view'ı kullanır.
grant select (id, captain_id, sport_id, title, description, district,
              scheduled_at, capacity, price_per_person, status, created_at)
  on activities to authenticated;
grant insert, update, delete on activities to authenticated;

grant select, insert, update on activity_participants to authenticated;



/*
Canlı veritabanı için tek seferlik SQL

Dosyanın tamamını canlı veritabanında çalıştırma, tablolar zaten var. Dosya sıfırdan kurulum içindir. Canlıda sadece 1. maddedeki adres deliğini kapatmak için şunu çalıştır:

revoke select on activities from anon, authenticated;

grant select (id, captain_id, sport_id, title, description, district,
              scheduled_at, capacity, price_per_person, status, created_at)
  on activities to authenticated;

Sonra doğrulama:

select
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'profiles'
            and column_name = 'profile_completed')                              as onboarding_sql_calisti,
  has_column_privilege('anon', 'public.activities', 'full_address', 'select')          as anon_adres_okuyabilir,
  has_column_privilege('authenticated', 'public.activities', 'full_address', 'select') as auth_adres_okuyabilir,
  has_column_privilege('authenticated', 'public.activities', 'captain_id', 'select')   as auth_captain_id_okuyabilir;
*/