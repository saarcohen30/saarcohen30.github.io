// Build-time data access for pages. `?raw` imports keep Vite watching the YAML in dev.
import { parse } from 'yaml';
import profileText from '../data/profile.yaml?raw';
import pubsText from '../data/publications.yaml?raw';
import { loadPublications } from './pubs/index.mjs';

export { TYPE_META, STATUS_META, LINK_META, citationText, bibtex, yearsOf, typeCounts, groupByYear } from './pubs/index.mjs';

export const profile = parse(profileText);
export const publications = loadPublications(pubsText, { topics: profile.themes.map((t: { id: string }) => t.id) });
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

export const stripMd = (text: string) => text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*/g, '');

/** True for the site owner, so their name can be highlighted in author lists. */
export const isMe = (name: string) => name === profile.name;

/** Papers on a topic: published work first (newest first), then working papers. */
export const pubsForTopic = (topic: string) => {
  const on = publications.filter((p) => p.topics.includes(topic));
  return [...on.filter((p) => !p.isWorkingPaper), ...on.filter((p) => p.isWorkingPaper)];
};

export const yearRange = () => {
  const years = publications.filter((p) => p.year).map((p) => p.year as number);
  return [Math.min(...years), Math.max(...years)];
};
