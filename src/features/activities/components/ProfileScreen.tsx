import { StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

// Profil ekranı. Şimdilik sadece çıkış yapma var; isim, seviye ve
// puanlar, ilgili tablolar (ratings vb.) kurulunca eklenecek.
export default function ProfileScreen() {
  async function handleLogout() {
    // signOut -> Supabase oturumu sonlandırıyor. _layout.tsx'teki
    // onAuthStateChange bunu fark edip session'ı null yapıyor, ardından
    // <Redirect> bizi otomatik olarak telefon girişi ekranına götürüyor.
    // Burada elle yönlendirme yazmamıza gerek yok.
    await supabase.auth.signOut();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView>
        <ThemedText type="title">👤 Profil</ThemedText>
        <ThemedText style={styles.subtitle}>İsim, seviye ve puanların burada görünecek.</ThemedText>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <ThemedText style={styles.logoutText}>Çıkış Yap</ThemedText>
        </TouchableOpacity>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  subtitle: { marginTop: 8, marginBottom: 32 },
  logoutButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  logoutText: { color: '#B3452E', fontWeight: '600' },
});