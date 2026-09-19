import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  // 'unspecified' durumunda (bazı Android cihazlarda olur) varsayılan
  // olarak 'light' temayı kullan - Colors objesinde 'unspecified' diye
  // bir anahtar yok, bu yüzden bu kontrolü yapıyoruz.
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>

      {/* name="index" -> src/app/index.tsx dosyasına karşılık gelir.
          Bu bizim Discover (aktivite keşif) ekranımız. */}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Discover</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      {/* name="create" -> src/app/create.tsx dosyasına karşılık gelir.
          İkon şimdilik yok (bilinçli kararımız), sadece yazı (Label)
          gösteriyoruz - ikonu ileride ekleyeceğiz. */}
      <NativeTabs.Trigger name="create">
        <NativeTabs.Trigger.Label>Create</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* name="my-matches" -> src/app/my-matches.tsx dosyasına karşılık gelir.
          Expo'nun demo ekranı olan explore.tsx'in yerine geldi.
          İsim burada da dosya adıyla birebir eşleşmek zorunda. */}
      <NativeTabs.Trigger name="my-matches">
        <NativeTabs.Trigger.Label>My Matches</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* name="profile" -> src/app/profile.tsx dosyasına karşılık gelir.
          4. ve son sekmemiz - artık MatchUp'ın tüm tab bar iskeleti tamam. */}
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

    </NativeTabs>
  );
}