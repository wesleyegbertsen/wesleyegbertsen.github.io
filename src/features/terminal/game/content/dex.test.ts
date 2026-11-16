import { fold, wrap } from '../engine/text.ts';
import { AREAS, ENEMIES, FINAL_BOSSES } from './battles.ts';
import { DEX, DEX_AREAS, DEX_TEXT_LINES } from './dex.ts';
import { buildMaps } from './story.ts';
import { education } from '../../../../data/education.ts';
import { experience } from '../../../../data/experience.ts';
import { profile } from '../../../../data/profile.ts';
import { projects } from '../../../../data/projects.ts';
import { skills } from '../../../../data/skills.ts';

/** The enemies that live in the tall grass or the rubble somewhere: the wild ones. Every other one is a boss. */
const wild = new Set(Object.values(AREAS).flatMap((area) => area.enemies));

describe('the dex', () => {
  it('has every enemy of the game once, numbered 1 to 26 in its order, so a new monster cannot be forgotten', () => {
    expect(DEX.map((entry) => entry.enemy).sort()).toEqual(Object.keys(ENEMIES).sort());
    expect(new Set(DEX.map((entry) => entry.enemy)).size).toBe(DEX.length);
    expect(DEX).toHaveLength(26);
  });

  it('puts the wild ones first, by area, then the guardians, then the three of the last fight', () => {
    const kinds = DEX.map((entry) => (wild.has(entry.enemy) ? 'wild' : FINAL_BOSSES.includes(entry.enemy) ? 'final' : 'guard'));
    expect(kinds.join(' ')).toMatch(/^(wild )+(guard )+(final ?)+$/);
    expect(DEX.slice(-3).map((entry) => entry.enemy)).toEqual(FINAL_BOSSES);
    // The wild ones in the order of the areas they live in.
    const order = Object.keys(AREAS);
    const areaOf = (enemy: string) => order.findIndex((id) => AREAS[id]!.enemies.includes(enemy));
    const at = DEX.filter((entry) => wild.has(entry.enemy)).map((entry) => areaOf(entry.enemy));
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('says where a wild one lives, as a region of the world and never a building or a room; a boss is a BOSS', () => {
    // The names of the maps that are a building or a room: none of them may show up in an area.
    const maps = buildMaps({ profile, skills, experience, education, projects });
    const outdoors = new Set(Object.keys(AREAS));
    const rooms = maps.filter((map) => !outdoors.has(map.id)).flatMap((map) => [map.id, map.name ?? '']).filter((name) => name.length > 2);
    for (const entry of DEX) {
      if (wild.has(entry.enemy)) {
        expect(entry.boss, entry.enemy).toBeUndefined();
        expect(DEX_AREAS, entry.enemy).toContain(entry.area);
        // The area is the one of the map it lives on.
        const home = Object.keys(AREAS).find((id) => AREAS[id]!.enemies.includes(entry.enemy))!;
        expect(DEX_AREAS.indexOf(entry.area!), entry.enemy).toBe(Object.keys(AREAS).indexOf(home));
        for (const room of rooms) expect(entry.area!.toLowerCase(), `${entry.enemy} in ${room}`).not.toContain(room.toLowerCase());
      } else {
        expect(entry.boss, entry.enemy).toBe(true);
        expect(entry.area, entry.enemy).toBeUndefined();
      }
    }
  });

  it('has a short text for every one, that fits its page', () => {
    for (const entry of DEX) {
      expect(entry.text.length, entry.enemy).toBeGreaterThan(20);
      expect(wrap(fold(entry.text)).length, entry.enemy).toBeLessThanOrEqual(DEX_TEXT_LINES);
    }
    expect(new Set(DEX.map((entry) => entry.text)).size).toBe(DEX.length);
  });
});
