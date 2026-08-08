import { describe, expect, it } from 'vitest';

import {
  ARTICLE_KEYBOARD_COMMAND,
  getArticleKeyboardCommand,
  isArticleKeyboardEventEligible
} from '../src/services/articleKeyboardCommands.js';

describe('articleKeyboardCommands', () => {
  // Verifies every shared key maps to a stable semantic article command.
  it.each([
    ['ArrowDown', ARTICLE_KEYBOARD_COMMAND.NEXT],
    ['j', ARTICLE_KEYBOARD_COMMAND.NEXT],
    ['ArrowUp', ARTICLE_KEYBOARD_COMMAND.PREVIOUS],
    ['k', ARTICLE_KEYBOARD_COMMAND.PREVIOUS],
    ['Enter', ARTICLE_KEYBOARD_COMMAND.OPEN],
    ['o', ARTICLE_KEYBOARD_COMMAND.OPEN],
    ['m', ARTICLE_KEYBOARD_COMMAND.TOGGLE_READ],
    ['r', ARTICLE_KEYBOARD_COMMAND.TOGGLE_READ],
    ['s', ARTICLE_KEYBOARD_COMMAND.TOGGLE_FAVORITE]
  ])('maps %s to %s', (key, command) => {
    expect(getArticleKeyboardCommand({ key, target: document.body })).toBe(command);
  });

  // Verifies unrelated and uppercase keys remain outside the article command vocabulary.
  it('returns no command for unsupported keys', () => {
    expect(getArticleKeyboardCommand({ key: 'x', target: document.body })).toBeNull();
    expect(getArticleKeyboardCommand({ key: 'J', shiftKey: true, target: document.body })).toBeNull();
  });

  // Verifies modifiers and application controls suppress article shortcuts by default.
  it.each([
    ['Alt', { altKey: true, target: document.body }],
    ['Control', { ctrlKey: true, target: document.body }],
    ['Meta', { metaKey: true, target: document.body }],
    ['Shift', { shiftKey: true, target: document.body }],
    ['input', { target: document.createElement('input') }],
    ['textarea', { target: document.createElement('textarea') }],
    ['select', { target: document.createElement('select') }],
    ['link', { target: document.createElement('a') }],
    ['button', { target: document.createElement('button') }]
  ])('rejects %s events', (_label, event) => {
    expect(isArticleKeyboardEventEligible(event)).toBe(false);
  });

  // Verifies publisher or editor descendants cannot leak article commands to the window listener.
  it('rejects descendants of editable content when ancestor checks are enabled', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editable.appendChild(child);

    expect(isArticleKeyboardEventEligible({ target: child })).toBe(false);
    expect(isArticleKeyboardEventEligible(
      { target: child },
      { checkEditableAncestors: false }
    )).toBe(true);
  });

  // Verifies layout profiles can preserve intentionally eligible Shift and row-control events.
  it('supports explicit layout eligibility exceptions', () => {
    const button = document.createElement('button');

    expect(isArticleKeyboardEventEligible(
      { shiftKey: true, target: button },
      { allowShiftKey: true, allowInteractiveTarget: true }
    )).toBe(true);
  });
});
