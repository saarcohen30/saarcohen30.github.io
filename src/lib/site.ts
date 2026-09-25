// Build-time data access for pages. `?raw` imports keep Vite watching the YAML in dev.
import { parse } from 'yaml';
import profileText from '../data/profile.yaml?raw';
import pubsText from '../data/publications.yaml?raw';
import { loadPublications } from './pubs/index.mjs';

import { relatedTo as related } from './pubs/index.mjs';
export { TYPE_META, STATUS_META, LINK_META, PRESENTATION_META, citationText, bibtex, yearsOf, typeCounts, groupByYear } from './pubs/index.mjs';

export const profile = parse(profileText);
export const topicIds = Object.keys(profile.topics);
for (const t of profile.themes)
  for (const topic of t.topics)
    if (!topicIds.includes(topic)) throw new Error(`profile.yaml: theme "${t.id}" uses unknown topic "${topic}"`);
export const publications = loadPublications(pubsText, { topics: topicIds });
export type Publication = (typeof publications)[number];

export const SITE_URL = 'https://saarcohen30.github.io';
export const BUILD_DATE = new Date();

/** Minimal inline Markdown: escapes HTML, then renders [text](url) links and *emphasis*. */
export function inlineMd(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

/** True for the site owner, so their name can be highlighted in author lists. */
export const isMe = (name: string) => name === profile.name;

export type Theme = { id: string; title: string; areas: string[]; topics: string[]; summary: string };
export const themes: Theme[] = profile.themes;

/** Papers in a research theme (shares one of its topics): accepted work first, newest first. */
export const pubsForTheme = (theme: Theme) => {
  const on = publications.filter((p) => p.topics.some((t) => theme.topics.includes(t)));
  return [...on.filter((p) => p.isAccepted), ...on.filter((p) => !p.isAccepted)];
};

export const relatedTo = (pub: Publication, limit = 3) => related(pub, publications, limit);
