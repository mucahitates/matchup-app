import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

// status eklendi: kartta "Dolu" etiketini göstermek için lazım.
type Activity = {
  id: string;
  title: string;
  district: string;
  scheduled_at: string;
  capacity: number;
  status: 'open' | 'full';
};

export default function DiscoverScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchActivities = useCallback(async () => {
    // Dolu maçları da listeliyoruz ('full'): kullanıcı dolu bir maça
    // girip bekleme listesine yazılabilsin. Tarihe göre yakından uzağa sıralı.
    const { data, error } = await supabase
      .from('activities_public')
      .select('id, title, district, scheduled_at, capacity, status')
      .in('status', ['open', 'full'])
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.log('Aktiviteler çekilirken hata:', error.message);
    } else {
      setActivities(data as Activity[]);
    }
  }, []);

  // Sekmeye her dönüldüğünde veriyi yeniden çeker (useEffect sadece
  // ilk açılışta çalışırdı).
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchActivities().finally(() => setLoading(false));
    }, [fetchActivities])
  );

  async function onRefresh() {
    setRefreshing(true);
    await fetchActivities();
    setRefreshing(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView>
        <ThemedText type="title">🔍 Discover</ThemedText>

        {loading && <ThemedText>Yükleniyor…</ThemedText>}

        <FlatList
          data={activities}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/activity/${item.id}`)}>
              <ThemedText type="smallBold">{item.title}</ThemedText>
              <ThemedText type="small">{item.district}</ThemedText>
              {/* Dolu maç: bekleme listesine girilebileceğini söylüyoruz */}
              {item.status === 'full' && (
                <ThemedText type="small" style={styles.fullBadge}>
                  Dolu · bekleme listesine girebilirsin
                </ThemedText>
              )}
            </TouchableOpacity>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={!loading ? <ThemedText>Şu an açık aktivite yok.</ThemedText> : null}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  card: {
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fullBadge: { marginTop: 4, color: '#D98E3E' },
});