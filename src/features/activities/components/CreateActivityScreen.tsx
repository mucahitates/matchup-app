import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

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

type District = {
  id: string;
  name: string;
  city: string;
};

export default function CreateActivityScreen() {
  // Supabase'den çekilen listeler
  const [sports, setSports] = useState<Sport[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);

  // Kullanıcının seçimleri
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null);
  const [district, setDistrict] = useState('');

  // Form alanları
  const [title, setTitle] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [capacity, setCapacity] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Ekran açılınca sports ve districts tablolarını çek
  useEffect(() => {
    async function fetchSports() {
      const { data, error } = await supabase.from('sports').select('*');
      if (error) {
        console.log('Sporlar çekilirken hata:', error.message);
      } else {
        setSports(data);
      }
    }

    async function fetchDistricts() {
      const { data, error } = await supabase.from('districts').select('*').order('name');
      if (error) {
        console.log('Bölgeler çekilirken hata:', error.message);
      } else {
        setDistricts(data);
      }
    }

    fetchSports();
    fetchDistricts();
  }, []);

  async function handleSubmit() {
    if (!selectedSport || !title || !district || !fullAddress || !capacity) {
      Alert.alert('Eksik bilgi', 'Lütfen tüm alanları doldur.');
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.from('activities').insert({
      captain_id: userData.user.id,
      sport_id: selectedSport.id,
      title,
      district,
      full_address: fullAddress,
      // Test amaçlı: bugünden 3 gün sonrasını sabit koyuyoruz.
      // Gerçek bir tarih seçici (date picker) ekranı ayrı bir adımda gelecek.
      scheduled_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      capacity: parseInt(capacity, 10),
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
                  <ThemedText type="small">{sport.name}</ThemedText>
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
                  <ThemedText type="small">{d.name}</ThemedText>
                </TouchableOpacity>
              ))}
            </ThemedView>

            <ThemedText type="smallBold" style={styles.label}>Başlık</ThemedText>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Örn. Cuma akşamı halısaha"
              placeholderTextColor="#8B9284"
            />

            <ThemedText type="smallBold" style={styles.label}>Tam adres (sadece onaylı katılımcı görür)</ThemedText>
            <TextInput
              style={styles.input}
              value={fullAddress}
              onChangeText={setFullAddress}
              placeholder="Saha adı, sokak, no"
              placeholderTextColor="#8B9284"
            />

            <ThemedText type="smallBold" style={styles.label}>Kontenjan</ThemedText>
            <TextInput
              style={styles.input}
              value={capacity}
              onChangeText={setCapacity}
              keyboardType="number-pad"
              placeholder="Örn. 10"
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
  container: {
    flex: 1,
    padding: 20,
  },
  label: {
    marginTop: 16,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipSelected: {
    backgroundColor: '#2F5233',
  },
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
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});