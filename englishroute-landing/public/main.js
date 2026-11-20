/* =====================================================================
 *  ВСТАВИТЬ URL ПОСЛЕ ДЕПЛОЯ APPS SCRIPT
 *  Пример: 'https://script.google.com/macros/s/AKfycb.../exec'
 *  Пока здесь заглушка, форма предлагает отправить заявку в WhatsApp.
 * ===================================================================== */
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw5pXkwvEupc1Yy1EUQRpAhUrySQkNMTtrrSyip1oYw4f3_unemAwG2ze_aMP2KHEth/exec';

const WA_NUMBER = '77072714655';
const RATE_LIMIT_MS = 30000;
const REQUEST_TIMEOUT_MS = 15000;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

(function () {
  'use strict';

  function storageGet(kind, key) {
    try { return window[kind].getItem(key); } catch (e) { return null; }
  }
  function storageSet(kind, key, value) {
    try { window[kind].setItem(key, value); } catch (e) { /* приватный режим и т.п. */ }
  }

  function waLink(text) {
    return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(text);
  }

  function isConfigured() {
    return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(APPS_SCRIPT_URL);
  }

  /* ---------- UTM и источник ---------- */
  function readAttribution() {
    var params = new URLSearchParams(window.location.search);
    var utm = {};
    var hasUtm = UTM_KEYS.some(function (k) { return params.get(k); });
    if (hasUtm) {
      UTM_KEYS.forEach(function (k) { utm[k] = (params.get(k) || '').slice(0, 200); });
      storageSet('sessionStorage', 'er_utm', JSON.stringify(utm));
    } else {
      try { utm = JSON.parse(storageGet('sessionStorage', 'er_utm') || '{}') || {}; } catch (e) { utm = {}; }
    }
    var referrer = storageGet('sessionStorage', 'er_referrer');
    if (referrer === null) {
      referrer = document.referrer || '';
      storageSet('sessionStorage', 'er_referrer', referrer);
    }
    return { utm: utm, referrer: referrer };
  }

  function guessSource(utmSource) {
    var s = (utmSource || '').toLowerCase();
    if (!s) return '';
    if (s.indexOf('instagram') > -1 || s === 'ig') return 'Instagram';
    if (s.indexOf('2gis') > -1) return '2GIS';
    if (s.indexOf('google') > -1) return 'Google';
    if (/chat|whatsapp|telegram|group/.test(s)) return 'Чат или группа';
    return '';
  }

  /* ---------- Маска телефона +7 (7XX) XXX-XX-XX ---------- */
  // Возвращает 10 цифр номера после +7. Понимает 8 707…, +7 707…, 7707…, 707…
  function phoneDigits(raw) {
    var s = String(raw).trim();
    var d = s.replace(/\D/g, '');
    if (s.indexOf('+7') === 0) d = d.slice(1);
    if (d[0] === '8') d = d.slice(1);
    // Код страны набран ещё раз поверх «+7 (»: 7 707… → 707…
    if (d.length > 10 && d[0] === '7' && d[1] === '7') d = d.slice(1);
    return d.slice(0, 10);
  }

  function formatPhone(d) {
    if (!d) return '';
    var out = '+7 (' + d.slice(0, 3);
    if (d.length > 3) out += ') ' + d.slice(3, 6);
    if (d.length > 6) out += '-' + d.slice(6, 8);
    if (d.length > 8) out += '-' + d.slice(8, 10);
    return out;
  }

  function isValidKzMobile(d) {
    return /^7\d{9}$/.test(d);
  }

  function initPhoneMask(input) {
    input.addEventListener('input', function () {
      var raw = input.value;
      var caret = input.selectionStart;
      var atEnd = caret === null || caret >= raw.length;
      var hadPlus7 = raw.trim().indexOf('+7') === 0;
      var digitsBeforeCaret = atEnd ? null : raw.slice(0, caret).replace(/\D/g, '').length;
      var formatted = formatPhone(phoneDigits(raw));
      input.value = formatted;
      if (!atEnd && hadPlus7 && document.activeElement === input) {
        var pos = 0;
        var seen = 0;
        while (pos < formatted.length && seen < digitsBeforeCaret) {
          if (/\d/.test(formatted[pos])) seen++;
          pos++;
        }
        try { input.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
      }
    });
    input.addEventListener('focus', function () {
      if (!input.value) input.value = '+7 (';
    });
    input.addEventListener('blur', function () {
      if (phoneDigits(input.value).length === 0) input.value = '';
    });
  }

  /* ---------- Отзывы: показываем только реально существующие скриншоты ---------- */
  function initReviews() {
    var grid = document.getElementById('reviews-grid');
    var fallback = document.getElementById('reviews-fallback');
    var more = document.getElementById('reviews-more');
    if (!grid) return;
    var figures = Array.prototype.slice.call(grid.querySelectorAll('.review'));
    var started = false;

    function load() {
      if (started) return;
      started = true;
      figures.forEach(function (fig) {
        var img = fig.querySelector('img');
        var src = img && img.getAttribute('data-src');
        if (!src) { fig.remove(); return; }
        img.addEventListener('load', function () {
          if (img.naturalWidth < 2) { fig.remove(); return; }
          fig.hidden = false;
          grid.hidden = false;
          fallback.hidden = true;
          more.hidden = false;
        });
        img.addEventListener('error', function () { fig.remove(); });
        img.src = src;
      });
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) {
          io.disconnect();
          load();
        }
      }, { rootMargin: '600px 0px' });
      io.observe(document.getElementById('otzyvy'));
    } else {
      load();
    }
  }

  /* ---------- Липкая кнопка на мобильном ---------- */
  function initStickyCta() {
    var sticky = document.getElementById('sticky-cta');
    var heroCta = document.getElementById('hero-cta');
    var formSection = document.getElementById('zapis');
    if (!sticky || !('IntersectionObserver' in window)) return;
    var heroVisible = true;
    var formVisible = false;
    function update() {
      sticky.classList.toggle('is-hidden', heroVisible || formVisible);
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.target === heroCta) heroVisible = e.isIntersecting;
        if (e.target === formSection) formVisible = e.isIntersecting;
      });
      update();
    });
    io.observe(heroCta);
    io.observe(formSection);
    update();
  }

  /* ---------- Форма ---------- */
  function initForm() {
    var form = document.getElementById('lead-form');
    if (!form) return;
    var formArea = document.getElementById('form-area');
    var thanks = document.getElementById('thanks');
    var status = document.getElementById('form-status');
    var submitBtn = document.getElementById('submit-btn');
    var submitLabel = submitBtn.querySelector('.btn-label');
    var phone = form.elements.phone;
    var sending = false;
    var lastSubmit = 0;

    var attribution = readAttribution();
    UTM_KEYS.forEach(function (k) { form.elements[k].value = attribution.utm[k] || ''; });
    form.elements.referrer.value = attribution.referrer;
    var guessed = guessSource(attribution.utm.utm_source);
    if (guessed && !form.elements.source.value) form.elements.source.value = guessed;

    initPhoneMask(phone);

    var checks = {
      name: function () {
        return form.elements.name.value.trim().length >= 2 ? '' : 'Напишите, как к вам обращаться.';
      },
      phone: function () {
        var d = phoneDigits(phone.value);
        if (!d) return 'Укажите номер WhatsApp.';
        if (d.length < 10) return 'Номер неполный: нужно 10 цифр после +7.';
        if (!isValidKzMobile(d)) return 'Нужен казахстанский мобильный номер: +7 (7XX) XXX-XX-XX.';
        return '';
      },
      who: function () {
        return form.querySelector('input[name="who"]:checked') ? '' : 'Выберите, кто будет заниматься.';
      },
      goal: function () {
        return form.elements.goal.value ? '' : 'Выберите цель занятий.';
      },
      format: function () {
        return form.querySelector('input[name="format"]:checked') ? '' : 'Выберите формат: онлайн или офлайн.';
      },
      consent: function () {
        return form.elements.consent.checked ? '' : 'Нужно согласие на обработку данных, иначе я не смогу с вами связаться.';
      }
    };

    var targets = {
      name: function () { return form.elements.name; },
      phone: function () { return phone; },
      who: function () { return document.getElementById('fs-who'); },
      goal: function () { return form.elements.goal; },
      format: function () { return document.getElementById('fs-format'); },
      consent: function () { return form.elements.consent; }
    };

    function setFieldError(key, message) {
      var el = targets[key]();
      var err = document.getElementById('err-' + key);
      if (err) err.textContent = message;
      if (el.tagName === 'FIELDSET') {
        el.classList.toggle('fieldset-invalid', !!message);
        el.querySelectorAll('input').forEach(function (i) {
          if (message) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
        });
      } else if (message) {
        el.setAttribute('aria-invalid', 'true');
      } else {
        el.removeAttribute('aria-invalid');
      }
    }

    function validate() {
      var firstInvalid = null;
      Object.keys(checks).forEach(function (key) {
        var msg = checks[key]();
        setFieldError(key, msg);
        if (msg && !firstInvalid) firstInvalid = key;
      });
      if (firstInvalid) {
        var el = targets[firstInvalid]();
        var focusEl = el.tagName === 'FIELDSET' ? el.querySelector('input') : el;
        focusEl.focus();
        if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return !firstInvalid;
    }

    Object.keys(checks).forEach(function (key) {
      var el = targets[key]();
      var evt = (key === 'name' || key === 'phone') ? 'input' : 'change';
      el.addEventListener(evt, function () {
        var err = document.getElementById('err-' + key);
        if (err && err.textContent) setFieldError(key, checks[key]());
      });
      if (key === 'phone') {
        el.addEventListener('blur', function () {
          if (phoneDigits(phone.value)) setFieldError('phone', checks.phone());
        });
      }
    });

    function collect() {
      var who = form.querySelector('input[name="who"]:checked');
      var fmt = form.querySelector('input[name="format"]:checked');
      form.elements.page_url.value = window.location.href;
      form.elements.timestamp.value = new Date().toISOString();
      var data = {
        name: form.elements.name.value.trim(),
        phone: formatPhone(phoneDigits(phone.value)),
        phone_digits: '7' + phoneDigits(phone.value),
        who: who ? who.value : '',
        goal: form.elements.goal.value,
        level: form.elements.level.value,
        format: fmt ? fmt.value : '',
        time: form.elements.time.value.trim(),
        source: form.elements.source.value,
        consent: form.elements.consent.checked,
        website: form.elements.website.value
      };
      UTM_KEYS.concat(['referrer', 'page_url', 'timestamp']).forEach(function (k) {
        data[k] = form.elements[k].value;
      });
      return data;
    }

    function thanksWaText(data) {
      return 'Здравствуйте! Я оставил(а) заявку на сайте на бесплатную диагностику. Цель: ' +
        data.goal + ', формат: ' + data.format.toLowerCase();
    }

    function fallbackWaText(data) {
      var text = 'Здравствуйте! Хочу записаться на бесплатную диагностику. Имя: ' + data.name +
        '. Кто будет заниматься: ' + data.who.toLowerCase() +
        '. Цель: ' + data.goal + ', формат: ' + data.format.toLowerCase();
      if (data.time) text += '. Удобное время: ' + data.time;
      return text;
    }

    function setLoading(on) {
      sending = on;
      submitBtn.disabled = on;
      submitBtn.setAttribute('aria-busy', on ? 'true' : 'false');
      submitLabel.textContent = on ? 'Отправляю заявку…' : 'Записаться на диагностику';
    }

    function showStatus(nodes) {
      status.innerHTML = '';
      nodes.forEach(function (n) { status.appendChild(n); });
      status.hidden = false;
    }

    function para(text) {
      var p = document.createElement('p');
      p.textContent = text;
      return p;
    }

    function waButton(href, label) {
      var a = document.createElement('a');
      a.className = 'btn btn-wa';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = label;
      return a;
    }

    function showThanks(data) {
      document.getElementById('thanks-title').textContent = 'Спасибо, ' + data.name + '!';
      document.getElementById('thanks-wa').href = waLink(thanksWaText(data));
      formArea.hidden = true;
      thanks.hidden = false;
      var sticky = document.getElementById('sticky-cta');
      if (sticky) sticky.remove();
      var title = document.getElementById('thanks-title');
      title.focus({ preventScroll: true });
      document.getElementById('zapis').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function showFailure(data, err) {
      var reason;
      if (err && err.message === 'not_configured') {
        reason = 'Онлайн-запись сейчас не подключена.';
      } else if (err && err.name === 'AbortError') {
        reason = 'Сервер не ответил вовремя — возможно, слабый интернет.';
      } else if (err instanceof TypeError) {
        reason = 'Не получилось отправить заявку — проверьте подключение к интернету.';
      } else {
        reason = 'Не получилось отправить заявку из-за ошибки на сервере.';
      }
      showStatus([
        para(reason + ' Чтобы заявка не потерялась, отправьте её мне в WhatsApp — текст уже подготовлен.'),
        waButton(waLink(fallbackWaText(data)), 'Отправить заявку в WhatsApp'),
        para('Или попробуйте отправить форму ещё раз через полминуты.')
      ]);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;
      status.hidden = true;

      if (form.elements.website.value) {
        showThanks(collect());
        return;
      }
      if (!validate()) return;

      var now = Date.now();
      var stored = parseInt(storageGet('localStorage', 'er_last_submit') || '0', 10) || 0;
      var last = Math.max(lastSubmit, stored);
      if (now - last < RATE_LIMIT_MS) {
        var wait = Math.ceil((RATE_LIMIT_MS - (now - last)) / 1000);
        showStatus([para('Заявку можно отправлять не чаще раза в 30 секунд. Попробуйте через ' + wait + ' сек.')]);
        return;
      }

      var data = collect();

      if (!isConfigured()) {
        if (window.console) console.warn('EnglishRoute: APPS_SCRIPT_URL не задан в main.js');
        showFailure(data, new Error('not_configured'));
        return;
      }

      lastSubmit = now;
      storageSet('localStorage', 'er_last_submit', String(now));
      setLoading(true);

      var controller = 'AbortController' in window ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;

      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data),
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) {
          if (!res.ok) throw new Error('http_' + res.status);
          return res.json().catch(function () { throw new Error('bad_json'); });
        })
        .then(function (json) {
          if (!json || json.ok !== true) throw new Error('not_ok');
          showThanks(data);
        })
        .catch(function (err) {
          showFailure(data, err);
        })
        .then(function () {
          if (timer) clearTimeout(timer);
          setLoading(false);
        });
    });
  }

  function init() {
    initForm();
    initReviews();
    initStickyCta();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
