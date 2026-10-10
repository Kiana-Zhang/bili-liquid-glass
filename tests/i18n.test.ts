import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, MESSAGES, t } from '../src/i18n.ts';
import { DEFAULTS, normalizeSettings, SettingsStore } from '../src/settings.ts';

test('all four catalogs have the same keys and interpolation parameters', () => {
  for (const language of Object.keys(LANGUAGES) as (keyof typeof LANGUAGES)[]) {
    assert.deepEqual(Object.keys(MESSAGES[language]).sort(), Object.keys(MESSAGES.zh).sort());
    for (const key of Object.keys(MESSAGES.zh) as (keyof typeof MESSAGES.zh)[]) {
      assert.ok(MESSAGES[language][key].trim());
      assert.deepEqual(MESSAGES[language][key].match(/\{\w+\}/g)?.sort(), MESSAGES.zh[key].match(/\{\w+\}/g)?.sort());
    }
    const running = t(language, 'running', { quality: 'fine', mode: 'canvas' });
    assert.ok(running.includes(MESSAGES[language].fine));
    assert.ok(running.includes(MESSAGES[language].compatibility));
    assert.ok(!running.includes('{'));
  }
});

test('old settings retain effects; invalid languages cannot become catalog keys', () => {
  const legacy = normalizeSettings({ version: 2, spread: 175, theme: 'dark', enabled: false });
  assert.equal(legacy.language, 'zh'); assert.equal(legacy.spread, 175); assert.equal(legacy.theme, 'dark'); assert.equal(legacy.enabled, false);
  for (const language of [null, {}, [], '__proto__', 'constructor', 'fr', 'ja-JP']) assert.equal(normalizeSettings({ language }).language, DEFAULTS.language);
  for (const language of Object.keys(LANGUAGES)) assert.equal(normalizeSettings({ language }).language, language);
});

test('language survives reload and restoring effect defaults', async () => {
  let stored: unknown;
  const backend = { read: async () => stored, write: async (value: unknown) => { stored = value; }, listen: () => () => {} };
  const store = new SettingsStore(backend); await store.init();
  await store.update({ language: 'ko', spread: 190, enabled: false });
  const reopened = new SettingsStore(backend); await reopened.init();
  assert.equal(reopened.value.language, 'ko'); assert.equal(reopened.value.enabled, false);
  await reopened.reset(); assert.deepEqual(reopened.value, { ...DEFAULTS, language: 'ko' });
  store.dispose(); reopened.dispose();
});
