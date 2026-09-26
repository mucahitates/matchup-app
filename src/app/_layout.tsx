import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (checkingSession) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/phone');
    } else if (session && inAuthGroup) {
      // Tabs grubu içindeki ana sayfa yolu
      router.replace('/(tabs)/index');
    }
  }, [session, checkingSession, segments]);

  if (checkingSession) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {/* Artık koşulsuz - Slot her zaman "şu an aktif olan grubun
          layout'unu" gösterir: (auth) aktifse phone/verify, (tabs)
          aktifse yukarıda oluşturduğumuz (tabs)/_layout.tsx (yani AppTabs) */}
      <Slot />
    </ThemeProvider>
  );
}