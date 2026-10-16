import { useEffect, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------
// Maç sonrası "oyuncuları puanla" bölümü. MatchDetailScreen, sadece
// maç oynandıysa ve ben o maça katıldıysam bu bileşeni gösterir.
// Asıl güvence veritabanındadır (fn_validate_rating); burası sadece
// kullanıcıya kolay bir arayüz sunar.
// ---------------------------------------------------------------

type Player = { user_id: string; full_name: string };

// Dört puan boyutu. key değerleri ratings tablosundaki kolon adlarıdır,
// label ekranda görünen Türkçe isimdir.
const DIMENSIONS = [
  { key: 'punctuality', label: 'Dakiklik' },
  { key: 'fair_play', label: 'Fair play' },
  { key: 'communication', label: 'İletişim' },
  { key: 'sportsmanship', label: 'Sportmenlik' },
] as const;

type DimensionKey = (typeof DIMENSIONS)[number]['key'];
type Scores = Partial<Record<DimensionKey, number>>;

type Props = {
  activityId: string;
  currentUserId: string;
  // Puanlanabilecek diğer oyuncular (kendim hariç, onaylı olanlar).
  players: Player[];
};

export default function RatePlayersSection({ activityId, currentUserId, players }: Props) {
  // Bu maçta daha önce puan verdiğim oyuncuların id'leri.
  const [ratedIds, setRatedIds] = useState<string[]>([]);
  // Şu an puan formu açık olan oyuncu (aynı anda tek form açık).
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);
  const [scores, setScores] = useState<Scores>({});
  const [submitting, setSubmitting] = useState(false);

  // Daha önce verdiğim puanları çek. RLS gereği ratings tablosundan
  // zaten sadece kendi verdiğim puanlar döner.
  useEffect(() => {
    async function loadMyRatings() {
      const { data, error } = await supabase
        .from('ratings')
        .select('ratee_id')
        .eq('activity_id', activityId)
        .eq('rater_id', currentUserId);

      if (error) {
        console.log('Puanlar çekilirken hata:', error.message);
      } else {
        setRatedIds((data ?? []).map((r) => r.ratee_id));
      }
    }
    loadMyRatings();
  }, [activityId, currentUserId]);

  function openForm(playerId: string) {
    setOpenPlayerId(playerId);
    setScores({}); // her oyuncu için temiz başla
  }

  async function submitRating(player: Player) {
    // Dört boyutun hepsi seçilmeden gönderilmez.
    const complete = DIMENSIONS.every((d) => scores[d.key] !== undefined);
    if (!complete) {
      Alert.alert('Eksik puan', 'Dört başlığı da puanla.');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('ratings').insert({
      activity_id: activityId,
      rater_id: currentUserId,
      ratee_id: player.user_id,
      punctuality: scores.punctuality,
      fair_play: scores.fair_play,
      communication: scores.communication,
      sportsmanship: scores.sportsmanship,
    });
    setSubmitting(false);

    if (error) {
      // Veritabanı kuralları (maç oynanmadı, zaten puanladın vb.)
      // anlaşılır Türkçe mesajlarla buraya düşer.
      Alert.alert('Hata', error.message);
      return;
    }

    setRatedIds((prev) => [...prev, player.user_id]);
    setOpenPlayerId(null);
    setScores({});
  }

  return (
    <ThemedView>
      <ThemedText type="smallBold" style={styles.title}>Oyuncuları puanla</ThemedText>
      <ThemedText type="small" style={styles.note}>
        Puanların anonim: oyuncular kimin ne verdiğini görmez.
      </ThemedText>

      {players.length === 0 && (
        <ThemedText type="small">Puanlanacak başka oyuncu yok.</ThemedText>
      )}

      {players.map((player) => {
        const alreadyRated = ratedIds.includes(player.user_id);
        const isOpen = openPlayerId === player.user_id;

        return (
          <ThemedView key={player.user_id} style={styles.playerCard}>
            <ThemedView style={styles.playerRow}>
              <ThemedText type="small">{player.full_name}</ThemedText>
              {alreadyRated ? (
                <ThemedText type="small" style={styles.doneText}>✓ Puanlandı</ThemedText>
              ) : (
                <TouchableOpacity onPress={() => (isOpen ? setOpenPlayerId(null) : openForm(player.user_id))}>
                  <ThemedText style={styles.rateLink}>{isOpen ? 'Kapat' : 'Puanla'}</ThemedText>
                </TouchableOpacity>
              )}
            </ThemedView>

            {isOpen && !alreadyRated && (
              <ThemedView style={styles.form}>
                {DIMENSIONS.map((d) => (
                  <ThemedView key={d.key} style={styles.dimensionRow}>
                    <ThemedText type="small" style={styles.dimensionLabel}>{d.label}</ThemedText>
                    <ThemedView style={styles.scoreRow}>
                      {[1, 2, 3, 4, 5].map((n) => {
                        const selected = scores[d.key] === n;
                        return (
                          <TouchableOpacity
                            key={n}
                            style={[styles.scoreButton, selected && styles.scoreButtonSelected]}
                            onPress={() => setScores((prev) => ({ ...prev, [d.key]: n }))}>
                            <ThemedText type="small" style={selected ? styles.scoreTextSelected : undefined}>
                              {n}
                            </ThemedText>
                          </TouchableOpacity>
                        );
                      })}
                    </ThemedView>
                  </ThemedView>
                ))}

                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={() => submitRating(player)}
                  disabled={submitting}>
                  <ThemedText style={styles.submitText}>
                    {submitting ? 'Gönderiliyor…' : 'Puanı Gönder'}
                  </ThemedText>
                </TouchableOpacity>
              </ThemedView>
            )}
          </ThemedView>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 24, marginBottom: 4 },
  note: { marginBottom: 12, color: '#8B9284' },
  playerCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  playerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  doneText: { color: '#2F5233', fontWeight: '600' },
  rateLink: { color: '#2F5233', fontWeight: '700' },
  form: { marginTop: 12 },
  dimensionRow: { marginBottom: 12 },
  dimensionLabel: { marginBottom: 6 },
  scoreRow: { flexDirection: 'row', gap: 8 },
  scoreButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreButtonSelected: { backgroundColor: '#2F5233' },
  // Seçili butonda yazı beyaz: yeşil zeminde tema rengi görünmeyebilir.
  scoreTextSelected: { color: '#fff', fontWeight: '700' },
  submitButton: {
    backgroundColor: '#2F5233',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitText: { color: '#fff', fontWeight: '600' },
});