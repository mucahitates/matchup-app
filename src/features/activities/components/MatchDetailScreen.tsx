import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
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
  full_address: string | null;
  scheduled_at: string;
  capacity: number;
};

type Participant = {
  id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'waitlisted' | 'cancelled';
  team: 'A' | 'B' | null;
  profiles: { full_name: string } | null;
};

export default function MatchDetailScreen({ activityId }: { activityId: string }) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    setCurrentUserId(userData.user?.id ?? null);

    // activities_public view'ını kullanıyoruz - full_address, RLS
    // kuralına göre (kaptan/onaylı katılımcıysan) otomatik dolu gelir,
    // değilsen null gelir. Ekranda buna göre göstereceğiz.
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

    // profiles(full_name) -> foreign key ilişkisi sayesinde, tek
    // sorguda katılımcının adını da çekebiliyoruz (join).
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

    const { error } = await supabase.from('activity_participants').insert({
      activity_id: activityId,
      user_id: currentUserId,
    });

    if (error) {
      Alert.alert('Hata', error.message);
    } else {
      Alert.alert('Başvuruldu', 'Kaptan onayını bekliyorsun.');
      loadData();
    }
  }

  async function decideParticipant(participantId: string, newStatus: 'approved' | 'rejected') {
    const { error } = await supabase
      .from('activity_participants')
      .update({ status: newStatus })
      .eq('id', participantId);

    if (error) {
      Alert.alert('Hata', error.message);
    } else {
      // Burada elle bir şey yapmıyoruz - schema.sql'deki trigger'lar
      // (waitlist kontrolü, otomatik takım oluşturma) veritabanı
      // tarafında kendiliğinden devreye giriyor. Biz sadece sonucu
      // yeniden çekiyoruz.
      loadData();
    }
  }

  if (loading || !activity) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView>
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView>
        <FlatList
          data={[]} // Ana içerik ListHeaderComponent'te, FlatList'i sadece scroll için kullanıyoruz
          renderItem={null}
          ListHeaderComponent={
            <ThemedView>
              <ThemedText type="title">{activity.title}</ThemedText>
              <ThemedText type="small" style={styles.meta}>
                {activity.district} · {new Date(activity.scheduled_at).toLocaleString('tr-TR')}
              </ThemedText>

              <ThemedText type="smallBold" style={styles.progress}>
                {approved.length}/{activity.capacity} katıldı
                {waitlisted.length > 0 ? ` · ${waitlisted.length} sırada` : ''}
              </ThemedText>

              {/* Adres gizliliği: full_address view'dan null geliyorsa
                  (henüz onaylı değilsen/kaptan değilsen), kilitli mesajı göster */}
              <ThemedView style={styles.addressBox}>
                {activity.full_address ? (
                  <ThemedText type="small">📍 {activity.full_address}</ThemedText>
                ) : (
                  <ThemedText type="small">🔒 Tam adres, onaylandığında görünecek</ThemedText>
                )}
              </ThemedView>

              {/* Başvuru butonu - kaptan değilsen ve hiç başvurmadıysan */}
              {!isCaptain && !myParticipation && (
                <TouchableOpacity style={styles.applyButton} onPress={applyToActivity}>
                  <ThemedText style={styles.applyButtonText}>Katılmak İstiyorum</ThemedText>
                </TouchableOpacity>
              )}

              {myParticipation && (
                <ThemedText type="small" style={styles.myStatus}>
                  Durumun: {myParticipation.status}
                </ThemedText>
              )}

              <ThemedText type="smallBold" style={styles.sectionTitle}>Katılımcılar</ThemedText>
              {approved.map((p) => (
                <ThemedView key={p.id} style={styles.participantRow}>
                  <ThemedText type="small">
                    {p.profiles?.full_name ?? 'İsimsiz'} {p.team ? `· Takım ${p.team}` : ''}
                  </ThemedText>
                </ThemedView>
              ))}

              {/* Sadece kaptan, bekleyen başvuruları onaylayıp/reddedebilir */}
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
            </ThemedView>
          }
        />
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
  myStatus: { marginBottom: 16 },
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