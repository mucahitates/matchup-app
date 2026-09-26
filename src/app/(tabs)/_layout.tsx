import AppTabs from '@/components/app-tabs';

// Bu layout, SADECE tab bar'ı yönetiyor - (auth) grubundan tamamen
// habersiz. NativeTabs artık kendi kapsamında (sadece index/create/
// my-matches/profile arasında), (auth)/phone ile hiç çakışmıyor.
export default function TabsLayout() {
  return <AppTabs />;
}