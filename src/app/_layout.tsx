import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, Slot, Redirect, useSegments } from 'expo-router';
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

  if (checkingSession) return null;

  const inAuthGroup = segments[0] === '(auth)';

  // Deklaratif yönlendirme: router.replace() gibi "komut vermiyoruz",
  // render sırasında "burada olman gerekmiyor, şuraya git" diyoruz.
  // Bu, Expo Router'ın resmi olarak önerdiği auth-guard deseni -
  // imperative router.replace()'in useEffect içinde sessizce
  // başarısız olma riskini tamamen ortadan kaldırıyor.
  if (!session && !inAuthGroup) {
    return <Redirect href="/(auth)/phone" />;
  }
  if (session && inAuthGroup) {
    return <Redirect href={"/(tabs)" as any} />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Slot />
    </ThemeProvider>
  );
}