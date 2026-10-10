import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import jsQR from 'jsqr';
import { startServer } from './server.mjs';
import { extensionContext } from './extension-context.mjs';
import { pngPixels } from './image-pixels.mjs';
import { LANGUAGES, MESSAGES } from '../src/i18n.ts';
import { DONATION } from '../src/support.ts';

await mkdir('artifacts', { recursive: true });
for (const key of ['alipay', 'wechat']) {
  const im = pngPixels(await readFile(`assets/support/${key}.png`));
  assert.equal(jsQR(new Uint8ClampedArray(im.pixels), im.width, im.height)?.data, DONATION[key]);
}
for (const file of ['README.md', 'README.en.md', 'README.ja.md', 'README.ko.md']) {
  const text = await readFile(file, 'utf8');
  for (const name of ['ambient-light', 'colorful-light', 'soft-light', 'dark-light']) assert.ok(text.includes(`assets/screenshots/${name}.png`));
  assert.ok(text.includes(DONATION.kofi)); assert.ok(text.includes(encodeURI(DONATION.alipay)));
  for (const match of text.matchAll(/\]\(([^)]+)\)|src="([^"]+)"/g)) {
    const target = match[1] ?? match[2]; if (!/^https?:/.test(target)) await readFile(target);
  }
}
const server = await startServer(), reports = [];
try {
  for (const name of ['chrome', 'edge']) {
    const browser = await chromium.launch({ channel: name === 'chrome' ? 'chrome' : 'msedge', headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(server.url + '/video/fixture/?test'); await page.waitForFunction(() => window.blgTest);
      await page.evaluate(async () => {
        const t = window.blgTest;
        window.langStore = new t.SettingsStore(t.backend); await window.langStore.init();
        window.langPanel = new t.SettingsPanel(window.langStore, false);
        window.langPanel2 = new t.SettingsPanel(window.langStore, true);
        document.body.append(window.langPanel.host, window.langPanel2.host);
        window.langPanel.host.style.cssText = 'position:fixed;left:8px;top:8px';
        window.langPanel2.host.style.cssText = 'position:fixed;left:8px;top:650px';
        window.langPanel.setStatus('test', 'warning', 'protectedVideo');
      });
      const panel = page.locator('.blg-ui-host').first();
      for (const language of Object.keys(LANGUAGES)) {
        await panel.locator('select[name=language]').focus();
        await panel.locator('select[name=language]').selectOption(language);
        await page.waitForFunction(lang => window.blgTest.state.value?.language === lang, language);
        assert.equal(await panel.locator('h1').textContent(), MESSAGES[language].settings);
        assert.equal(await page.locator('.blg-ui-host').nth(1).locator('h1').textContent(), MESSAGES[language].settings);
        assert.equal(await panel.locator('#status').textContent(), MESSAGES[language].protectedVideo);
        assert.equal(await panel.locator('#saved').textContent(), MESSAGES[language].saved);
        assert.equal(await panel.locator('select[name=language]').evaluate(e => e.getRootNode().activeElement === e), true);
        const bounds = await panel.locator('header').evaluate(e => {
          const [title, language, close] = [...e.children].map(x => x.getBoundingClientRect());
          return { overlap: title.right > language.left || language.right > close.left, overflow: e.closest('.panel').scrollWidth > e.closest('.panel').clientWidth };
        });
        assert.equal(bounds.overlap, false, `${name}/${language}: header controls overlap`);
        assert.equal(bounds.overflow, false, `${name}/${language}: horizontal overflow`);
        const clipped = await panel.locator('.select-row select').evaluateAll(selects => {
          const context = document.createElement('canvas').getContext('2d');
          return selects.flatMap(select => {
            const style = getComputedStyle(select); context.font = style.font;
            const available = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 20;
            return [...select.options].filter(option => context.measureText(option.text).width > available).map(option => option.text);
          });
        });
        assert.deepEqual(clipped, [], `${name}/${language}: select text clipped`);
        await panel.locator('#donate').click();
        const layer = panel.locator('.donation-popover'); await layer.waitFor();
        assert.equal(await layer.getAttribute('aria-label'), MESSAGES[language].donationOptions);
        assert.equal(await layer.locator('[data-payment=alipay] svg').getAttribute('aria-label'), MESSAGES[language].alipayQr);
        assert.equal(await layer.locator('a').getAttribute('href'), DONATION.kofi);
        await panel.locator('#donate').press('Escape');
        await page.screenshot({ path: `artifacts/i18n-${name}-${language}.png` });
      }
      await panel.locator('input[name=enabled]').uncheck();
      await panel.locator('select[name=language]').selectOption('en');
      assert.equal(await panel.locator('select[name=language]').isEnabled(), true);
      assert.equal(await panel.locator('select[name=quality]').isDisabled(), true);
      await panel.locator('#reset').click();
      assert.equal(await panel.locator('select[name=language]').inputValue(), 'en');
      await page.evaluate(async () => {
        window.langPanel.dispose();
        const t = window.blgTest, s = new t.SettingsStore(t.backend); await s.init();
        window.langPanel = new t.SettingsPanel(s, false); document.body.append(window.langPanel.host);
      });
      assert.equal(await page.locator('.blg-ui-host').last().locator('select[name=language]').inputValue(), 'en');
      assert.deepEqual(errors, []); reports.push({ browser: name, fixture: true, languages: Object.keys(LANGUAGES) });
    } finally { await browser.close(); }

    const installed = await extensionContext(name);
    try {
      // A local player fixture under a matching URL exercises actual MV3 content
      // scripts without a Bilibili account or changing the user's browser profile.
      await installed.context.route('https://www.bilibili.com/**', route => route.fulfill({
        contentType: 'text/html', body: '<html><body><div class="bpx-player-container" style="width:900px;height:506px"><div class="bpx-player-video-wrap" style="width:900px;height:506px"><video style="width:100%;height:100%"></video></div><div class="bpx-player-control-bottom-right"></div></div></body></html>',
      }));
      const watch = await installed.context.newPage(); await watch.goto('https://www.bilibili.com/video/BV19seG6VEnK/');
      await watch.locator('.blg-player-button').waitFor();
      const popup2 = await installed.context.newPage(); await popup2.goto(installed.popup.url());
      for (const language of Object.keys(LANGUAGES)) {
        await installed.popup.locator('select[name=language]').selectOption(language);
        await watch.waitForFunction(label => document.querySelector('.blg-player-button')?.textContent === label, MESSAGES[language].playerButton);
        await popup2.waitForFunction(lang => document.querySelector('.blg-ui-host')?.lang === lang, language);
        await watch.locator('.blg-player-button').click();
        assert.equal(await watch.locator('.blg-ui-host h1').textContent(), MESSAGES[language].settings);
        await watch.locator('.blg-ui-host .close').click();
      }
      await installed.popup.reload(); await installed.popup.locator('.blg-ui-host').waitFor();
      assert.equal(await installed.popup.locator('select[name=language]').inputValue(), 'ko');
      for (const locale of ['zh_CN', 'en', 'ja', 'ko']) {
        const messages = JSON.parse(await readFile(`dist/${name}/_locales/${locale}/messages.json`, 'utf8'));
        assert.ok(messages.extensionName.message); assert.ok(messages.extensionDescription.message);
      }
      reports.push({ browser: name, installedMV3: true, persistence: true, contentAndTwoPopups: true });
      console.log(`PASS ${name}: four languages, header layout, donation labels, effect-off switching, reset, persistence and MV3 cross-context sync`);
    } finally { await installed.close(); }
  }
} finally {
  await server.close();
  await writeFile('artifacts/i18n-report.json', JSON.stringify({ version: '0.1.23', reports }, null, 2));
}
