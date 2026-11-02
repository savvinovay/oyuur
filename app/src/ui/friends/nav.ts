// Going to the friends screens. The typed routes list is built by the dev server, so new
// screens are reached by a plain path.
import { Href, router } from 'expo-router';

export const go = (path: string) => router.push(path as Href);

export const friendPath = (nick: string) => `/friend?nick=${encodeURIComponent(nick)}`;

export const friendForestPath = (nick: string, lineageId?: string) =>
  `/forest?friend=${encodeURIComponent(nick)}${lineageId ? `&tree=${encodeURIComponent(lineageId)}` : ''}`;
