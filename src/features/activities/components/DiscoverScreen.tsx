import { useEffect, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

// Supabase'den dönen bir aktivite satırının şeklini tanımlıyoruz.
// Bu, TypeScript'e "bu obje şu alanlara sahip olacak" diyerek
// yazım hatalarını daha kod çalışmadan yakalamamızı sağlıyor.
type Activity = {
  id: string;
  title: string;
  district: string;
  scheduled_at: string;
  capacity: number;
};

export default function DiscoverScreen() {
  // useState: "activities" isminde bir değişken ve onu değiştirecek
  // "setActivities" fonksiyonunu oluşturuyoruz. Başlangıç değeri: boş dizi.
  // activities değiştiğinde ekran otomatik yeniden çizilir.
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  // useEffect: ekran ilk açıldığında (component "mount" olduğunda)
  // içindeki kodu bir kere çalıştırır. Sondaki [] (boş dizi), "sadece
  // bir kere, ekran ilk açılırken çalış" anlamına geliyor - içine
  // bir değişken koysaydık, o değişken her değiştiğinde tekrar çalışırdı.
  useEffect(() => {
    async function fetchActivities() {
      // supabase.from('activities') -> "activities" tablosuna git
      // .select('id, title, district, scheduled_at, capacity') -> bu kolonları getir
      // .eq('status', 'open') -> sadece status'u 'open' olanları getir
      const { data, error } = await supabase
        .from('activities_public')
        .select('id, title, district, scheduled_at, capacity')
        .eq('status', 'open');

      if (error) {
        console.log('Aktiviteler çekilirken hata:', error.message);
      } else {
        setActivities(data);
      }
      setLoading(false);
    }

    fetchActivities();
  }, []);

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