/* 손님용 예약 페이지 동작 ― 이 파일은 수정하지 않아도 됩니다. */
(function () {
  'use strict';

  var qty       = {};   // { 상품id: 수량 }
  var submitting = false;

  var $ = function (id) { return document.getElementById(id); };

  var won = function (n) { return n.toLocaleString('ko-KR') + '원'; };

  /* 오늘 날짜를 'YYYY-MM-DD' 로 (시간대 영향 없이) */
  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /* 마감일까지 남은 일수 (음수면 이미 마감) */
  function daysLeft() {
    if (!CONFIG.closeDate) return Infinity;
    var a = new Date(todayStr() + 'T00:00:00');
    var b = new Date(CONFIG.closeDate + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  var isClosed = function () { return daysLeft() < 0; };

  /* ---------- 화면 그리기 ---------- */

  /* '2026-09-20' → '9월 20일' */
  function korDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? Number(m[2]) + '월 ' + Number(m[3]) + '일' : String(iso || '');
  }

  function renderShop() {
    var s = CONFIG.shop || {};
    document.title = (s.name ? s.name + ' · ' : '') + '추석 디저트 선물세트 예약';
    if (s.notice) $('noteNotice').textContent = s.notice;

    if (CONFIG.closeDate) {
      $('noteClose').textContent =
        '예약 마감: ' + CONFIG.closeDate.replace(/-/g, '. ') + ' 까지';
    }

    /* 머리말의 안내 줄 (레퍼런스 달력의 영업시간 표기와 같은 자리) */
    var meta = $('heroMeta');
    if (meta) {
      var lines = [];
      if (s.name) lines.push(s.name + ' 사전 예약');
      if (CONFIG.closeDate) lines.push('예약 마감  ' + korDate(CONFIG.closeDate) + ' 까지');
      var days = CONFIG.pickupDates || [];
      if (days.length) {
        lines.push('픽업 기간  ' + korDate(days[0].date) +
                   (days.length > 1 ? ' ~ ' + korDate(days[days.length - 1].date) : ''));
      }
      meta.innerHTML = '';
      lines.forEach(function (t) {
        var span = document.createElement('span');
        span.textContent = t;
        meta.appendChild(span);
      });
    }

    var bits = [];
    if (s.name)    bits.push(s.name);
    if (s.address) bits.push(s.address);
    var info = $('shopInfo');
    info.textContent = bits.join(' · ');
    if (s.phone) {
      info.appendChild(document.createTextNode(bits.length ? ' · ' : ''));
      var a = document.createElement('a');
      a.href = 'tel:' + s.phone.replace(/[^0-9+]/g, '');
      a.textContent = s.phone;
      info.appendChild(a);
    }
  }

  function renderBanner() {
    var box = $('banner');
    var left = daysLeft();

    if (isClosed()) {
      box.innerHTML = '<div class="banner banner--closed">' +
        '<strong>예약이 마감되었습니다.</strong><br>' +
        '문의는 매장으로 연락 주세요.</div>';
    } else if (left <= 3 && left !== Infinity) {
      box.innerHTML = '<div class="banner banner--warn">' +
        '<strong>예약 마감이 ' + (left === 0 ? '오늘' : left + '일') + ' 남았습니다.</strong></div>';
    }

    if (!CONFIG.sheetUrl) {
      box.insertAdjacentHTML('beforeend',
        '<div class="banner banner--warn">연습 모드입니다. ' +
        '이 예약은 매장으로 전송되지 않고 이 기기에만 저장됩니다.</div>');
    }
  }

  function renderProducts() {
    var list = $('productList');
    list.innerHTML = '';

    (CONFIG.products || []).forEach(function (p) {
      qty[p.id] = 0;

      var row = document.createElement('div');
      row.className = 'product' + (p.soldOut ? ' product--out' : '');

      var body = document.createElement('div');
      body.className = 'product__body';

      var name = document.createElement('p');
      name.className = 'product__name';
      name.textContent = p.name;
      if (p.soldOut) {
        name.insertAdjacentHTML('beforeend', ' <span class="badge badge--out">품절</span>');
      } else if (p.badge) {
        var b = document.createElement('span');
        b.className = 'badge';
        b.textContent = p.badge;
        name.appendChild(b);
      }
      body.appendChild(name);

      if (p.desc) {
        var desc = document.createElement('p');
        desc.className = 'product__desc';
        desc.textContent = p.desc;
        body.appendChild(desc);
      }

      var price = document.createElement('p');
      price.className = 'product__price';
      price.textContent = won(p.price);
      price.style.margin = '0';
      body.appendChild(price);

      row.appendChild(body);

      if (!p.soldOut && !isClosed()) {
        var ctrl = document.createElement('div');
        ctrl.className = 'qty';

        var minus = document.createElement('button');
        minus.type = 'button';
        minus.className = 'qty__btn';
        minus.textContent = '−';
        minus.disabled = true;
        minus.setAttribute('aria-label', p.name + ' 수량 줄이기');

        var num = document.createElement('span');
        num.className = 'qty__num';
        num.textContent = '0';
        num.setAttribute('aria-live', 'polite');

        var plus = document.createElement('button');
        plus.type = 'button';
        plus.className = 'qty__btn';
        plus.textContent = '+';
        plus.setAttribute('aria-label', p.name + ' 수량 늘리기');

        var step = function (delta) {
          var next = Math.min(99, Math.max(0, qty[p.id] + delta));
          qty[p.id] = next;
          num.textContent = String(next);
          minus.disabled = next === 0;
          plus.disabled  = next === 99;
          renderSummary();
        };
        minus.addEventListener('click', function () { step(-1); });
        plus.addEventListener('click',  function () { step(1); });

        ctrl.append(minus, num, plus);
        row.appendChild(ctrl);
      }

      list.appendChild(row);
    });
  }

  /* 라디오 버튼 묶음(칩) 만들기 */
  function renderChips(boxId, groupName, items) {
    var box = $(boxId);
    box.innerHTML = '';
    items.forEach(function (item, i) {
      var label = document.createElement('label');
      label.className = 'chip';

      var input = document.createElement('input');
      input.type = 'radio';
      input.name = groupName;
      input.value = item.value;
      input.id = groupName + '-' + i;

      var span = document.createElement('span');
      span.textContent = item.label;

      label.append(input, span);
      box.appendChild(label);
    });
  }

  function selectedChip(groupName) {
    var el = document.querySelector('input[name="' + groupName + '"]:checked');
    return el ? el.value : '';
  }

  function chosenItems() {
    return (CONFIG.products || [])
      .filter(function (p) { return qty[p.id] > 0; })
      .map(function (p) {
        return { id: p.id, name: p.name, price: p.price, count: qty[p.id],
                 amount: p.price * qty[p.id] };
      });
  }

  function renderSummary() {
    var items = chosenItems();
    var box = $('summary');
    box.innerHTML = '';

    if (!items.length) {
      box.innerHTML = '<p class="summary__empty">선택하신 선물세트가 여기에 표시됩니다.</p>';
      return;
    }

    var total = 0, count = 0;
    items.forEach(function (it) {
      total += it.amount;
      count += it.count;
      var row = document.createElement('div');
      row.className = 'summary__row';
      var left = document.createElement('span');
      left.textContent = it.name + ' × ' + it.count;
      var right = document.createElement('span');
      right.textContent = won(it.amount);
      row.append(left, right);
      box.appendChild(row);
    });

    var totalRow = document.createElement('div');
    totalRow.className = 'summary__row summary__row--total';
    var l = document.createElement('span');
    l.textContent = '합계 (' + count + '개)';
    var r = document.createElement('span');
    r.textContent = won(total);
    totalRow.append(l, r);
    box.appendChild(totalRow);
  }

  /* ---------- 연락처 입력 도우미 ---------- */

  function formatPhone(v) {
    var d = v.replace(/[^0-9]/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }

  function validPhone(v) {
    return /^01[016789]-\d{3,4}-\d{4}$/.test(v);
  }

  /* ---------- 검사 & 전송 ---------- */

  function showError(id, show) {
    $(id).hidden = !show;
    return !show;
  }

  function validate() {
    var ok = true;
    var firstBad = null;

    if (!chosenItems().length) { showError('errProducts', true); ok = false; firstBad = firstBad || $('productList'); }
    else showError('errProducts', false);

    if (!selectedChip('pickupDate')) { showError('errDate', true); ok = false; firstBad = firstBad || $('dateChips'); }
    else showError('errDate', false);

    if (!selectedChip('pickupTime')) { showError('errTime', true); ok = false; firstBad = firstBad || $('timeChips'); }
    else showError('errTime', false);

    if (!$('name').value.trim()) { showError('errName', true); ok = false; firstBad = firstBad || $('name'); }
    else showError('errName', false);

    if (!validPhone($('phone').value.trim())) { showError('errPhone', true); ok = false; firstBad = firstBad || $('phone'); }
    else showError('errPhone', false);

    if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return ok;
  }

  function buildOrder() {
    var items = chosenItems();
    var dateValue = selectedChip('pickupDate');
    var dateItem = (CONFIG.pickupDates || []).find(function (d) { return d.date === dateValue; });

    return {
      shop:       (CONFIG.shop && CONFIG.shop.name) || '',
      name:       $('name').value.trim(),
      phone:      $('phone').value.trim(),
      memo:       $('memo').value.trim(),
      pickupDate: dateValue,
      pickupDateLabel: dateItem ? dateItem.label : dateValue,
      pickupTime: selectedChip('pickupTime'),
      items:      items,
      itemsText:  items.map(function (i) { return i.name + ' ' + i.count + '개'; }).join(', '),
      totalCount: items.reduce(function (s, i) { return s + i.count; }, 0),
      totalPrice: items.reduce(function (s, i) { return s + i.amount; }, 0),
    };
  }

  /* 구글 시트로 전송.
     Content-Type 을 text/plain 으로 보내면 브라우저 사전확인(preflight) 없이
     구글 앱스 스크립트가 받아줍니다. */
  function sendToSheet(order) {
    return fetch(CONFIG.sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(order),
    }).then(function (res) {
      if (!res.ok) throw new Error('서버 응답 오류 ' + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || data.ok !== true) throw new Error((data && data.error) || '저장에 실패했습니다.');
      return data.code;
    });
  }

  /* 연습 모드: 이 기기에만 저장 */
  function saveLocally(order) {
    var code = 'DEMO-' + String(Date.now()).slice(-5);
    try {
      var key = 'chuseok-demo-orders';
      var all = JSON.parse(localStorage.getItem(key) || '[]');
      all.push(Object.assign({ code: code, createdAt: new Date().toISOString() }, order));
      localStorage.setItem(key, JSON.stringify(all));
    } catch (e) { /* 저장 못 해도 화면은 정상 진행 */ }
    return Promise.resolve(code);
  }

  function showDone(order, code) {
    var main = document.querySelector('.wrap');
    main.innerHTML = '';

    var box = document.createElement('div');
    box.className = 'card done';
    box.innerHTML =
      '<div class="done__mark">✓</div>' +
      '<h2 class="done__title">예약이 접수되었습니다</h2>' +
      '<p class="done__text">준비가 완료되면 문자 또는 전화로 안내드리겠습니다.</p>';

    var code_ = document.createElement('div');
    code_.className = 'done__code';
    code_.textContent = '예약번호 ' + code;
    box.appendChild(code_);

    var recap = document.createElement('div');
    recap.className = 'summary';
    recap.style.textAlign = 'left';
    recap.style.marginTop = '24px';
    recap.style.borderTop = '1px solid var(--line)';
    [
      ['예약자',  order.name],
      ['연락처',  order.phone],
      ['수령일시', order.pickupDateLabel + ' ' + order.pickupTime],
      ['주문내역', order.itemsText],
      ['결제예정', order.totalPrice.toLocaleString('ko-KR') + '원'],
    ].forEach(function (pair) {
      var row = document.createElement('div');
      row.className = 'summary__row';
      var l = document.createElement('span'); l.textContent = pair[0];
      l.style.whiteSpace = 'nowrap';
      var r = document.createElement('span'); r.textContent = pair[1];
      r.style.color = 'var(--ink)';
      r.style.textAlign = 'right';
      row.append(l, r);
      recap.appendChild(row);
    });
    box.appendChild(recap);
    main.appendChild(box);

    var note = document.createElement('div');
    note.className = 'note';
    note.innerHTML = '<strong>' + ((CONFIG.shop && CONFIG.shop.notice) || '') + '</strong>';
    if (CONFIG.shop && CONFIG.shop.phone) {
      note.insertAdjacentHTML('beforeend',
        '<br>변경·취소 문의: ' + CONFIG.shop.phone);
    }
    main.appendChild(note);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (submitting || isClosed()) return;
    if (!validate()) return;

    submitting = true;
    var btn = $('submitBtn');
    btn.disabled = true;
    btn.textContent = '접수 중입니다…';
    $('errSubmit').hidden = true;

    var order = buildOrder();
    var task = CONFIG.sheetUrl ? sendToSheet(order) : saveLocally(order);

    task.then(function (code) {
      showDone(order, code);
    }).catch(function (err) {
      submitting = false;
      btn.disabled = false;
      btn.textContent = '예약 신청하기';
      var box = $('errSubmit');
      box.textContent = '전송에 실패했습니다. 잠시 후 다시 시도하시거나 매장으로 연락 주세요. (' + err.message + ')';
      box.hidden = false;
    });
  }

  /* ---------- 시작 ---------- */

  function init() {
    renderShop();
    renderBanner();
    renderProducts();

    renderChips('dateChips', 'pickupDate',
      (CONFIG.pickupDates || []).map(function (d) { return { value: d.date, label: d.label }; }));
    renderChips('timeChips', 'pickupTime',
      (CONFIG.pickupTimes || []).map(function (t) { return { value: t, label: t }; }));

    renderSummary();

    $('phone').addEventListener('input', function (e) {
      e.target.value = formatPhone(e.target.value);
    });

    $('form').addEventListener('submit', onSubmit);
    $('form').addEventListener('change', function () { renderSummary(); });

    if (isClosed()) {
      var btn = $('submitBtn');
      btn.disabled = true;
      btn.textContent = '예약이 마감되었습니다';
      $('form').querySelectorAll('input, textarea').forEach(function (el) { el.disabled = true; });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
