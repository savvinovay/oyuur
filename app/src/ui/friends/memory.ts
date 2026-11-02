// What the friends screens remember on the phone besides the friends cache:
// - when "Requests" was last opened: newer requests are "new" (the red count, the "NEW" tag);
// - today's cheers, so "… cheered you on" stays until the day ends (спец-друзья 4.3) though the
//   inbox forgets a cheer once it is marked seen.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import type { DayKey } from '@/game/dates';
import type { CheerIn } from './model';

const KEY = 'oyuur/friends-seen';

interface Memory {
  requestsSeenAt: number;
  cheers: { day: DayKey; list: CheerIn[] } | null;
}

let memory: Memory = { requestsSeenAt: 0, cheers: null };
let loaded = false;
const listeners = new Set<(m: Memory) => void>();

function set(next: Memory) {
  memory = next;
  listeners.forEach((l) => l(memory));
  AsyncStorage.setItem(KEY, JSON.stringify(memory)).catch(() => {});
}

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((s) => {
      if (!s) return;
      memory = { ...memory, ...(JSON.parse(s) as Partial<Memory>) };
      listeners.forEach((l) => l(memory));
    })
    .catch(() => {});
}

export function useFriendsMemory() {
  const [m, setM] = useState(memory);
  useEffect(() => {
    load();
    listeners.add(setM);
    setM(memory);
    return () => {
      listeners.delete(setM);
    };
  }, []);
  const requestsSeen = useCallback((at: number) => {
    if (memory.requestsSeenAt < at) set({ ...memory, requestsSeenAt: at });
  }, []);
  const rememberCheers = useCallback((day: DayKey, list: CheerIn[]) => {
    const same = memory.cheers?.day === day && JSON.stringify(memory.cheers.list) === JSON.stringify(list);
    if (!same) set({ ...memory, cheers: { day, list } });
  }, []);
  return { requestsSeenAt: m.requestsSeenAt, cheers: m.cheers, requestsSeen, rememberCheers };
}
