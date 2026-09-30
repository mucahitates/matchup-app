import { useLocalSearchParams } from 'expo-router';

import MatchDetailScreen from '@/features/activities/components/MatchDetailScreen';

// [id].tsx dosya adındaki köşeli parantez, bu route'un dinamik
// olduğunu söylüyor - yani /activity/123, /activity/456 gibi
// farklı id'lerle aynı dosya çalışır. useLocalSearchParams,
// URL'deki o id'yi okumamızı sağlıyor.
export default function ActivityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MatchDetailScreen activityId={id} />;
}