import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// "Maçlarım" ekranının gerçek yaşadığı yer.
// İleride burada 3 bölüm olacak: Yaklaşan / Senin açtıkların / Geçmiş.
// Şimdilik sabit (statik) bir taslak - Supabase bağlantısını
// navigasyon iskeleti tamamen oturunca ekleyeceğiz.
export default function MyMatchesScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView>
        <ThemedText type="title">Maçlarım</ThemedText>
        <ThemedText>Yaklaşan, oluşturduğun ve geçmiş maçların burada listelenecek.</ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
});