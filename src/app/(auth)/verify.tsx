import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

export default function VerifyScreen() {
  // Bir önceki ekrandan (phone.tsx) taşınan telefon numarasını okuyoruz
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function verifyCode() {
    setLoading(true);
    // verifyOtp -> girilen kodun, o telefon numarasına gönderilen
    // gerçek SMS koduyla eşleşip eşleşmediğini Supabase kontrol ediyor.
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: 'sms',
    });
    setLoading(false);

    if (error) {
      Alert.alert('Hata', 'Kod yanlış veya süresi dolmuş.');
      return;
    }

    // Doğrulama başarılı olunca Supabase otomatik olarak oturumu açıyor.
    // _layout.tsx'teki yönlendirme mantığı, oturumun açıldığını fark edip
    // bizi otomatik olarak tab bar'a (ana uygulamaya) yönlendirecek -
    // burada elle bir router.push yapmamıza gerek YOK.
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ThemedView style={styles.container}>
        <SafeAreaView>
          <ThemedText type="title">Kodu Gir</ThemedText>
          <ThemedText style={styles.subtitle}>{phone} numarasına gönderilen 6 haneli kod</ThemedText>

          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            placeholderTextColor="#8B9284"
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />

          <TouchableOpacity style={styles.button} onPress={verifyCode} disabled={loading}>
            <ThemedText style={styles.buttonText}>{loading ? 'Doğrulanıyor…' : 'Doğrula'}</ThemedText>
          </TouchableOpacity>
        </SafeAreaView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  subtitle: { marginTop: 8, marginBottom: 24 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 14,
    fontSize: 20,
    textAlign: 'center',
    letterSpacing: 8,
    color: '#1B2119',
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  button: { backgroundColor: '#2F5233', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});