import { useCallback, useState } from 'react';
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
import { useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

// Ekranda göstereceğimiz üç sayı. Hepsi mevcut verilerden hesaplanıyor,
// veritabanında ayrıca bir "istatistik" tablosu tutmuyoruz (tek doğru
// kaynak: activity_participants ve activities).
type Stats = {
  played: number; // tarihi geçmiş ve onaylı olduğum maçlar
  hosted: number; // kaptanı olduğum tüm maçlar
  upcoming: number; // tarihi gelmemiş ve onaylı olduğum maçlar
};

export default function ProfileScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [stats, setStats] = useState<Stats>({ played: 0, hosted: 0, upcoming: 0 });
  const [loading, setLoading] = useState(true);

  // İsim düzenleme modu: false iken isim yazı olarak görünür,
  // true iken TextInput'a dönüşür.
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    setUserId(uid);

    // 1) İsmim. Telefon numarası bu tabloda yok (bilinçli karar).
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', uid)
      .single();

    if (profileError) {
      console.log('Profil çekilirken hata:', profileError.message);
    } else {
      setFullName(profile.full_name);
    }

    // 2) İstatistikler için: benim onaylı olduğum maçlar.
    // Kaptan da approved bir satır olduğu için bu listede.
    const { data: rows, error: rowsError } = await supabase
      .from('activity_participants')
      .select('activity_id')
      .eq('user_id', uid)
      .eq('status', 'approved');

    if (rowsError || !rows || rows.length === 0) {
      setStats({ played: 0, hosted: 0, upcoming: 0 });
      return;
    }

    // 3) O maçların tarihi ve kaptanı. Ham activities tablosunda
    // full_address'e yetkimiz yok, o yüzden view'ı kullanıyoruz.
    const { data: activities, error: activitiesError } = await supabase
      .from('activities_public')
      .select('id, captain_id, scheduled_at')
      .in('id', rows.map((r) => r.activity_id));

    if (activitiesError || !activities) {
      console.log('İstatistikler çekilirken hata:', activitiesError?.message);
      return;
    }

    const now = new Date();
    setStats({
      played: activities.filter((a) => new Date(a.scheduled_at) < now).length,
      hosted: activities.filter((a) => a.captain_id === uid).length,
      upcoming: activities.filter((a) => new Date(a.scheduled_at) >= now).length,
    });
  }, []);

  // Sekmeye her dönüldüğünde yeniden çek (diğer ekranlarla aynı desen).
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadProfile().finally(() => setLoading(false));
    }, [loadProfile])
  );

  function startEditing() {
    setDraftName(fullName);
    setEditing(true);
  }

  async function saveName() {
    const name = draftName.trim();

    // Aynı kural veritabanında da var (profiles_full_name_length).
    // Burada kontrol etmemizin sebebi kullanıcıya anlaşılır mesaj
    // göstermek, asıl güvence veritabanındaki kural.
    if (name.length < 2 || name.length > 40) {
      Alert.alert('Geçersiz isim', 'İsmin 2 ile 40 karakter arasında olmalı.');
      return;
    }
    if (!userId) return;

    setSaving(true);

    // .select('id') şart: güncelleme hiçbir satıra uymazsa Supabase hata
    // vermez, sadece boş sonuç döner. Dönen satırı kontrol ederek
    // "gerçekten kaydedildi mi" diye emin oluyoruz.
    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name: name })
      .eq('id', userId)
      .select('id');

    setSaving(false);

    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    if (!data || data.length === 0) {
      Alert.alert('Hata', 'İsim kaydedilemedi, tekrar dene.');
      return;
    }

    setFullName(name);
    setEditing(false);
  }

  async function handleLogout() {
    // signOut sonrası kök layout (onAuthStateChange) oturumun bittiğini
    // fark edip bizi giriş ekranına yönlendiriyor, elle yönlendirmeye
    // gerek yok.
    await supabase.auth.signOut();
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ThemedView style={styles.container}>
        <SafeAreaView>
          <ScrollView keyboardShouldPersistTaps="handled">
            <ThemedText type="title">👤 Profil</ThemedText>

            {loading ? (
              <ThemedText style={styles.loading}>Yükleniyor…</ThemedText>
            ) : (
              <>
                {/* İSİM: normal modda yazı + "Düzenle", düzenleme modunda input */}
                <ThemedView style={styles.nameBox}>
                  {editing ? (
                    <>
                      <TextInput
                        style={styles.input}
                        value={draftName}
                        onChangeText={setDraftName}
                        placeholder="Adın ve soyadın"
                        placeholderTextColor="#8B9284"
                        maxLength={40}
                        autoFocus
                      />
                      <ThemedView style={styles.editActions}>
                        <TouchableOpacity onPress={() => setEditing(false)} disabled={saving}>
                          <ThemedText style={styles.cancelText}>Vazgeç</ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={saveName} disabled={saving}>
                          <ThemedText style={styles.saveText}>
                            {saving ? 'Kaydediliyor…' : 'Kaydet'}
                          </ThemedText>
                        </TouchableOpacity>
                      </ThemedView>
                    </>
                  ) : (
                    <ThemedView style={styles.nameRow}>
                      <ThemedText type="subtitle" style={styles.nameText}>{fullName}</ThemedText>
                      <TouchableOpacity onPress={startEditing}>
                        <ThemedText style={styles.editLink}>Düzenle</ThemedText>
                      </TouchableOpacity>
                    </ThemedView>
                  )}
                </ThemedView>

                {/* İSTATİSTİKLER */}
                <ThemedView style={styles.statsRow}>
                  <StatBox label="Oynanan maç" value={stats.played} />
                  <StatBox label="Açtığın maç" value={stats.hosted} />
                  <StatBox label="Yaklaşan" value={stats.upcoming} />
                </ThemedView>

                {/* Seviye ve puanlar (dakiklik, fair play vb.) ratings
                    tablosu kurulunca bu ekrana eklenecek. */}
              </>
            )}

            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <ThemedText style={styles.logoutText}>Çıkış Yap</ThemedText>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

// Tek bir istatistik kutusu. Üç kez aynı görünümü tekrar yazmamak için
// küçük bir yardımcı bileşen.
function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <ThemedView style={styles.statBox}>
      <ThemedText type="subtitle">{value}</ThemedText>
      <ThemedText type="small">{label}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  loading: { marginTop: 16 },
  nameBox: { marginTop: 20, marginBottom: 20 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameText: { flexShrink: 1 },
  editLink: { color: '#2F5233', fontWeight: '600' },
  // Renkler sabit: koyu temada yazı, beyaz zeminde görünmez olmasın.
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1B2119',
    backgroundColor: '#fff',
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 12 },
  cancelText: { color: '#8B9284', fontWeight: '600' },
  saveText: { color: '#2F5233', fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 32 },
  statBox: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  logoutButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 40,
  },
  logoutText: { color: '#B3452E', fontWeight: '600' },
});