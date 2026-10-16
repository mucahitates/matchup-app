import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import RatePlayersSection from '@/features/activities/components/RatePlayersSection';
import { supabase } from '@/lib/supabase';

// YENİ: Puanlama penceresi (gün). Veritabanındaki kuralla
// (fn_validate_rating) AYNI olmak zorunda. Biri değişirse diğeri de değişmeli.
const RATING_WINDOW_DAYS = 7;

type Activity = {
  id: string;
  captain_id: string;
  title: string;
  district: string;
  full_address: string | null; // başkasıysa view'dan null gelir (adres gizliliği)
  scheduled_at: string;
  capacity: number;
  status: 'open' | 'full' | 'completed' | 'cancelled'; // YENİ
};

type ParticipantStatus = 'pending' | 'approved' | 'rejected' | 'waitlisted' | 'cancelled';

type Participant = {
  id: string;
  user_id: string;
  status: ParticipantStatus;
  team: 'A' | 'B' | null;
  profiles: { full_name: string } | null;
};

// Bir oyuncunun herkese açık puan özeti (player_stats view'ından).
type PlayerSummary = { rating_count: number; overall: number | null };

const STATUS_LABELS: Record<ParticipantStatus, string> = {
  pending: 'Kaptan onayı bekleniyor',
  approved: 'Onaylandın',
  waitlisted: 'Bekleme listesindesin',
  rejected: 'Başvurun reddedildi',
  cancelled: 'Başvurunu iptal ettin',
};

