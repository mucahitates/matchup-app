import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// Profil ekranının gerçek yaşadığı yer.
// İleride burada: isim/foto, spor bazlı seviye etiketleri,
// 4 boyutlu puanlama (dakiklik, fair play, iletişim, sportmenlik)
// ve maç istatistikleri olacak. Şimdilik sabit taslak.
export default function ProfileScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView>
        <ThemedText type="title">👤 Profil</ThemedText>
        <ThemedText>İsim, seviye ve puanların burada görünecek.</ThemedText>
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


