/**
 * EnglishRoute — приём заявок с лендинга.
 * Скрипт привязан к Google Таблице (Расширения → Apps Script).
 * Пошаговая инструкция — в README.md, раздел «Подключить приём заявок».
 */

// Куда присылать уведомления о новых заявках. Впишите свой Gmail.
// Если оставить пустым, письмо уйдёт на аккаунт, от имени которого развёрнут скрипт.
const NOTIFY_EMAIL = '';

const SHEET_NAME = 'Заявки';
const HEADERS = [
  'Дата', 'Имя', 'WhatsApp', 'Кто', 'Цель', 'Уровень', 'Формат', 'Время', 'Источник',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'referrer', 'Статус'
];
const DEFAULT_STATUS = 'новая';
const MY_NAME = 'Батырхан';
const BRAND = 'EnglishRoute';

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const data = JSON.parse(raw);

    // Honeypot: живой человек это поле не заполняет. Боту отвечаем «ok», но ничего не пишем.
    if (data.website) return json_({ ok: true });

    const lead = {
      name: clean_(data.name, 80),
      phone: clean_(data.phone, 30),
      phoneDigits: String(data.phone_digits || data.phone || '').replace(/\D/g, '').slice(0, 15),
      who: clean_(data.who, 40),
      goal: clean_(data.goal, 60),
      level: clean_(data.level, 40),
      format: clean_(data.format, 40),
      time: clean_(data.time, 200),
      source: clean_(data.source, 60),
      utm_source: clean_(data.utm_source, 200),
      utm_medium: clean_(data.utm_medium, 200),
      utm_campaign: clean_(data.utm_campaign, 200),
      utm_content: clean_(data.utm_content, 200),
      referrer: clean_(data.referrer, 500),
      page_url: clean_(data.page_url, 500)
    };

    if (!lead.name || lead.phoneDigits.length < 11) {
      return json_({ ok: false, error: 'invalid' });
    }

    // Защита от повторной отправки одного номера чаще раза в 30 секунд
    const cache = CacheService.getScriptCache();
    const cacheKey = 'lead_' + lead.phoneDigits;
    if (cache.get(cacheKey)) return json_({ ok: true, duplicate: true });
    cache.put(cacheKey, '1', 30);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = getSheet_();
      sheet.appendRow([
        new Date(),
        safe_(lead.name),
        safe_(lead.phone),
        safe_(lead.who),
        safe_(lead.goal),
        safe_(lead.level),
        safe_(lead.format),
        safe_(lead.time),
        safe_(lead.source),
        safe_(lead.utm_source),
        safe_(lead.utm_medium),
        safe_(lead.utm_campaign),
        safe_(lead.utm_content),
        safe_(lead.referrer),
        DEFAULT_STATUS
      ]);
    } finally {
      lock.releaseLock();
    }

    try {
      sendNotification_(lead);
    } catch (mailErr) {
      // Заявка уже в таблице — ошибка почты не должна ломать ответ сайту
      console.error('Mail error: ' + mailErr);
    }

    return json_({ ok: true });
  } catch (err) {
    console.error('doPost error: ' + err);
    return json_({ ok: false, error: 'server' });
  }
}

// Проверка, что веб-приложение развёрнуто: откройте URL в браузере.
function doGet() {
  return json_({ ok: true, service: 'EnglishRoute leads' });
}

// Запустите один раз из редактора (кнопка «Выполнить»), чтобы выдать разрешения
// на Таблицу и Почту и проверить, что строка и письмо приходят.
function testLead() {
  const fake = {
    name: 'Тест', phone: '+7 (707) 000-00-00', phone_digits: '77070000000',
    who: 'Я сам(а)', goal: 'IELTS', level: 'Не знаю', format: 'Онлайн',
    time: 'будни после 18:00', source: 'Instagram', utm_source: 'test', website: ''
  };
  const res = doPost({ postData: { contents: JSON.stringify(fake) } });
  console.log(res.getContent());
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A:A').setNumberFormat('dd.mm.yyyy hh:mm');
  }
  return sheet;
}

function sendNotification_(lead) {
  const to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  if (!to) return;

  const greeting = 'Здравствуйте, ' + lead.name + '! Это ' + MY_NAME + ' из ' + BRAND +
    '. Вы оставили заявку на бесплатную диагностику по английскому. Когда вам удобно созвониться?';
  const waUrl = 'https://wa.me/' + lead.phoneDigits + '?text=' + encodeURIComponent(greeting);

  const rows = [
    ['Имя', lead.name],
    ['WhatsApp', lead.phone],
    ['Кто будет заниматься', lead.who],
    ['Цель', lead.goal],
    ['Уровень', lead.level],
    ['Формат', lead.format],
    ['Удобное время', lead.time],
    ['Откуда узнали', lead.source],
    ['utm_source', lead.utm_source],
    ['utm_medium', lead.utm_medium],
    ['utm_campaign', lead.utm_campaign],
    ['utm_content', lead.utm_content],
    ['referrer', lead.referrer],
    ['Страница', lead.page_url]
  ];

  const subject = 'Новая заявка ' + BRAND + ': ' + lead.name + ' — ' + (lead.goal || 'цель не указана');

  const textBody = rows.map(function (r) { return r[0] + ': ' + (r[1] || '—'); }).join('\n') +
    '\n\nНаписать в WhatsApp: ' + waUrl;

  const htmlRows = rows.map(function (r) {
    return '<tr><td style="padding:4px 12px 4px 0;color:#555">' + esc_(r[0]) +
      '</td><td style="padding:4px 0"><b>' + esc_(r[1] || '—') + '</b></td></tr>';
  }).join('');

  const htmlBody =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1b2a6b">' +
    '<h2 style="margin:0 0 12px">Новая заявка на бесплатную диагностику</h2>' +
    '<table style="border-collapse:collapse">' + htmlRows + '</table>' +
    '<p style="margin:20px 0"><a href="' + esc_(waUrl) + '" style="background:#136c3a;color:#fff;' +
    'padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Написать ' +
    esc_(lead.name) + ' в WhatsApp</a></p>' +
    '<p style="color:#555;font-size:13px">Ссылка откроет чат с номером ' + esc_(lead.phone) +
    ' и готовым приветствием.</p></div>';

  MailApp.sendEmail({ to: to, subject: subject, body: textBody, htmlBody: htmlBody, name: BRAND });
}

function clean_(value, maxLen) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, maxLen);
}

// Значения, начинающиеся с = + - @, Таблица считает формулами. Экранируем апострофом.
function safe_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function esc_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
