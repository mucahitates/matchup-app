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


-- ACTIVITY_PARTICIPANTS: başvuru / onay / waitlist / takım ataması.
-- Otomasyon (waitlist'e otomatik düşme, takımların otomatik oluşması)
-- HENÜZ YOK - bu sade tablo, otomasyonu ayrı bir adımda (trigger'larla)
-- ekleyeceğiz, ikisini karıştırmamak için.
create table activity_participants (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'waitlisted', 'cancelled')),
  team text check (team in ('A', 'B')),
  applied_at timestamptz default now(),

  unique (activity_id, user_id)
);


-- Oyuncu kiralama özelliği (basit versiyon - Seçenek A):
-- Fiyat sadece bilgi amaçlı, gerçek ödeme uygulama dışında.
-- Kaptanlar bu alanlara göre "kiralanabilir" oyuncuları arayıp
-- davet edebilecek (arama ekranı ayrı bir aşamada eklenecek).
alter table profiles
  add column available_for_hire boolean not null default false,
  add column hire_price numeric(10,2);



-- OTOMASYON 1: Waitlist
-- Bir başvuru geldiğinde, kontenjan zaten doluysa (onaylı sayısı >=
-- capacity), yeni başvuruyu otomatik olarak 'waitlisted' yap.
-- Test edildi: kapasitesi 2 olan bir aktivitede, 2 kişi onaylandıktan
-- sonra 3. başvuru otomatik waitlisted oldu.
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

  
-- OTOMASYON 2: Waitlist terfisi
-- Onaylı bir katılımcı iptal ederse veya reddedilirse, waitlist'teki
-- en eski başvuran kişi otomatik olarak onaylanır.
-- Test edildi: onaylı Mehmet iptal edince, waitlist'teki Ahmet
-- otomatik olarak approved oldu.
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


  
-- OTOMASYON 3: Otomatik rastgele takım oluşturma
-- Takım sporlarında (sports.category = 'team') kontenjan tam dolunca,
-- onaylı katılımcılar rastgele iki takıma (A/B) bölünür.
-- Test edildi: 2 kişilik basketbol aktivitesinde, 2. onaydan hemen
-- sonra her iki katılımcıya da otomatik A/B takımı atandı.
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

