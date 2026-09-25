// /publications.bib — every paper as BibTeX, generated from publications.yaml.
import type { APIRoute } from 'astro';
import { publications, bibtex, profile } from '../lib/site';

export const GET: APIRoute = () =>
  new Response(`% Publications of ${profile.name} — https://saarcohen30.github.io/publications/\n\n${publications.map(bibtex).join('\n\n')}\n`, {
    headers: { 'Content-Type': 'application/x-bibtex; charset=utf-8' },
  });