export default function MatchDetailScreen({ activityId }: { activityId: string }) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, PlayerSummary>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    setCurrentUserId(userData.user?.id ?? null);

    // activities_public view'ı: full_address sadece kaptan veya onaylı
    // katılımcı için dolu gelir, diğerleri için null.
    const { data: activityData, error: activityError } = await supabase
      .from('activities_public')
      .select('*')
      .eq('id', activityId)
      .single();

    if (activityError) {
      console.log('Aktivite çekilirken hata:', activityError.message);
    } else {
      setActivity(activityData);
    }

    const { data: participantsData, error: participantsError } = await supabase
      .from('activity_participants')
      .select('id, user_id, status, team, profiles(full_name)')
      .eq('activity_id', activityId)
      .order('applied_at', { ascending: true });

    if (participantsError) {
      console.log('Katılımcılar çekilirken hata:', participantsError.message);
      setLoading(false);
      return;
    }
    setParticipants(participantsData as any);

    // Görünen herkesin puan özetini tek sorguda çek.
    const ids = (participantsData ?? []).map((p: any) => p.user_id);
    if (ids.length > 0) {
      const { data: statsData, error: statsError } = await supabase
        .from('player_stats')
        .select('user_id, rating_count, overall')
        .in('user_id', ids);

      if (statsError) {
        console.log('Puan özetleri çekilirken hata:', statsError.message);
      } else {
        setSummaries(Object.fromEntries((statsData ?? []).map((s) => [s.user_id, s])));
      }
    }

    setLoading(false);
  }, [activityId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  // Hiç puan almamışsa bunu açıkça söylüyoruz: kaptan "yeni oyuncu" ile
  // "kötü puanlı oyuncu"yu karıştırmasın.
  function formatSummary(userId: string) {
    const s = summaries[userId];
    if (!s || s.rating_count === 0 || s.overall === null) return 'Henüz puan yok';
    return `⭐ ${s.overall} · ${s.rating_count} puan`;
  }

  async function applyToActivity() {
    if (!currentUserId) return;

    // Durumu biz yazmıyoruz: veritabanı trigger'ı her başvuruyu 'pending'
    // başlatır, kontenjan doluysa 'waitlisted' yapar.
    const { error } = await supabase.from('activity_participants').insert({
      activity_id: activityId,
      user_id: currentUserId,
    });

    if (error) Alert.alert('Hata', error.message);
    else loadData();
  }

  async function decideParticipant(participantId: string, newStatus: 'approved' | 'rejected') {
    const { error } = await supabase
      .from('activity_participants')
      .update({ status: newStatus })
      .eq('id', participantId);

    if (error) Alert.alert('Hata', error.message);
    else loadData();
  }

  function cancelMyParticipation(participantId: string, wasApproved: boolean) {
    Alert.alert(
      wasApproved ? 'Maçtan ayrıl' : 'Başvuruyu iptal et',
      'Emin misin? Bu işlem geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('activity_participants')
              .update({ status: 'cancelled' })
              .eq('id', participantId);

            if (error) Alert.alert('Hata', error.message);
            else loadData();
          },
        },
      ]
    );
  }

  // YENİ: Kaptan aktiviteyi iptal eder. Doğrudan tabloyu güncellemiyoruz
  // (kaptanın status yazma yetkisi yok), kuralları kontrol eden
  // cancel_activity fonksiyonunu çağırıyoruz.
  function confirmCancelActivity() {
    Alert.alert(
      'Aktiviteyi iptal et',
      'Tüm katılımcılar iptali görecek. Emin misin? Bu işlem geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Aktiviteyi İptal Et',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('cancel_activity', { p_activity_id: activityId });
            if (error) Alert.alert('Hata', error.message);
            else loadData();
          },
        },
      ]
    );
  }

  if (loading || !activity) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView edges={['bottom']}>
          <ThemedText>Yükleniyor…</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const isCaptain = currentUserId === activity.captain_id;
  const myParticipation = participants.find((p) => p.user_id === currentUserId);
  const approved = participants.filter((p) => p.status === 'approved');
  const waitlisted = participants.filter((p) => p.status === 'waitlisted');
  const pending = participants.filter((p) => p.status === 'pending');

  // ---------------------------------------------------------------
  // DURUM HESAPLARI. Bunlar sadece arayüzü temiz tutar, asıl kurallar
  // veritabanında zorunlu.
  // ---------------------------------------------------------------
  const isCancelled = activity.status === 'cancelled'; // YENİ
  const scheduled = new Date(activity.scheduled_at);
  const isPast = scheduled < new Date();

  // YENİ: puanlama penceresi = maç tarihi + 7 gün.
  const ratingDeadline = new Date(scheduled.getTime() + RATING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const ratingOpen = isPast && new Date() <= ratingDeadline;
  const iApproved = myParticipation?.status === 'approved';

  // Puanlama: iptal edilmemiş, pencere açık ve ben maçta onaylıyım.
  const canRate = !isCancelled && ratingOpen && iApproved && currentUserId !== null;
  // Katıldım ama süre dolmuş: neden puanlama göremediğimi söyle.
  const ratingClosed = !isCancelled && isPast && !ratingOpen && iApproved;

  const canCancel =
    !isCaptain &&
    !isPast &&
    !isCancelled &&
    myParticipation &&
    ['pending', 'waitlisted', 'approved'].includes(myParticipation.status);

  // YENİ: kaptan, tarihi gelmemiş ve iptal edilmemiş maçı iptal edebilir.
  const canCancelActivity = isCaptain && !isPast && !isCancelled;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['bottom']}>
        <ScrollView>
          <ThemedText type="title">{activity.title}</ThemedText>
          <ThemedText type="small" style={styles.meta}>
            {activity.district} · {scheduled.toLocaleString('tr-TR')}
            {isPast && !isCancelled ? ' · Maç oynandı' : ''}
          </ThemedText>

          {/* YENİ: iptal edilmiş maçta herkes bunu en üstte görür */}
          {isCancelled && (
            <ThemedView style={styles.cancelBanner}>
              <ThemedText type="smallBold" style={styles.cancelBannerText}>
                🚫 Bu aktivite kaptan tarafından iptal edildi.
              </ThemedText>
            </ThemedView>
          )}

          <ThemedText type="smallBold" style={styles.progress}>
            {approved.length}/{activity.capacity} katıldı
            {isCaptain && waitlisted.length > 0 ? ` · ${waitlisted.length} sırada` : ''}
          </ThemedText>

          <ThemedView style={styles.addressBox}>
            {activity.full_address ? (
              <ThemedText type="small">📍 {activity.full_address}</ThemedText>
            ) : (
              <ThemedText type="small">🔒 Tam adres, onaylandığında görünecek</ThemedText>
            )}
          </ThemedView>

          {/* Başvuru: kaptan değilsem, başvurmadıysam, maç oynanmadıysa ve iptal değilse */}
          {!isCaptain && !myParticipation && !isPast && !isCancelled && (
            <TouchableOpacity style={styles.applyButton} onPress={applyToActivity}>
              <ThemedText style={styles.applyButtonText}>
                {approved.length >= activity.capacity ? 'Bekleme Listesine Gir' : 'Katılmak İstiyorum'}
              </ThemedText>
            </TouchableOpacity>
          )}

          {myParticipation && !isCaptain && (
            <ThemedText type="smallBold" style={styles.myStatus}>
              {STATUS_LABELS[myParticipation.status]}
            </ThemedText>
          )}

          {canCancel && myParticipation && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => cancelMyParticipation(myParticipation.id, myParticipation.status === 'approved')}>
              <ThemedText style={styles.cancelText}>
                {myParticipation.status === 'approved' ? 'Maçtan Ayrıl' : 'Başvuruyu İptal Et'}
              </ThemedText>
            </TouchableOpacity>
          )}

          <ThemedText type="smallBold" style={styles.sectionTitle}>Katılımcılar</ThemedText>
          {approved.map((p) => (
            <ThemedView key={p.id} style={styles.participantRow}>
              <ThemedText type="small">
                {p.profiles?.full_name ?? 'İsimsiz'}
                {p.user_id === activity.captain_id ? ' (kaptan)' : ''}
                {p.team ? ` · Takım ${p.team}` : ''}
              </ThemedText>
            </ThemedView>
          ))}

          {/* Kaptan, bekleyen başvurularda her oyuncunun puan özetini görür.
              İptal edilmiş ya da oynanmış maçta onay arayüzü yok. */}
          {isCaptain && !isPast && !isCancelled && pending.length > 0 && (
            <>
              <ThemedText type="smallBold" style={styles.sectionTitle}>Bekleyen Başvurular</ThemedText>
              {pending.map((p) => (
                <ThemedView key={p.id} style={styles.pendingRow}>
                  <ThemedView style={styles.pendingInfo}>
                    <ThemedText type="small">{p.profiles?.full_name ?? 'İsimsiz'}</ThemedText>
                    <ThemedText type="small" style={styles.summaryText}>{formatSummary(p.user_id)}</ThemedText>
                  </ThemedView>
                  <ThemedView style={styles.pendingActions}>
                    <TouchableOpacity onPress={() => decideParticipant(p.id, 'approved')}>
                      <ThemedText style={styles.approveText}>Onayla</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => decideParticipant(p.id, 'rejected')}>
                      <ThemedText style={styles.rejectText}>Reddet</ThemedText>
                    </TouchableOpacity>
                  </ThemedView>
                </ThemedView>
              ))}
            </>
          )}

          {isCaptain && waitlisted.length > 0 && (
            <>
              <ThemedText type="smallBold" style={styles.sectionTitle}>Bekleme Listesi</ThemedText>
              {waitlisted.map((p) => (
                <ThemedView key={p.id} style={styles.participantRow}>
                  <ThemedText type="small">{p.profiles?.full_name ?? 'İsimsiz'}</ThemedText>
                  <ThemedText type="small" style={styles.summaryText}>{formatSummary(p.user_id)}</ThemedText>
                </ThemedView>
              ))}
            </>
          )}

          {/* Maç sonrası puanlama + kalan süre bilgisi */}
          {canRate && currentUserId && (
            <>
              <ThemedText type="small" style={styles.deadlineText}>
                Puanlama {ratingDeadline.toLocaleDateString('tr-TR')} tarihine kadar açık.
              </ThemedText>
              <RatePlayersSection
                activityId={activityId}
                currentUserId={currentUserId}
                players={approved
                  .filter((p) => p.user_id !== currentUserId)
                  .map((p) => ({ user_id: p.user_id, full_name: p.profiles?.full_name ?? 'İsimsiz' }))}
              />
            </>
          )}

          {ratingClosed && (
            <ThemedText type="small" style={styles.deadlineText}>
              Bu maç için puanlama süresi doldu ({RATING_WINDOW_DAYS} gün).
            </ThemedText>
          )}

          {/* YENİ: kaptanın iptal düğmesi, bilerek en altta ve zayıf görünümde:
              yanlışlıkla basılmasın. */}
          {canCancelActivity && (
            <TouchableOpacity style={styles.cancelActivityButton} onPress={confirmCancelActivity}>
              <ThemedText style={styles.cancelText}>Aktiviteyi İptal Et</ThemedText>
            </TouchableOpacity>
          )}

          <ThemedView style={styles.bottomSpace} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  meta: { marginTop: 4, marginBottom: 12 },
  progress: { marginBottom: 12 },
  cancelBanner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#B3452E',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  cancelBannerText: { color: '#B3452E' },
  addressBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  applyButton: {
    backgroundColor: '#2F5233',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  applyButtonText: { color: '#fff', fontWeight: '600' },
  myStatus: { marginBottom: 12 },
  cancelButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  cancelActivityButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#B3452E',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 32,
  },
  cancelText: { color: '#B3452E', fontWeight: '600' },
  sectionTitle: { marginTop: 16, marginBottom: 8 },
  participantRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  pendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  pendingInfo: { flexShrink: 1 },
  summaryText: { color: '#8B9284', marginTop: 2 },
  pendingActions: { flexDirection: 'row', gap: 12 },
  approveText: { color: '#2F5233', fontWeight: '700' },
  rejectText: { color: '#B3452E', fontWeight: '700' },
  deadlineText: { color: '#8B9284', marginTop: 20 },
  bottomSpace: { height: 40 },
});