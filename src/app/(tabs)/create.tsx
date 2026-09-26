// Bu dosya, Expo Router'ın "route" olarak tanıdığı dosya —
// dosya adı (create.tsx) tab bar'daki name="create" ile eşleşecek.
// İçinde GERÇEK ekran kodu YOK, sadece asıl ekrana yönlendiriyor.
// Neden: route dosyalarını "ince" tutup, gerçek iş mantığını
// features/ klasöründe toplamak için (bkz. Discover ekranında da aynı desen).
import CreateActivityScreen from '@/features/activities/components/CreateActivityScreen';

export default function Create() {
  return <CreateActivityScreen />;
}