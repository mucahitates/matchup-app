import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// process.env.EXPO_PUBLIC_... -> Expo, ismi "EXPO_PUBLIC_" ile başlayan
// .env değişkenlerini otomatik olarak mobil uygulamaya (build zamanında)
// gömer. Bu sayede gizli anahtarları kod içine YAZMADAN, .env dosyasından
// okuyabiliyoruz (ve .env zaten .gitignore'da olduğu için GitHub'a gitmiyor).
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});