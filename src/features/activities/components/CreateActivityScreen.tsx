import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ThemedText ve ThemedView, açık/koyu tema desteğini otomatik hallediyor.
// Kendi Text/View yazmak yerine bunları kullanıyoruz ki tema mantığını
// her ekranda tekrar yazmayalım.
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// Bu, "Aktivite Oluştur" ekranının GERÇEK yaşadığı yer.
// app/create.tsx dosyası buraya sadece işaret edecek (ince köprü).
export default function CreateActivityScreen() {
  return (
    // ThemedView = ekranın dış kutusu (arka plan rengi tema ile değişir)
    <ThemedView style={styles.container}>
      {/* SafeAreaView = telefonun çentik/durum çubuğu alanına içerik çarpmasın diye */}
      <SafeAreaView>
        <ThemedText type="title">🎯 Aktivite Oluştur</ThemedText>
        <ThemedText>Spor seçimi, tarih, konum burada olacak.</ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

// Görsel ayarlar (Android'deki XML layout'un JS karşılığı gibi düşün)
const styles = StyleSheet.create({
  container: {
    flex: 1, // ekranın tamamını kapla
    padding: 20, // kenarlardan 20 birim boşluk bırak
  },
});