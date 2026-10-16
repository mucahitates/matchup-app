import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------
// TİPLER
// ---------------------------------------------------------------
type ParticipantStatus = 'pending' | 'approved' | 'rejected' | 'waitlisted' | 'cancelled';

// activities_public view'ından çektiğimiz alanlar.
type Activity = {
  id: string;
  captain_id: string;
  title: string;
  district: string;
  scheduled_at: string;
  capacity: number;
};

// Ekranda gösterilecek satır: maç bilgisi + benim o maçtaki durumum.
type MyMatch = Activity & {
  myStatus: ParticipantStatus;
  isCaptain: boolean;
};

// Veritabanı durum kodlarını ekranda gösterilecek metne çeviriyoruz
// (MatchDetailScreen'deki mantıkla aynı; ikisini ileride tek dosyaya
// taşıyabiliriz).
const STATUS_LABELS: Record<ParticipantStatus, string> = {
  pending: 'Kaptan onayı bekleniyor',
  approved: 'Onaylandın',
  waitlisted: 'Bekleme listesindesin',
  rejected: 'Reddedildi',
  cancelled: 'İptal ettin',
};

export default function MyMatchesScreen() {
  const [matches, setMatches] = useState<MyMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMatches = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;

    // 1) Benim başvuru satırlarım. RLS (participants_select) zaten
    // sadece kendi satırlarımı ve kaptan olduklarımın satırlarını döner,
    // o yüzden user_id filtresini de açıkça yazıyoruz: kaptan olduğum
    // maçlardaki başkalarının satırları bu listeye karışmasın.
    const { data: myRows, error: rowsError } = await supabase
      .from('activity_participants')
      .select('activity_id, status')
      .eq('user_id', userId);

    if (rowsError) {
      console.log('Başvurularım çekilirken hata:', rowsError.message);
      return;
    }

    // Reddedilen ve iptal ettiğim maçları listelemiyoruz (artık beni
    // ilgilendirmiyor). İleride istersek "arşiv" olarak ekleriz.
    const relevant = (myRows ?? []).filter(
      (r) => r.status !== 'rejected' && r.status !== 'cancelled'
    );

    if (relevant.length === 0) {
      setMatches([]);
      return;
    }

    // 2) Bu maçların bilgileri. activities_public kullanıyoruz, çünkü
    // ham activities tablosunda full_address okuma yetkimiz yok (bilerek).
    // Join yerine iki sorgu: view'lar üzerinde foreign key ilişkisi
    // olmadığı için PostgREST'in otomatik join'i çalışmaz.
    const ids = relevant.map((r) => r.activity_id);
    const { data: activities, error: activitiesError } = await supabase
      .from('activities_public')
      .select('id, captain_id, title, district, scheduled_at, capacity')
      .in('id', ids);

    if (activitiesError) {
      console.log('Maçlar çekilirken hata:', activitiesError.message);
      return;
    }

    // 3) İki sonucu birleştir: her maça benim durumumu ekle.
    const statusByActivity = new Map(relevant.map((r) => [r.activity_id, r.status as ParticipantStatus]));

    const merged: MyMatch[] = (activities ?? []).map((a) => ({
      ...a,
      myStatus: statusByActivity.get(a.id)!,
      isCaptain: a.captain_id === userId,
    }));

    setMatches(merged);
  }, []);

  // Sekmeye her dönüldüğünde yeniden çek (Discover'da öğrendiğimiz desen).
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadMatches().finally(() => setLoading(false));
    }, [loadMatches])
  );

  async function onRefresh() {
    setRefreshing(true);
    await loadMatches();
    setRefreshing(false);
  }

  // ---------------------------------------------------------------
  // BÖLÜMLERE AYIRMA
  // Tek bir listeyi, tarih ve duruma göre üç gruba bölüyoruz.
  // ---------------------------------------------------------------
  const now = new Date();
  const isPast = (m: MyMatch) => new Date(m.scheduled_at) < now;

  // Yaklaşan: onaylı (kaptan dahil) ve tarihi gelmemiş. En yakın tarih üstte.
  const upcoming = matches
    .filter((m) => m.myStatus === 'approved' && !isPast(m))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  // Başvurularım: henüz onaylanmamış (bekleyen ya da bekleme listesi), tarihi gelmemiş.
  const applications = matches
    .filter((m) => (m.myStatus === 'pending' || m.myStatus === 'waitlisted') && !isPast(m))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  // Geçmiş: katıldığım (onaylı) ve tarihi geçmiş. En yeni üstte.
  const past = matches
    .filter((m) => m.myStatus === 'approved' && isPast(m))
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  // Bir maç satırını çizen yardımcı fonksiyon. Üç bölümde de aynı
  // görünümü kullandığımız için tek yerde tanımlı.
  function renderMatch(m: MyMatch) {
    return (
      <TouchableOpacity
        key={m.id}
        style={styles.card}
        onPress={() => router.push(`/activity/${m.id}`)}>
        <ThemedText type="smallBold">
          {m.title}
          {m.isCaptain ? ' (kaptan)' : ''}
        </ThemedText>
        <ThemedText type="small">
          {m.district} · {new Date(m.scheduled_at).toLocaleString('tr-TR')}
        </ThemedText>
        {/* Kaptan için durum yazmıyoruz, anlamsız ("Onaylandın" demek garip). */}
        {!m.isCaptain && (
          <ThemedText type="small" style={styles.statusText}>
            {STATUS_LABELS[m.myStatus]}
          </ThemedText>
        )}
      </TouchableOpacity>
    );
  }

  const isEmpty = upcoming.length === 0 && applications.length === 0 && past.length === 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView>
        <ThemedText type="title">📅 Maçlarım</ThemedText>

        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {loading && <ThemedText>Yükleniyor…</ThemedText>}

          {!loading && isEmpty && (
            <ThemedText style={styles.empty}>
              Henüz bir maçın yok. Discover'dan bir maça başvur ya da Create ile kendi maçını aç.
            </ThemedText>
          )}

          {upcoming.length > 0 && (
            <>
              <ThemedText type="smallBold" style={styles.sectionTitle}>Yaklaşan maçlarım</ThemedText>
              {upcoming.map(renderMatch)}
            </>
          )}

          {applications.length > 0 && (
            <>
              <ThemedText type="smallBold" style={styles.sectionTitle}>Başvurularım</ThemedText>
              {applications.map(renderMatch)}
            </>
          )}

          {past.length > 0 && (
            <>
              <ThemedText type="smallBold" style={styles.sectionTitle}>Geçmiş maçlar</ThemedText>
              {past.map(renderMatch)}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  sectionTitle: { marginTop: 20, marginBottom: 8 },
  card: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusText: { marginTop: 4, color: '#D98E3E' },
  empty: { marginTop: 24 },
});