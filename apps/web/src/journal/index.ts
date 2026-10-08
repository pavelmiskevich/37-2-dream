import { RECENT_DREAMS, generateDream, summarizeDream } from '@dream/core';
import type { DreamEnding } from '../runtime';
import { mountJournalCard, type JournalCard } from './card';
import { cardFileName, journalCard } from './card-model';
import { freshSeed, nextDreamUrl, shareUrl } from './fresh';
import { saveCardPng } from './png';
import { createDreamJournal, type DreamJournal, type JournalEntry } from './storage';

export { cardFileName, cardTitle, journalCard, type CardBlock } from './card-model';
export { freshSeed, nextDreamUrl, shareUrl } from './fresh';
export { createDreamJournal, type DreamJournal, type JournalEntry } from './storage';

/** Copies `text`; false when the clipboard is unavailable or refused. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shows the card of `entry`: save it as a PNG, copy the link to the dream,
 * fall asleep again — into a new dream unlike the last ones of `journal`.
 */
export function showJournalCard(entry: JournalEntry, journal: DreamJournal): JournalCard {
  const blocks = journalCard(entry, generateDream(entry.seed));
  const link = shareUrl(entry.seed, window.location);
  document.documentElement.dataset.journal = String(entry.number);
  return mountJournalCard(blocks, {
    link,
    onSave: () => saveCardPng(blocks, cardFileName(entry)),
    onCopyLink: () => copyText(link),
    onSleepAgain: () => window.location.assign(nextDreamUrl(freshSeed(journal.recentSeeds(RECENT_DREAMS)), window.location)),
  });
}

/**
 * The dream is over (`startDream({ onDreamEnd })`, D-020): record it in the
 * journal and show its card. The final state carries everything the summary
 * needs — the reason, the temperature on waking up and the intrusions heard.
 */
export function showDreamJournal(ending: DreamEnding, journal: DreamJournal = createDreamJournal()): JournalCard {
  const summary = summarizeDream(ending.dream, { state: ending.state, startScene: ending.startScene });
  return showJournalCard(journal.record(summary, new Date()), journal);
}
