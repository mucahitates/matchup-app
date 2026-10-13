// ---------------------------------------------------------------
// IMPORT'LAR
// ---------------------------------------------------------------
import { useEffect, useState } from 'react';

// expo-router'dan gelenler:
// - Stack: ekranları bir "geçmiş yığını" (back stack) olarak yönetir.
//   Android'deki Activity back stack'ine benzer: yeni ekran üstüne
//   eklenir, geri basınca üstteki çıkar ve alttaki görünür.
// - Redirect: render sırasında "şuraya git" diyen deklaratif yönlendirme
//   (router.replace'in useEffect içinde sessizce başarısız olma sorunu
//   yüzünden bunu seçmiştik).
// - useSegments: şu an hangi route grubunda olduğumuzu söyler
//   (örn. ['(auth)', 'phone'] ya da ['(tabs)']).
import { DarkTheme, DefaultTheme, ThemeProvider, Stack, Redirect, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
// supabase client'ı src/lib/supabase.ts'te kurduk; oturum bilgisini
// (giriş yapmış mı?) buradan soruyoruz.
import { supabase } from '@/lib/supabase';

// Uygulama açılırken splash screen'i, biz "hazırım" diyene kadar
// ekranda tut (oturum kontrolü bitmeden ana ekran flash etmesin).
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Telefon açık mı koyu temada? ThemeProvider'a bunu vereceğiz.
  const colorScheme = useColorScheme();

  // session: giriş yapmış kullanıcının oturumu. null ise kimse giriş yapmamış.
  // Bu bilgiyi EN ÜSTTE tutuyoruz çünkü "giriş yaptı mı" sorusu tüm
  // uygulamanın hangi ekranları göstereceğini belirliyor.
  const [session, setSession] = useState<Session | null>(null);

  // Uygulama ilk açıldığında oturum kontrolü bitene kadar true kalır.
  // Bu süre boyunca hiçbir şey çizmiyoruz (aşağıda return null).
  const [checkingSession, setCheckingSession] = useState(true);

  // Şu anki konumumuz: (auth) grubunda mıyız, (tabs) grubunda mı?
  const segments = useSegments();

  useEffect(() => {
    // 1) Uygulama açılınca: telefonda kayıtlı bir oturum var mı diye sor.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });

    // 2) Oturum durumu her değiştiğinde (kod doğrulanınca giriş,
    //    Profile'daki "Çıkış Yap" ile çıkış) bu fonksiyon otomatik çalışır.
    //    Böylece verify.tsx ya da profile.tsx içinde elle yönlendirme
    //    yazmamıza gerek kalmıyor, aşağıdaki Redirect kuralları devreye giriyor.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    // Bu bileşen kapanırsa dinleyiciyi bırak (bellek sızıntısı olmasın).
    return () => listener.subscription.unsubscribe();
  }, []);

  // Oturum kontrolü bitmeden hiçbir şey çizme.
  if (checkingSession) return null;

  const inAuthGroup = segments[0] === '(auth)';

  // KURAL 1: Giriş yapmamış biri giriş ekranlarında değilse
  // (örn. direkt tab bar'a düşmüşse) telefon ekranına gönder.
  if (!session && !inAuthGroup) {
    return <Redirect href="/(auth)/phone" />;
  }

  // KURAL 2: Giriş yapmış biri hâlâ giriş ekranındaysa (kod doğrulama
  // sonrası) ana uygulamaya gönder. "as any": typed-routes bu path'i
  // henüz tanımadığı için TypeScript uyarısını susturuyoruz (çalışmayı etkilemiyor).
  if (session && inAuthGroup) {
    return <Redirect href={'/(tabs)' as any} />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />

      {/* Slot yerine Stack kullanmamızın sebebi: Slot sadece "şu an aktif
          olan route'u çiz" der, geçmiş tutmaz. Bu yüzden detay ekranına
          gidince geri dönemiyorduk ve tab bar kayboluyordu. Stack ise
          ekranları üst üste dizer ve geri butonunu otomatik üretir.

          screenOptions headerShown:false -> varsayılan olarak hiçbir
          ekranda üst başlık çıkmasın. (auth) ve (tabs) kendi
          tasarımlarını yönetiyor, çift başlık olmasın. */}
      <Stack screenOptions={{ headerShown: false }}>

        {/* name, src/app altındaki klasör/dosya adıyla birebir aynı olmak
            zorunda. (auth) -> src/app/(auth)/ klasörü (phone, verify) */}
        <Stack.Screen name="(auth)" />

        {/* (tabs) -> src/app/(tabs)/ klasörü. İçindeki 4 sekmeyi
            (tabs)/_layout.tsx yönetiyor. */}
        <Stack.Screen name="(tabs)" />

        {/* activity/[id] -> src/app/activity/[id].tsx (Match Detail).
            Bu ekran sekmelerin ÜSTÜNE açılır. Sadece burada başlığı
            açıyoruz (headerShown:true) çünkü geri okunu bu başlık taşıyor.
            title: başlıkta yazacak metin, headerBackTitle: iOS'ta geri
            okunun yanındaki yazı. */}
        <Stack.Screen
          name="activity/[id]"
          options={{ headerShown: true, title: 'Aktivite', headerBackTitle: 'Geri' }}
        />
      </Stack>
    </ThemeProvider>
  );
}