import { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

type Country = {
  id: string;
  code: string;
  flag: string;
  name: string;
};

export default function PhoneScreen() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [localNumber, setLocalNumber] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // sports/districts ile birebir aynı desen: ekran açılınca
  // countries tablosunu çek, ilk sıradakini (sort_order'a göre)
  // varsayılan seçim yap.
  useEffect(() => {
    async function fetchCountries() {
      const { data, error } = await supabase.from('countries').select('*').order('sort_order');
      if (error) {
        console.log('Ülkeler çekilirken hata:', error.message);
      } else {
        setCountries(data);
        if (data.length > 0) setSelectedCountry(data[0]);
      }
    }
    fetchCountries();
  }, []);

  async function sendCode() {
    if (!selectedCountry) {
      Alert.alert('Bekle', 'Ülke listesi henüz yüklenmedi.');
      return;
    }
    if (localNumber.trim().length < 9) {
      Alert.alert('Geçersiz numara', 'Lütfen numaranı eksiksiz gir.');
      return;
    }

    const fullPhone = `${selectedCountry.code}${localNumber.trim()}`;

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
    setLoading(false);

    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }

    router.push({ pathname: '/(auth)/verify', params: { phone: fullPhone } });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ThemedView style={styles.container}>
        <SafeAreaView>
          <ThemedText type="title">MatchUp</ThemedText>
          <ThemedText style={styles.subtitle}>Telefon numaranı gir, sana bir kod gönderelim.</ThemedText>

          <ThemedView style={styles.phoneRow}>
            <TouchableOpacity style={styles.countryButton} onPress={() => setPickerVisible(true)}>
              <ThemedText style={styles.darkText}>
                {selectedCountry ? `${selectedCountry.flag} ${selectedCountry.code}` : '…'}
              </ThemedText>
            </TouchableOpacity>

            <TextInput
              style={styles.phoneInput}
              value={localNumber}
              onChangeText={setLocalNumber}
              placeholder="xxx xxx xx xx"
              placeholderTextColor="#8B9284"
              keyboardType="phone-pad"
              autoFocus
            />
          </ThemedView>

          <TouchableOpacity style={styles.button} onPress={sendCode} disabled={loading}>
            <ThemedText style={styles.buttonText}>{loading ? 'Gönderiliyor…' : 'Kod Gönder'}</ThemedText>
          </TouchableOpacity>
        </SafeAreaView>

        <Modal visible={pickerVisible} animationType="slide" transparent>
          <ThemedView style={styles.modalOverlay}>
            <ThemedView style={styles.modalContent}>
              <ThemedText style={[styles.darkText, { fontWeight: '700', marginBottom: 12 }]}>Ülke Seç</ThemedText>
              <FlatList
                data={countries}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.countryOption}
                    onPress={() => {
                      setSelectedCountry(item);
                      setPickerVisible(false);
                    }}>
                    {/* Bayrak - Ülke Adı - Alan Kodu, açıkça 3 ayrı parça olarak */}
                    <ThemedText style={styles.darkText}>
                      {item.flag}  {item.name}  ({item.code})
                    </ThemedText>
                  </TouchableOpacity>
                )}
              />
              <TouchableOpacity onPress={() => setPickerVisible(false)} style={styles.closeButton}>
                <ThemedText style={{ color: '#B3452E' }}>Kapat</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </Modal>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  subtitle: { marginTop: 8, marginBottom: 24 },
  phoneRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  countryButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  phoneInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1B2119',
    backgroundColor: '#fff',
  },
  button: { backgroundColor: '#2F5233', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' },
  countryOption: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DBD8CC' },
  closeButton: { alignItems: 'center', paddingVertical: 14 },
  // Modal'ın arka planı sabit beyaz olduğu için, içindeki yazı da
  // sabit koyu renk olmalı - temaya (dark mode'a) bırakırsak,
  // beyaz zemin üzerinde beyaz yazı gibi görünmez bir sonuç çıkar.
  darkText: { color: '#1B2119' },
});