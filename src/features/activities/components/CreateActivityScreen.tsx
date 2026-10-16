import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
// DateTimePicker: iOS'ta ekrana gömülen bileşen. DateTimePickerAndroid:
// Android'de sistem penceresini açan fonksiyon. İki platform bu konuda
// farklı çalıştığı için ikisini ayrı ele alıyoruz.
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

type Sport = {
  id: string;
  name: string;
  category: 'team' | 'individual';
  min_players: number;
  max_players: number;
};

type District = { id: string; name: string; city: string };

// Başlangıç tarihi önerisi: yarın akşam 20:00. Kullanıcının çoğu zaman
// sadece günü değiştirmesi yeter.
function defaultStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return d;
}

// Tarihi ekranda okunaklı göstermek için ("Cumartesi 18 Ekim 20:00").
function formatDate(d: Date): string {
  return d.toLocaleString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CreateActivityScreen() {
  // Supabase'den gelen listeler (sabit veri kodda tutulmuyor)
  const [sports, setSports] = useState<Sport[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);

  // Kullanıcının seçimleri
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null);
  const [district, setDistrict] = useState('');
  const [scheduledAt, setScheduledAt] = useState<Date>(defaultStart);

  // Form alanları
  const [title, setTitle] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [capacity, setCapacity] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchSports() {
      const { data, error } = await supabase.from('sports').select('*');
      if (error) console.log('Sporlar çekilirken hata:', error.message);
      else setSports(data);
    }

    async function fetchDistricts() {
      const { data, error } = await supabase.from('districts').select('*').order('name');
      if (error) console.log('Bölgeler çekilirken hata:', error.message);
      else setDistricts(data);
    }

    fetchSports();
    fetchDistricts();
  }, []);

  // Android'de tarih ve saat tek pencerede seçilemiyor: önce tarih,
  // sonra saat penceresi arka arkaya açılıyor. iOS'ta bu fonksiyon
  // kullanılmıyor (aşağıda gömülü picker var).
  function openAndroidPicker() {
    DateTimePickerAndroid.open({
      value: scheduledAt,
      mode: 'date',
      minimumDate: new Date(),
      onChange: (event, pickedDate) => {
        // 'set' = Tamam'a bastı. Vazgeçtiyse hiçbir şey yapma.
        if (event.type !== 'set' || !pickedDate) return;

        DateTimePickerAndroid.open({
          value: pickedDate,
          mode: 'time',
          is24Hour: true,
          onChange: (timeEvent, pickedTime) => {
            if (timeEvent.type !== 'set' || !pickedTime) return;
            // Seçilen günün üzerine seçilen saati yaz.
            const merged = new Date(pickedDate);
            merged.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
            setScheduledAt(merged);
          },
        });
      },
    });
  }

  async function handleSubmit() {
    const trimmedTitle = title.trim();
    const trimmedAddress = fullAddress.trim();
    const people = parseInt(capacity, 10);

    // Bu kontroller kullanıcıya anlaşılır mesaj göstermek içindir.
    // Aynı kuralların asıl güvencesi veritabanında (fn_validate_activity).
    if (!selectedSport || !district || !trimmedTitle || !trimmedAddress || !capacity) {
      Alert.alert('Eksik bilgi', 'Lütfen tüm alanları doldur.');
      return;
    }
    if (trimmedTitle.length < 3 || trimmedTitle.length > 60) {
      Alert.alert('Geçersiz başlık', 'Başlık 3 ile 60 karakter arasında olmalı.');
      return;
    }
    if (Number.isNaN(people) || people < 2 || people > selectedSport.max_players) {
      Alert.alert(
        'Geçersiz kişi sayısı',
        `${selectedSport.name} için toplam kişi sayısı 2 ile ${selectedSport.max_players} arasında olmalı.`
      );
      return;
    }
    if (scheduledAt.getTime() <= Date.now()) {
      Alert.alert('Geçersiz tarih', 'Maç tarihi gelecekte olmalı.');
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }

    setSubmitting(true);

    // captain_id'yi biz yazmıyoruz, giriş yapmış kullanıcının id'sini
    // kullanıyoruz. RLS kuralı da "captain_id = auth.uid() değilse reddet" diyor.
    const { error } = await supabase.from('activities').insert({
      captain_id: userData.user.id,
      sport_id: selectedSport.id,
      title: trimmedTitle,
      district,
      full_address: trimmedAddress,
      // toISOString: tarihi UTC olarak gönderir, veritabanı timestamptz
      // olarak saklar. Ekranda her kullanıcıya kendi saat diliminde görünür.
      scheduled_at: scheduledAt.toISOString(),
      capacity: people,
    });

    setSubmitting(false);

    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }

    Alert.alert('Başarılı', 'Aktivite oluşturuldu!');
    setTitle('');
    setDistrict('');
    setFullAddress('');
    setCapacity('');
    setSelectedSport(null);
    setScheduledAt(defaultStart());
    router.push('/');
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ThemedView style={styles.container}>
        <SafeAreaView>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <ThemedText type="title">🎯 Aktivite Oluştur</ThemedText>

            <ThemedText type="smallBold" style={styles.label}>Spor</ThemedText>
            <ThemedView style={styles.chipRow}>
              {sports.map((sport) => (
                <TouchableOpacity
                  key={sport.id}
                  onPress={() => setSelectedSport(sport)}
                  style={[styles.chip, selectedSport?.id === sport.id && styles.chipSelected]}>
                  <ThemedText type="small" style={selectedSport?.id === sport.id ? styles.chipTextSelected : undefined}>
                    {sport.name}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ThemedView>

            <ThemedText type="smallBold" style={styles.label}>Bölge (herkese açık)</ThemedText>
            <ThemedView style={styles.chipRow}>
              {districts.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => setDistrict(d.name)}
                  style={[styles.chip, district === d.name && styles.chipSelected]}>
                  <ThemedText type="small" style={district === d.name ? styles.chipTextSelected : undefined}>
                    {d.name}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ThemedView>

            <ThemedText type="smallBold" style={styles.label}>Tarih ve saat</ThemedText>
            {Platform.OS === 'ios' ? (
              // iOS: "compact" görünüm, tarih ve saat iki küçük düğme olarak
              // görünür, dokununca sistem seçicisi açılır. minimumDate geçmiş
              // günlerin seçilmesini engeller.
              <ThemedView style={styles.dateRow}>
                <DateTimePicker
                  value={scheduledAt}
                  mode="datetime"
                  display="compact"
                  locale="tr-TR"
                  minimumDate={new Date()}
                  onChange={(_event, picked) => {
                    if (picked) setScheduledAt(picked);
                  }}
                />
              </ThemedView>
            ) : (
              <TouchableOpacity style={styles.dateButton} onPress={openAndroidPicker}>
                <ThemedText type="small">{formatDate(scheduledAt)}</ThemedText>
              </TouchableOpacity>
            )}

            <ThemedText type="smallBold" style={styles.label}>Başlık</ThemedText>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Örn. Cuma akşamı halısaha"
              placeholderTextColor="#8B9284"
              maxLength={60}
            />

            <ThemedText type="smallBold" style={styles.label}>Tam adres (sadece onaylı katılımcı görür)</ThemedText>
            <TextInput
              style={styles.input}
              value={fullAddress}
              onChangeText={setFullAddress}
              placeholder="Saha adı, sokak, no"
              placeholderTextColor="#8B9284"
            />

            <ThemedText type="smallBold" style={styles.label}>Toplam kişi sayısı (kaptan dahil)</ThemedText>
            <TextInput
              style={styles.input}
              value={capacity}
              onChangeText={setCapacity}
              keyboardType="number-pad"
              placeholder={selectedSport ? `2 - ${selectedSport.max_players}` : 'Önce spor seç'}
              placeholderTextColor="#8B9284"
            />

            <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
              <ThemedText style={styles.submitButtonText}>
                {submitting ? 'Oluşturuluyor…' : 'Aktiviteyi Yayınla'}
              </ThemedText>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  label: { marginTop: 16, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipSelected: { backgroundColor: '#2F5233' },
  // Seçili chip'te yazı beyaz: yeşil zeminde tema rengi görünmeyebilir.
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 14,
  },
  // Renkler sabit: koyu temada yazı, beyaz zeminde görünmez olmasın.
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1B2119',
    backgroundColor: '#fff',
  },
  submitButton: {
    backgroundColor: '#2F5233',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonText: { color: '#fff', fontWeight: '600' },
});