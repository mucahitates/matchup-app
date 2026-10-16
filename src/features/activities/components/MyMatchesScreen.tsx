import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

type ParticipantStatus = 'pending' | 'approved' | 'rejected' | 'waitlisted' | 'cancelled';

// activities_public view'ından çektiğimiz alanlar. status: iptal edilen
// maçları ayırt etmek için eklendi.
type Activity = {
  id: string;
  captain_id: string;
  title: string;
  district: string;
  scheduled_at: string;
  capacity: number;
  status: 'open' | 'full' | 'completed' | 'cancelled';
};

// Ekranda gösterilen satır: maç bilgisi + benim durumum + kaç oyuncuyu
// hâlâ puanlamadığım.
type MyMatch = Activity & {
  myStatus: ParticipantStatus;
  isCaptain: boolean;
  pendingRatings: number;
};

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

    // 1) Benim başvuru satırlarım. user_id filtresi açıkça yazılı:
    // RLS kaptan olduğum maçların başkalarına ait satırlarını da
    // gösterebilir, onlar bu listeye karışmasın.
    const { data: myRows, error: rowsError } = await supabase
      .from('activity_participants')
      .select('activity_id, status')
      .eq('user_id', userId);

    if (rowsError) {
      console.log('Başvurularım çekilirken hata:', rowsError.message);
      return;
    }

    // Reddedilen ve kendi iptal ettiğim maçlar listelenmez.
    const relevant = (myRows ?? []).filter(
      (r) => r.status !== 'rejected' && r.status !== 'cancelled'
    );

    if (relevant.length === 0) {
      setMatches([]);
      return;
    }

    // 2) Bu maçların bilgileri (ham tabloda adres yetkimiz yok, view kullanıyoruz).
    const ids = relevant.map((r) => r.activity_id);
    const { data: activities, error: activitiesError } = await supabase
      .from('activities_public')
      .select('id, captain_id, title, district, scheduled_at, capacity, status')
      .in('id', ids);

    if (activitiesError) {
      console.log('Maçlar çekilirken hata:', activitiesError.message);
      return;
    }

    // 3) Puanlanmayı bekleyen oyuncu sayıları (my_pending_ratings view'ı).
    // Hata olursa listeyi yine de gösteriyoruz, sadece rozetler görünmez.
    const { data: pendingRows, error: pendingError } = await supabase
      .from('my_pending_ratings')
      .select('activity_id, pending_count');

    if (pendingError) {
      console.log('Bekleyen puanlar çekilirken hata:', pendingError.message);
    }
    const pendingByActivity = new Map(
      (pendingRows ?? []).map((p) => [p.activity_id as string, p.pending_count as number])
    );

    // 4) Üç sonucu birleştir.
    const statusByActivity = new Map(
      relevant.map((r) => [r.activity_id, r.status as ParticipantStatus])
    );

    const merged: MyMatch[] = (activities ?? []).map((a) => ({
      ...a,
      myStatus: statusByActivity.get(a.id)!,
      isCaptain: a.captain_id === userId,
      pendingRatings: pendingByActivity.get(a.id) ?? 0,
    }));

    setMatches(merged);
  }, []);

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
  // İptal edilen maçlar diğer bölümlere girmez, kendi bölümünde görünür.
  // ---------------------------------------------------------------
  const now = new Date();
  const isPast = (m: MyMatch) => new Date(m.scheduled_at) < now;
  const isCancelled = (m: MyMatch) => m.status === 'cancelled';
  const byDateAsc = (a: MyMatch, b: MyMatch) => a.scheduled_at.localeCompare(b.scheduled_at);
  const byDateDesc = (a: MyMatch, b: MyMatch) => b.scheduled_at.localeCompare(a.scheduled_at);

  const upcoming = matches
    .filter((m) => m.myStatus === 'approved' && !isPast(m) && !isCancelled(m))
    .sort(byDateAsc);

  const applications = matches
    .filter((m) => (m.myStatus === 'pending' || m.myStatus === 'waitlisted') && !isPast(m) && !isCancelled(m))
    .sort(byDateAsc);

  const past = matches
    .filter((m) => m.myStatus === 'approved' && isPast(m) && !isCancelled(m))
    .sort(byDateDesc);

  // İptal edilenler: sadece tarihi gelmemiş olanlar. Tarih geçince
  // listeden kendiliğinden düşer, liste sonsuza kadar büyümez.
  const cancelled = matches.filter((m) => isCancelled(m) && !isPast(m)).sort(byDateAsc);

  // Puanlamayı bekleyen maç sayısı (üstteki uyarı için).
  const toRateCount = past.filter((m) => m.pendingRatings > 0).length;

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

        {isCancelled(m) ? (
          <ThemedText type="small" style={styles.cancelledText}>🚫 İptal edildi</ThemedText>
        ) : (
          // Kaptan için durum yazmıyoruz ("Onaylandın" demek anlamsız).
          !m.isCaptain && (
            <ThemedText type="small" style={styles.statusText}>{STATUS_LABELS[m.myStatus]}</ThemedText>
          )
        )}

        {/* Puanlama rozeti: sadece 7 günlük pencere içindeki maçlarda gelir */}
        {m.pendingRatings > 0 && (
          <ThemedText type="smallBold" style={styles.rateBadge}>
            ⭐ {m.pendingRatings} oyuncuyu puanla
          </ThemedText>
        )}
      </TouchableOpacity>
    );
  }

  const isEmpty =
    upcoming.length === 0 && applications.length === 0 && past.length === 0 && cancelled.length === 0;

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

          {/* Kullanıcı puanlama fırsatını kaçırmasın: üstte tek satırlık uyarı */}
          {toRateCount > 0 && (
            <ThemedView style={styles.banner}>
              <ThemedText type="small" style={styles.bannerText}>
                ⭐ {toRateCount} maçta puanlamayı bekleyen oyuncular var. Puanlama maçtan sonra 7 gün açık.
              </ThemedText>
            </ThemedView>
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

          {cancelled.length > 0 && (
            <>
              <ThemedText type="smallBold" style={styles.sectionTitle}>İptal edilenler</ThemedText>
              {cancelled.map(renderMatch)}
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
  cancelledText: { marginTop: 4, color: '#B3452E', fontWeight: '600' },
  rateBadge: { marginTop: 6, color: '#2F5233' },
  banner: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerText: { color: '#2F5233' },
  empty: { marginTop: 24 },
});