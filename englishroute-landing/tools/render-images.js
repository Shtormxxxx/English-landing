// Генерирует og-image.png (1200×630), favicon-32.png и apple-touch-icon.png.
// Запуск из папки englishroute-landing: node tools/render-images.js
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const pub = path.join(root, 'public');

(async () => {
  const browser = await chromium.launch();

  const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await og.goto('file://' + path.join(__dirname, 'og.html'), { waitUntil: 'networkidle' });
  await og.evaluate(() => document.fonts.ready);
  await og.screenshot({ path: path.join(pub, 'og-image.png') });

  for (const [size, name] of [[32, 'favicon-32.png'], [180, 'apple-touch-icon.png']]) {
    const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const svg = require('fs').readFileSync(path.join(pub, 'favicon.svg'), 'base64');
    await p.setContent(
      `<style>html,body{margin:0;background:#fbfaf5}</style><img src="data:image/svg+xml;base64,${svg}" width="${size}" height="${size}" style="display:block">`
    );
    await p.waitForTimeout(100);
    await p.screenshot({ path: path.join(pub, name) });
  }

  await browser.close();
  console.log('Готово: og-image.png, favicon-32.png, apple-touch-icon.png');
})();
