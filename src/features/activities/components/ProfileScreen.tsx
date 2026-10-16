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

type Stats = { played: number; hosted: number; upcoming: number };

// player_stats view'ından gelen özet. Hiç puan yoksa ortalamalar null döner.
type RatingSummary = {
  rating_count: number;
  overall: number | null;
  punctuality: number | null;
  fair_play: number | null;
  communication: number | null;
  sportsmanship: number | null;
};

// player_sport_stats view'ından gelen spor bazlı seviye.
type SportLevel = {
  sport_id: string;
  sport_name: string;
  matches_played: number;
  avg_rating: number | null;
  level: 'beginner' | 'intermediate' | 'advanced';
};

// Veritabanı kodları ekranda Türkçe görünür.
const LEVEL_LABELS: Record<SportLevel['level'], string> = {
  beginner: 'Başlangıç',
  intermediate: 'Orta',
  advanced: 'İleri',
};

export default function ProfileScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [stats, setStats] = useState<Stats>({ played: 0, hosted: 0, upcoming: 0 });
  const [ratings, setRatings] = useState<RatingSummary | null>(null);
  const [sportLevels, setSportLevels] = useState<SportLevel[]>([]);
  const [loading, setLoading] = useState(true);

  // Düzenleme modu: isim ve açıklama birlikte düzenlenir.
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    setUserId(uid);

    // 1) İsim ve açıklama. Telefon numarası bu tabloda yok (bilinçli karar).
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, bio')
      .eq('id', uid)
      .single();

    if (profileError) {
      console.log('Profil çekilirken hata:', profileError.message);
    } else {
      setFullName(profile.full_name);
      setBio(profile.bio ?? '');
    }

    // 2) Puan özeti. View, her profil için bir satır döner (puan yoksa
    // rating_count 0 ve ortalamalar null).
    const { data: summary, error: summaryError } = await supabase
      .from('player_stats')
      .select('rating_count, overall, punctuality, fair_play, communication, sportsmanship')
      .eq('user_id', uid)
      .maybeSingle();

    if (summaryError) {
      console.log('Puanlar çekilirken hata:', summaryError.message);
    } else {
      setRatings(summary);
    }

    // 3) Spor bazlı seviyeler.
    const { data: levels, error: levelsError } = await supabase
      .from('player_sport_stats')
      .select('sport_id, sport_name, matches_played, avg_rating, level')
      .eq('user_id', uid)
      .order('matches_played', { ascending: false });

    if (levelsError) {
      console.log('Seviyeler çekilirken hata:', levelsError.message);
    } else {
      setSportLevels((levels ?? []) as SportLevel[]);
    }

    // 4) Maç istatistikleri: onaylı olduğum maçlar (kaptan da onaylı bir satır).
    const { data: rows, error: rowsError } = await supabase
      .from('activity_participants')
      .select('activity_id')
      .eq('user_id', uid)
      .eq('status', 'approved');

    if (rowsError || !rows || rows.length === 0) {
      setStats({ played: 0, hosted: 0, upcoming: 0 });
      return;
    }

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

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadProfile().finally(() => setLoading(false));
    }, [loadProfile])
  );

  function startEditing() {
    setDraftName(fullName);
    setDraftBio(bio);
    setEditing(true);
  }

  async function saveProfile() {
    const name = draftName.trim();
    const newBio = draftBio.trim();

    // Aynı kurallar veritabanında da var (profiles_full_name_length,
    // profiles_bio_length). Burada kontrol etmemizin sebebi kullanıcıya
    // anlaşılır mesaj göstermek, asıl güvence veritabanındaki kural.
    if (name.length < 2 || name.length > 40) {
      Alert.alert('Geçersiz isim', 'İsmin 2 ile 40 karakter arasında olmalı.');
      return;
    }
    if (newBio.length > 200) {
      Alert.alert('Açıklama çok uzun', 'Açıklama en fazla 200 karakter olabilir.');
      return;
    }
    if (!userId) return;

    setSaving(true);

    // .select('id') şart: güncelleme hiçbir satıra uymazsa Supabase hata
    // vermez, sadece boş sonuç döner. Dönen satırı kontrol ederek
    // "gerçekten kaydedildi mi" diye emin oluyoruz.
    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name: name, bio: newBio === '' ? null : newBio })
      .eq('id', userId)
      .select('id');

    setSaving(false);

    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    if (!data || data.length === 0) {
      Alert.alert('Hata', 'Profil kaydedilemedi, tekrar dene.');
      return;
    }

    setFullName(name);
    setBio(newBio);
    setEditing(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  const hasRatings = ratings !== null && ratings.rating_count > 0;

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
                {/* İSİM VE AÇIKLAMA */}
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
                      <TextInput
                        style={[styles.input, styles.bioInput]}
                        value={draftBio}
                        onChangeText={setDraftBio}
                        placeholder="Kısa açıklama (örn. hangi pozisyonda oynarsın, ne zaman müsaitsin)"
                        placeholderTextColor="#8B9284"
                        maxLength={200}
                        multiline
                      />
                      <ThemedView style={styles.editActions}>
                        <TouchableOpacity onPress={() => setEditing(false)} disabled={saving}>
                          <ThemedText style={styles.cancelText}>Vazgeç</ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={saveProfile} disabled={saving}>
                          <ThemedText style={styles.saveText}>
                            {saving ? 'Kaydediliyor…' : 'Kaydet'}
                          </ThemedText>
                        </TouchableOpacity>
                      </ThemedView>
                    </>
                  ) : (
                    <>
                      <ThemedView style={styles.nameRow}>
                        <ThemedText type="subtitle" style={styles.nameText}>{fullName}</ThemedText>
                        <TouchableOpacity onPress={startEditing}>
                          <ThemedText style={styles.editLink}>Düzenle</ThemedText>
                        </TouchableOpacity>
                      </ThemedView>
                      <ThemedText type="small" style={styles.bioText}>
                        {bio !== '' ? bio : 'Henüz bir açıklama eklemedin.'}
                      </ThemedText>
                    </>
                  )}
                </ThemedView>

                {/* MAÇ İSTATİSTİKLERİ */}
                <ThemedView style={styles.statsRow}>
                  <StatBox label="Oynanan maç" value={String(stats.played)} />
                  <StatBox label="Açtığın maç" value={String(stats.hosted)} />
                  <StatBox label="Yaklaşan" value={String(stats.upcoming)} />
                </ThemedView>

                {/* PUANLAR: diğer oyuncuların sana verdiği dört boyutlu ortalama */}
                <ThemedText type="smallBold" style={styles.sectionTitle}>Puanların</ThemedText>
                {hasRatings && ratings ? (
                  <>
                    <ThemedText type="small" style={styles.overallText}>
                      ⭐ {ratings.overall} genel ortalama · {ratings.rating_count} puan
                    </ThemedText>
                    <ThemedView style={styles.ratingsGrid}>
                      <StatBox label="Dakiklik" value={String(ratings.punctuality)} wide />
                      <StatBox label="Fair play" value={String(ratings.fair_play)} wide />
                      <StatBox label="İletişim" value={String(ratings.communication)} wide />
                      <StatBox label="Sportmenlik" value={String(ratings.sportsmanship)} wide />
                    </ThemedView>
                  </>
                ) : (
                  <ThemedText type="small" style={styles.emptyText}>
                    Henüz puanın yok. Maçlardan sonra diğer oyuncular seni puanlayacak.
                  </ThemedText>
                )}

                {/* SEVİYELER: otomatik hesaplanır, kendin seçemezsin */}
                <ThemedText type="smallBold" style={styles.sectionTitle}>Seviyelerin</ThemedText>
                {sportLevels.length > 0 ? (
                  sportLevels.map((s) => (
                    <ThemedView key={s.sport_id} style={styles.levelRow}>
                      <ThemedView>
                        <ThemedText type="small">{s.sport_name}</ThemedText>
                        <ThemedText type="small" style={styles.levelMeta}>
                          {s.matches_played} maç
                          {s.avg_rating !== null ? ` · ⭐ ${s.avg_rating}` : ''}
                        </ThemedText>
                      </ThemedView>
                      <ThemedView style={styles.levelBadge}>
                        <ThemedText type="small" style={styles.levelBadgeText}>
                          {LEVEL_LABELS[s.level]}
                        </ThemedText>
                      </ThemedView>
                    </ThemedView>
                  ))
                ) : (
                  <ThemedText type="small" style={styles.emptyText}>
                    Seviyen, maç oynadıkça ve puan aldıkça otomatik hesaplanır.
                  </ThemedText>
                )}
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

// Tek bir sayı kutusu (istatistik ve puan için ortak). wide=true iken
// iki sütunlu puan ızgarasında yarım genişlik kaplar.
function StatBox({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <ThemedView style={[styles.statBox, wide && styles.statBoxWide]}>
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
  bioText: { marginTop: 8, color: '#8B9284' },
  editLink: { color: '#2F5233', fontWeight: '600' },
  // Renkler sabit: koyu temada yazı, beyaz zeminde görünmez olmasın.
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1B2119',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  bioInput: { minHeight: 80, textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 4 },
  cancelText: { color: '#8B9284', fontWeight: '600' },
  saveText: { color: '#2F5233', fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  statBox: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statBoxWide: { flexBasis: '47%', flexGrow: 1 },
  sectionTitle: { marginTop: 8, marginBottom: 8 },
  overallText: { marginBottom: 10 },
  ratingsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  emptyText: { color: '#8B9284', marginBottom: 16 },
  levelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  levelMeta: { color: '#8B9284', marginTop: 2 },
  levelBadge: { backgroundColor: '#2F5233', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  levelBadgeText: { color: '#fff', fontWeight: '600' },
  logoutButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 40,
  },
  logoutText: { color: '#B3452E', fontWeight: '600' },
});