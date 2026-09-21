-- ============================================
-- MatchUp veritabanı şeması
-- Her tablo, Supabase SQL Editor'de test edildikten
-- sonra buraya kaydediliyor (kayıt altında tutmak için).
-- ============================================

-- SPORTS: sabit referans listesi (futbol, basketbol vs.)
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

  
-- PROFILES: auth.users'ı genişletir, uygulamaya özel bilgileri tutar.
-- Telefon numarası burada YOK (mahremiyet kararı) - o sadece
-- Supabase'in kendi auth.users tablosunda kalıyor.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_url text,
  bio text,
  city text default 'İstanbul',
  created_at timestamptz default now()
);


-- ACTIVITIES: kaptanın açtığı aktiviteler.
-- district = herkese açık (bölge/mahalle bilgisi)
-- full_address = veritabanında her zaman dolu, ama erişimi RLS ile
-- kısıtlayacağız (sadece onaylı katılımcı/kaptan görebilecek) - bu
-- kısıtlamayı henüz yazmadık, sırası 5. adımda gelecek.
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