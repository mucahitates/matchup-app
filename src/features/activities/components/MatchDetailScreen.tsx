import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

type Activity = {
  id: string;
  captain_id: string;
  title: string;
  district: string;
  full_address: string | null; // başkasıysa view'dan null gelir (adres gizliliği)
  scheduled_at: string;
  capacity: number;
};

type ParticipantStatus = 'pending' | 'approved' | 'rejected' | 'waitlisted' | 'cancelled';

type Participant = {
  id: string;
  user_id: string;
  status: ParticipantStatus;
  team: 'A' | 'B' | null;
  profiles: { full_name: string } | null;
};

// Veritabanındaki durum kodlarını kullanıcıya gösterilecek metne çevirir.
// Kodlar (pending vb.) veritabanı için, metinler ekran için: ikisini ayırmak
// ileride çoklu dil eklemeyi de kolaylaştırır.
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

    // profiles(full_name): foreign key sayesinde tek sorguda isim de gelir (join).
    // RLS gereği herkes onaylıları görür, kendi satırını ve (kaptansa)
    // tüm başvuruları görür.
    const { data: participantsData, error: participantsError } = await supabase
      .from('activity_participants')
      .select('id, user_id, status, team, profiles(full_name)')
      .eq('activity_id', activityId)
      .order('applied_at', { ascending: true });

    if (participantsError) {
      console.log('Katılımcılar çekilirken hata:', participantsError.message);
    } else {
      setParticipants(participantsData as any);
    }

    setLoading(false);
  }, [activityId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  async function applyToActivity() {
    if (!currentUserId) return;

    // Durumu biz yazmıyoruz: veritabanı trigger'ı her başvuruyu 'pending'
    // başlatır, kontenjan doluysa 'waitlisted' yapar.
    const { error } = await supabase.from('activity_participants').insert({
      activity_id: activityId,
      user_id: currentUserId,
    });

    if (error) {
      Alert.alert('Hata', error.message);
    } else {
      loadData();
    }
  }

  // Kaptan: bekleyen başvuruyu onaylar/reddeder. Kontenjan kontrolü,
  // takım ataması, bekleme listesi hep veritabanı trigger'larının işi.
  async function decideParticipant(participantId: string, newStatus: 'approved' | 'rejected') {
    const { error } = await supabase
      .from('activity_participants')
      .update({ status: newStatus })
      .eq('id', participantId);

    if (error) {
      Alert.alert('Hata', error.message);
    } else {
      loadData();
    }
  }

  // Katılımcı: kendi başvurusunu iptal eder / maçtan ayrılır.
  // Ayrılan onaylıysa, sıradaki bekleme listesi kişisi otomatik onaylanır
  // (fn_promote_waitlist), biz sadece sonucu yeniden çekiyoruz.
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

            if (error) {
              Alert.alert('Hata', error.message);
            } else {
              loadData();
            }
          },
        },
      ]
    );
  }

  // edges={['bottom']}: üst kenarı ekranın kendi başlığı (Stack header)
  // zaten koruyor, çift boşluk olmasın.
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

  // Sadece pending/waitlisted/approved durumundakiler iptal edebilir
  // (zaten reddedilmiş ya da iptal etmiş birinin iptal edeceği bir şey yok).
  const canCancel =
    !isCaptain &&
    myParticipation &&
    ['pending', 'waitlisted', 'approved'].includes(myParticipation.status);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['bottom']}>
        <ScrollView>
          <ThemedText type="title">{activity.title}</ThemedText>
          <ThemedText type="small" style={styles.meta}>
            {activity.district} · {new Date(activity.scheduled_at).toLocaleString('tr-TR')}
          </ThemedText>

          {/* Bekleme listesi sayısını sadece kaptan görür: RLS gereği
              başkalarının 'waitlisted' satırları diğer kullanıcılara görünmez. */}
          <ThemedText type="smallBold" style={styles.progress}>
            {approved.length}/{activity.capacity} katıldı
            {isCaptain && waitlisted.length > 0 ? ` · ${waitlisted.length} sırada` : ''}
          </ThemedText>

          {/* Adres gizliliği: view'dan null geliyorsa kilitli mesajı göster */}
          <ThemedView style={styles.addressBox}>
            {activity.full_address ? (
              <ThemedText type="small">📍 {activity.full_address}</ThemedText>
            ) : (
              <ThemedText type="small">🔒 Tam adres, onaylandığında görünecek</ThemedText>
            )}
          </ThemedView>

          {/* Henüz başvurmamış katılımcı için başvuru butonu */}
          {!isCaptain && !myParticipation && (
            <TouchableOpacity style={styles.applyButton} onPress={applyToActivity}>
              <ThemedText style={styles.applyButtonText}>
                {approved.length >= activity.capacity ? 'Bekleme Listesine Gir' : 'Katılmak İstiyorum'}
              </ThemedText>
            </TouchableOpacity>
          )}

          {/* Kaptan zaten katılımcı olduğu için kendi durumunu göstermiyoruz */}
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

          {/* Sadece kaptan bekleyen başvuruları onaylayıp reddedebilir */}
          {isCaptain && pending.length > 0 && (
            <>
              <ThemedText type="smallBold" style={styles.sectionTitle}>Bekleyen Başvurular</ThemedText>
              {pending.map((p) => (
                <ThemedView key={p.id} style={styles.pendingRow}>
                  <ThemedText type="small">{p.profiles?.full_name ?? 'İsimsiz'}</ThemedText>
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

          {/* Kaptan bekleme listesindekileri görebilir (sıra otomatik işler) */}
          {isCaptain && waitlisted.length > 0 && (
            <>
              <ThemedText type="smallBold" style={styles.sectionTitle}>Bekleme Listesi</ThemedText>
              {waitlisted.map((p) => (
                <ThemedView key={p.id} style={styles.participantRow}>
                  <ThemedText type="small">{p.profiles?.full_name ?? 'İsimsiz'}</ThemedText>
                </ThemedView>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  meta: { marginTop: 4, marginBottom: 12 },
  progress: { marginBottom: 12 },
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
  pendingActions: { flexDirection: 'row', gap: 12 },
  approveText: { color: '#2F5233', fontWeight: '700' },
  rejectText: { color: '#B3452E', fontWeight: '700' },
});