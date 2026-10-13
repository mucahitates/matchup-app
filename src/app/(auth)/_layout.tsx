// Bu dosya (auth) klasörünü Expo Router'a "tek bir grup" olarak tanıtır.
// Dosya olmayınca router, klasörün içindeki phone ve verify sayfalarını
// tek tek kaydediyordu ve kök _layout.tsx'teki
// <Stack.Screen name="(auth)" /> satırı bu yüzden uyarı veriyordu.
// (tabs) klasöründe de aynı sebeple bir _layout.tsx var.
import { Stack } from 'expo-router';

export default function AuthLayout() {
  // Stack: phone -> verify geçişini bir geçmiş yığını olarak yönetir.
  // Bunun yan faydası: verify ekranında yanlış numara girdiysen geri
  // gesti/oku ile phone ekranına dönebilirsin (daha önce dönemezdin).
  // headerShown: false -> iki ekran da kendi başlığını çiziyor, çift
  // başlık çıkmasın.
  return <Stack screenOptions={{ headerShown: false }} />;
}