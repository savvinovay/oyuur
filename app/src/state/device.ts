// This phone's own id (OYUUR-30, Т2.3): 12 random letters made once, kept in `oyuur/device`.
// It marks this phone's changes in the hybrid clock (merge.ts) and its old acorns (`legacy:<id>`).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomBytes } from '@/net/kdf';

const KEY = 'oyuur/device';
const ABC = 'abcdefghijklmnopqrstuvwxyz0123456789';

let cached: string | null = null;

function makeId(): string {
  let bytes: Uint8Array;
  try {
    bytes = randomBytes(12);
  } catch {
    bytes = Uint8Array.from({ length: 12 }, () => Math.floor(Math.random() * 256));
  }
  return Array.from(bytes, (b) => ABC[b % ABC.length]).join('');
}

export async function loadDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved && /^[a-z0-9]{6,32}$/.test(saved)) return (cached = saved);
  } catch {
    // Unreadable storage: a fresh id for this session is still unique enough.
  }
  cached = makeId();
  AsyncStorage.setItem(KEY, cached).catch(() => {});
  return cached;
}
