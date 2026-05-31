/**
 * tagSlug — slugify + round-trip lookup for IGDB tag values.
 */

import { describe, it, expect } from 'vitest';
import { slugifyTag, findTagBySlug } from '../tagSlug';

describe('slugifyTag', () => {
  it('lowercases + hyphenates ASCII tag names', () => {
    expect(slugifyTag('Action')).toBe('action');
    expect(slugifyTag('Real Time Strategy')).toBe('real-time-strategy');
  });

  it('strips parentheses and folds the inner words', () => {
    expect(slugifyTag('Role-playing (RPG)')).toBe('role-playing-rpg');
    expect(slugifyTag('Shooter (FPS)')).toBe('shooter-fps');
  });

  it('drops apostrophes WITHOUT inserting a hyphen', () => {
    expect(slugifyTag("Hack and slash/Beat 'em up")).toBe('hack-and-slash-beat-em-up');
    expect(slugifyTag("Don't Starve")).toBe('dont-starve');
  });

  it('collapses runs of non-alphanumeric chars to a single hyphen', () => {
    expect(slugifyTag('Action / Adventure')).toBe('action-adventure');
    expect(slugifyTag('Sci-Fi & Fantasy')).toBe('sci-fi-fantasy');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugifyTag('(parenthesised tag)')).toBe('parenthesised-tag');
    expect(slugifyTag('-leading-and-trailing-')).toBe('leading-and-trailing');
  });

  it('handles ALL-CAPS abbreviations', () => {
    expect(slugifyTag('JRPG')).toBe('jrpg');
  });

  it('returns empty string when input is purely non-alphanumeric', () => {
    expect(slugifyTag('(((')).toBe('');
  });
});

describe('findTagBySlug', () => {
  const tags = [
    'Action',
    'Role-playing (RPG)',
    "Hack and slash/Beat 'em up",
    'Sci-Fi',
    'Real Time Strategy',
  ];

  it('returns the canonical name for a matching slug', () => {
    expect(findTagBySlug(tags, 'action')).toBe('Action');
    expect(findTagBySlug(tags, 'role-playing-rpg')).toBe('Role-playing (RPG)');
    expect(findTagBySlug(tags, 'hack-and-slash-beat-em-up')).toBe("Hack and slash/Beat 'em up");
  });

  it('round-trips via slugifyTag for every entry', () => {
    for (const tag of tags) {
      expect(findTagBySlug(tags, slugifyTag(tag))).toBe(tag);
    }
  });

  it('returns null when the slug has no match', () => {
    expect(findTagBySlug(tags, 'nonexistent')).toBeNull();
    expect(findTagBySlug(tags, '')).toBeNull();
  });

  it('is case-insensitive on the slug input', () => {
    expect(findTagBySlug(tags, 'ACTION')).toBe('Action');
    expect(findTagBySlug(tags, 'Role-Playing-RPG')).toBe('Role-playing (RPG)');
  });
});
