// "Create an account" once, by itself (спец-друзья 3.1), but not before the person has a tree:
// first planting and the first watering, then the offer. Mounted on the main screen, it waits
// until some tree has been watered and nothing else is going on there — the watering's
// celebration and acorn flight are over, the "new achievement" toast has come and gone, no
// sheet or menu is up — then opens /account with "Later". Marked as seen when it opens, so it
// never comes back by itself; "Friends", "Leaders" (their "Sign in to add friends" also marks
// it seen, see SignInGate) and Settings still lead there.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { acornFlights } from '@/ui/acorns';
import { onAcornsChange } from '@/ui/acorns/bus';
import { href } from './parts';

/** A beat after the main screen settles, so the prompt doesn't cover its first look. */
const WAIT = 900;

export function AccountPrompt({ allowed }: {
  /** The main screen is quiet: no watering, menu, sheet, dialog or toast. */
  allowed: boolean;
}) {
  const { ready: storeReady, trees } = useStore();
  const { ready, account, promptSeen, markPromptSeen } = useFriends();
  const [flying, setFlying] = useState(() => acornFlights.busy());
  useEffect(() => onAcornsChange(() => setFlying(acornFlights.busy())), []);
  // Some tree was watered at least once: the person has seen what the app is about.
  const watered = trees.some((x) => x.checkins.length > 0);
  const due = storeReady && ready && !account && !promptSeen && watered;
  useEffect(() => {
    if (!due || !allowed || flying) return;
    const id = setTimeout(() => {
      markPromptSeen();
      router.push(href('/account', { from: 'first' }));
    }, WAIT);
    return () => clearTimeout(id);
    // markPromptSeen is a new function every render of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, allowed, flying]);
  return null;
}
