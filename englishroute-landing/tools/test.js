// Проверка лендинга в headless Chromium.
// Запуск из папки englishroute-landing: node tools/test.js [папка_для_скриншотов]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const pub = path.resolve(__dirname, '..', 'public');
const shotsDir = path.resolve(process.argv[2] || path.join(__dirname, 'screenshots'));
fs.mkdirSync(shotsDir, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(pub, url === '/' ? 'index.html' : url);
  if (!file.startsWith(pub) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const FAKE_URL = 'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec';
let failures = 0;
function check(cond, msg) {
  console.log((cond ? 'OK   ' : 'FAIL ') + msg);
  if (!cond) failures++;
}

async function withFakeUrl(page) {
  await page.route('**/main.js*', async (route) => {
    const body = fs.readFileSync(path.join(pub, 'main.js'), 'utf8').replace("'ВСТАВИТЬ_URL_APPS_SCRIPT'", `'${FAKE_URL}'`);
    await route.fulfill({ status: 200, contentType: 'text/javascript', body });
  });
}

async function fillValid(page, name = 'Айгерим') {
  await page.fill('#f-name', name);
  await page.click('#f-phone');
  await page.keyboard.type('87072714655');
  await page.check('input[name="who"][value="Мой ребёнок"]');
  await page.selectOption('#f-goal', 'IELTS');
  await page.selectOption('#f-level', 'Средний');
  await page.check('input[name="format"][value="Онлайн"]');
  await page.fill('#f-time', 'будни после 18:00');
  await page.check('#f-consent');
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();

  // ---------- Скриншоты и вёрстка ----------
  for (const w of [375, 430, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 900 ? 812 : 800 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `${w}px: нет горизонтального скролла (лишние ${overflow}px)`);
    await page.screenshot({ path: path.join(shotsDir, `viewport-${w}.png`) });
    // прокрутка до отзывов, чтобы сработала ленивая проверка скриншотов
    await page.evaluate(() => document.getElementById('otzyvy').scrollIntoView());
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shotsDir, `full-${w}.png`), fullPage: true });
    const realErrors = errors.filter((e) => !/review-\d\.jpg|Failed to load resource/.test(e));
    check(realErrors.length === 0, `${w}px: нет JS-ошибок ${realErrors.join(' | ')}`);
    await ctx.close();
  }

  // ---------- Мобильная проверка: отзывы, липкая кнопка, ссылки ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'networkidle' });
    check(await page.isHidden('#sticky-cta .btn'), 'липкая кнопка скрыта, пока видна кнопка в hero');
    await page.evaluate(() => window.scrollTo(0, 1600));
    await page.waitForTimeout(400);
    check(await page.isVisible('#sticky-cta .btn'), 'липкая кнопка появляется после скролла');
    await page.click('#sticky-cta .btn');
    await page.waitForTimeout(900);
    check(await page.evaluate(() => location.hash === '#zapis'), 'липкая кнопка ведёт к #zapis');
    check(await page.isHidden('#sticky-cta .btn'), 'липкая кнопка скрыта, когда форма на экране');

    await page.evaluate(() => document.getElementById('otzyvy').scrollIntoView());
    await page.waitForTimeout(500);
    check(await page.isVisible('#reviews-fallback'), 'отзывы: пустые заглушки → видна рамка «Отзывы учеников — в Instagram»');
    check(await page.isHidden('#reviews-grid'), 'отзывы: сетка с битыми картинками не показывается');

    const links = await page.$$eval('a[href*="wa.me"]', (as) => as.map((a) => a.href));
    check(links.length > 0 && links.every((h) => h.startsWith('https://wa.me/77072714655')), `все ссылки wa.me ведут на 77072714655 (${links.length} шт.)`);
    const heroWa = decodeURIComponent(links[0].split('text=')[1] || '');
    console.log('     текст WhatsApp в hero: ' + heroWa);
    const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8') + fs.readFileSync(path.join(pub, 'main.js'), 'utf8');
    const phones = html.match(/7\D?707\D?271\D?46\D?55|77072714655/g) || [];
    const wrong = html.match(/\+?7[\s(]*7\d{2}[\s)]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g)?.filter((p) => p.replace(/\D/g, '') !== '77072714655') || [];
    check(phones.length > 0 && wrong.length === 0, `номер +7 707 271 4655 нигде не перепутан (найдено ${phones.length}, чужих: ${wrong.join(',') || 0})`);
    await ctx.close();
  }

  // ---------- Отзывы с реальным скриншотом ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const png = fs.readFileSync(path.join(pub, 'apple-touch-icon.png'));
    await page.route('**/assets/reviews/review-2.jpg', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.getElementById('otzyvy').scrollIntoView());
    await page.waitForTimeout(500);
    check(await page.isVisible('#reviews-grid'), 'отзывы: при наличии файла сетка показывается');
    check((await page.$$('.review:not([hidden])')).length === 1, 'отзывы: показан только реальный скриншот');
    check(await page.isHidden('#reviews-fallback'), 'отзывы: рамка-заглушка скрыта');
    await ctx.close();
  }

  // ---------- Валидация и маска ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(base + '#zapis');
    await page.click('#submit-btn');
    check(await page.evaluate(() => document.activeElement.id === 'f-name'), 'пустая форма: фокус на первом поле с ошибкой');
    const errs = await page.$$eval('.field-error', (els) => els.filter((e) => e.textContent).length);
    check(errs === 6, `пустая форма: 6 ошибок у обязательных полей (${errs})`);
    await page.screenshot({ path: path.join(shotsDir, 'form-errors-375.png'), fullPage: false });

    const cases = [['87072714655', '+7 (707) 271-46-55'], ['+77072714655', '+7 (707) 271-46-55'], ['7072714655', '+7 (707) 271-46-55'], ['77711234567', '+7 (771) 123-45-67']];
    for (const [typed, expected] of cases) {
      await page.fill('#f-phone', '');
      await page.click('#f-phone');
      await page.fill('#f-phone', '');
      await page.keyboard.type(typed);
      const v = await page.inputValue('#f-phone');
      check(v === expected, `маска: «${typed}» → «${v}»`);
    }
    // с автоподстановкой «+7 (» при фокусе
    for (const [typed, expected] of [['87072714655', '+7 (707) 271-46-55'], ['77072714655', '+7 (707) 271-46-55'], ['7072714655', '+7 (707) 271-46-55']]) {
      await page.fill('#f-phone', '');
      await page.click('#f-name');
      await page.click('#f-phone');
      const pre = await page.inputValue('#f-phone');
      await page.keyboard.type(typed);
      const v = await page.inputValue('#f-phone');
      check(pre === '+7 (' && v === expected, `маска после фокуса («${pre}»): «${typed}» → «${v}»`);
    }
    await page.fill('#f-phone', '');
    await page.keyboard.type('9161234567');
    await page.fill('#f-name', 'Тест');
    await page.click('#submit-btn');
    const phoneErr = await page.textContent('#err-phone');
    check(/казахстанский/i.test(phoneErr), `невалидный номер (+7 916…) отклонён: «${phoneErr}»`);
    await ctx.close();
  }

  // ---------- Отправка: успех (mock) ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await withFakeUrl(page);
    let request = null;
    await page.route(FAKE_URL, async (route) => {
      request = route.request();
      await new Promise((r) => setTimeout(r, 600));
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}', headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await page.goto(base + '?utm_source=instagram&utm_medium=bio&utm_campaign=test#zapis');
    check(await page.inputValue('#f-source') === 'Instagram', 'utm_source=instagram → «Откуда узнали» = Instagram');
    await page.goto(base + '#zapis'); // UTM должны сохраниться в sessionStorage
    await fillValid(page);
    await page.click('#submit-btn');
    await page.waitForTimeout(150);
    check(await page.getAttribute('#submit-btn', 'aria-busy') === 'true', 'кнопка в состоянии загрузки');
    check((await page.textContent('#submit-btn')).includes('Отправляю'), 'текст кнопки «Отправляю заявку…»');
    await page.screenshot({ path: path.join(shotsDir, 'form-loading-375.png') });
    await page.waitForSelector('#thanks:not([hidden])');
    const ct = request.headers()['content-type'];
    check(ct.startsWith('text/plain'), `Content-Type запроса: ${ct}`);
    const body = JSON.parse(request.postData());
    check(body.utm_source === 'instagram' && body.utm_medium === 'bio' && body.utm_campaign === 'test', 'UTM сохранились в sessionStorage и ушли в заявку');
    check(body.phone === '+7 (707) 271-46-55' && body.phone_digits === '77072714655', 'телефон в заявке корректный');
    check(body.who === 'Мой ребёнок' && body.goal === 'IELTS' && body.format === 'Онлайн' && body.level === 'Средний', 'поля заявки корректны');
    check(body.page_url && body.timestamp && 'referrer' in body && body.website === '', 'служебные поля заполнены');
    check((await page.textContent('#thanks-title')) === 'Спасибо, Айгерим!', 'заголовок «Спасибо, {имя}!»');
    check(await page.isHidden('#lead-form'), 'форма заменена блоком благодарности');
    const wa = await page.getAttribute('#thanks-wa', 'href');
    const waText = decodeURIComponent(wa.split('text=')[1]);
    check(wa.startsWith('https://wa.me/77072714655?text='), 'кнопка «Написать сейчас» → wa.me/77072714655');
    check(waText === 'Здравствуйте! Я оставил(а) заявку на сайте на бесплатную диагностику. Цель: IELTS, формат: онлайн', `текст WhatsApp: «${waText}»`);
    await page.screenshot({ path: path.join(shotsDir, 'form-success-375.png') });

    // повторная отправка в течение 30 секунд
    await page.reload();
    await fillValid(page, 'Повтор');
    let second = false;
    await page.unroute(FAKE_URL);
    await page.route(FAKE_URL, (r) => { second = true; r.fulfill({ status: 200, body: '{"ok":true}' }); });
    await page.click('#submit-btn');
    await page.waitForTimeout(300);
    check(!second && /30 секунд/.test(await page.textContent('#form-status')), 'повторная отправка раньше 30 секунд блокируется');
    await ctx.close();
  }

  // ---------- Отправка: ошибка сети ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await withFakeUrl(page);
    await page.route(FAKE_URL, (r) => r.abort('internetdisconnected'));
    await page.goto(base + '#zapis');
    await fillValid(page);
    await page.click('#submit-btn');
    await page.waitForSelector('#form-status:not([hidden])');
    const st = await page.textContent('#form-status');
    check(/проверьте подключение/.test(st), `ошибка сети: понятное сообщение`);
    const fb = await page.getAttribute('#form-status a', 'href');
    const fbText = decodeURIComponent(fb.split('text=')[1]);
    check(fb.startsWith('https://wa.me/77072714655?text=') && fbText.includes('Айгерим') && fbText.includes('IELTS'), `запасная кнопка WhatsApp с данными заявки: «${fbText}»`);
    check(await page.isVisible('#lead-form') && (await page.inputValue('#f-name')) === 'Айгерим', 'данные формы не потеряны');
    check(await page.getAttribute('#submit-btn', 'aria-busy') === 'false', 'кнопка вернулась из состояния загрузки');
    await page.screenshot({ path: path.join(shotsDir, 'form-error-375.png') });
    await ctx.close();
  }

  // ---------- Отправка: сервер вернул ошибку ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await withFakeUrl(page);
    await page.route(FAKE_URL, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"error":"server"}' }));
    await page.goto(base + '#zapis');
    await fillValid(page);
    await page.click('#submit-btn');
    await page.waitForSelector('#form-status:not([hidden])');
    check(/ошибки на сервере/.test(await page.textContent('#form-status')), 'ответ {ok:false} → сообщение об ошибке + WhatsApp');
    await ctx.close();
  }

  // ---------- URL Apps Script не вставлен ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(base + '#zapis');
    await fillValid(page);
    await page.click('#submit-btn');
    await page.waitForSelector('#form-status:not([hidden])');
    check(/не подключена/.test(await page.textContent('#form-status')) && await page.isVisible('#form-status a[href*="wa.me/77072714655"]'), 'без APPS_SCRIPT_URL: предлагает WhatsApp');
    await ctx.close();
  }

  // ---------- Honeypot ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await withFakeUrl(page);
    let sent = false;
    await page.route(FAKE_URL, (r) => { sent = true; r.fulfill({ status: 200, body: '{"ok":true}' }); });
    await page.goto(base + '#zapis');
    await page.evaluate(() => { document.getElementById('f-website').value = 'http://spam'; });
    await fillValid(page);
    await page.click('#submit-btn');
    await page.waitForTimeout(300);
    check(!sent, 'honeypot: заявка бота не отправляется');
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} проверок не прошли` : '\nВсе проверки прошли');
  process.exit(failures ? 1 : 0);
})();
