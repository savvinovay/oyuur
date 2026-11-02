// oyuur://tree/<id> — a tap on a widget (OYUUR-39, спец 5.1): the home screen on that tree.
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function TreeLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/', params: id ? { tree: id } : {} }} />;
}
