import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  // 'unspecified' durumunda (bazı Android cihazlarda olur) varsayılan olarak
  // 'light' temayı kullan — Colors objesinde 'unspecified' diye bir anahtar yok.
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>

      {/* name="index" -> src/app/index.tsx dosyasına karşılık gelir (Discover ekranımız) */}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Discover</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      {/* name="create" -> src/app/create.tsx dosyasına karşılık gelir (yeni eklediğimiz ekran).
          Şimdilik ikon YOK (bilinçli kararımız), sadece yazı (Label) gösteriyoruz.
          İkonu ileride ekleyeceğiz, tab bar bu şekilde de çalışır. */}
      <NativeTabs.Trigger name="create">
        <NativeTabs.Trigger.Label>Create</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* name="explore" -> src/app/explore.tsx (Expo'nun demo ekranı).
          Bunu bir sonraki adımda "My Matches" ekranına çevireceğiz,
          şimdilik dokunmuyoruz. */}
      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}