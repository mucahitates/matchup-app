import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

type Activity = {
  id: string;
  title: string;
  district: string;
  scheduled_at: string;
  capacity: number;
};

export default function DiscoverScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // fetchActivities'i useEffect DIŞINA aldık çünkü artık iki farklı
  // yerden çağıracağız: ekran odaklandığında (useFocusEffect) ve
  // kullanıcı elle aşağı çektiğinde (RefreshControl).
  const fetchActivities = useCallback(async () => {
    const { data, error } = await supabase
      .from('activities_public')
      .select('id, title, district, scheduled_at, capacity')
      .eq('status', 'open');

    if (error) {
      console.log('Aktiviteler çekilirken hata:', error.message);
    } else {
      setActivities(data);
    }
  }, []);

  // useFocusEffect: bu ekran her "odaklandığında" (ilk açılışta VE
  // başka bir sekmeden buraya her dönüldüğünde) içindeki kodu çalıştırır.
  // useEffect'ten farkı tam olarak bu - useEffect sadece ekran ilk
  // oluşturulduğunda çalışırdı, bu ise her geri dönüşte tekrar tetiklenir.
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
            <ThemedView style={styles.card}>
              <ThemedText type="smallBold">{item.title}</ThemedText>
              <ThemedText type="small">{item.district}</ThemedText>
            </ThemedView>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            !loading ? <ThemedText>Şu an açık aktivite yok.</ThemedText> : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  card: {
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
});