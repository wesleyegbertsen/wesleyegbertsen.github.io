import type { FsData } from '../fs.ts';
import { MAP, SECTION_STARTS } from './map.ts';

export type Section = { id: 'experience' | 'education' | 'projects' | 'contact'; label: string; start: number };
export type Item = { col: number; row: number; label: string; section: Section['id'] };
export type Checkpoint = { col: number; row: number; section: string };

/** The parsed level: plain tiles (no markers) plus the things that sit on them. */
export type Level = {
  tiles: readonly string[];
  width: number;
  height: number;
  start: { col: number; row: number };
  flag: { col: number; row: number };
  sections: readonly Section[];
  checkpoints: readonly Checkpoint[];
  items: readonly Item[];
};

/** A company name without the "(part of ...)" note, so one employer is one item. */
const employer = (company: string) => company.replace(/\s*\(.*\)$/, '');
const unique = (values: string[]) => [...new Set(values)];

/** The labels of each section, from the site's data. */
export function labelsFrom(data: FsData): Record<Section['id'], string[]> {
  return {
    experience: unique(data.experience.map((job) => employer(job.company))),
    education: unique(data.education.map((school) => school.school)),
    projects: unique(data.projects.map((project) => project.name)),
    contact: [],
  };
}

const sectionOf = (col: number): Section => {
  const sections = SECTION_STARTS;
  return [...sections].reverse().find((section) => col >= section.start) ?? sections[0];
};

/** Parses the map and labels its item slots, in order, from the data. Throws when a section has fewer slots than labels. */
export function buildLevel(data: FsData, map: readonly string[] = MAP): Level {
  const width = map[0]?.length ?? 0;
  const labels = labelsFrom(data);
  const used: Record<string, number> = {};
  const items: Item[] = [];
  const checkpoints: Checkpoint[] = [];
  let start = { col: 0, row: 0 };
  let flag = { col: 0, row: 0 };

  // Slots are numbered section by section, left to right, so a label lands in the next free slot of its section.
  const slots: { col: number; row: number }[] = [];
  const tiles = map.map((line, row) =>
    [...line]
      .map((char, col) => {
        if (char === '@') start = { col, row };
        if (char === 'F') flag = { col, row };
        if (char === '|') checkpoints.push({ col, row, section: sectionOf(col).label });
        if (char === '*') slots.push({ col, row });
        return char === '@' || char === '*' ? ' ' : char;
      })
      .join(''),
  );
  slots.sort((a, b) => a.col - b.col || a.row - b.row);

  for (const slot of slots) {
    const section = sectionOf(slot.col);
    const index = used[section.id] ?? 0;
    const label = labels[section.id][index];
    used[section.id] = index + 1;
    if (label !== undefined) items.push({ ...slot, label, section: section.id });
  }
  for (const section of SECTION_STARTS) {
    const missing = labels[section.id].length - (used[section.id] ?? 0);
    if (missing > 0) throw new Error(`Level section '${section.id}' has ${missing} too few item slots`);
  }

  return { tiles, width, height: map.length, start, flag, sections: SECTION_STARTS, checkpoints, items };
}
