/* 손님용 예약 페이지 동작 ― 이 파일은 수정하지 않아도 됩니다.
   흐름: 수령 방법 고르기 → 방법에 맞는 예약서 작성 → 접수 */
(function () {
  'use strict';

  var mode = null;        // 'pickup' | 'delivery'
  var qty = {};           // { 상품id: 수량 }
  var submitting = false;

  var $ = function (id) { return document.getElementById(id); };
  var won = function (n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; };

  var METHODS = {
    pickup:   { label: '매장 픽업', icon: '🏠',
                desc: '매장에 직접 오셔서 받아가시고, 결제도 그때 하시면 됩니다.' },
    delivery: { label: '택배 발송', icon: '📦',
                desc: '원하는 주소로 보내드립니다. 입금 확인 후 발송됩니다.' },
  };

  /* ---------- 날짜 도우미 ---------- */

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function daysLeft() {
    if (!CONFIG.closeDate) return Infinity;
    return Math.round((new Date(CONFIG.closeDate + 'T00:00:00') -
                       new Date(todayStr() + 'T00:00:00')) / 86400000);
  }

  var isClosed = function () { return daysLeft() < 0; };

  /* '2026-09-20' → '9월 20일' */
  function korDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? Number(m[2]) + '월 ' + Number(m[3]) + '일' : String(iso || '');
  }

  var enabled = function (key) { return !!(CONFIG[key] && CONFIG[key].enabled); };

  /* 매장 연락처 한 줄. 전화가 없으면 인스타그램으로 대체되고,
     둘 다 없으면 빈 값이 되어 문구에서 생략됩니다.
     (뒤에 조사가 붙지 않는 형태로 만들어, 아이디가 무엇이든 어색하지 않게 합니다.) */
  function contactLine() {
    var s = CONFIG.shop || {};
    if (s.phone) return s.phone;
    if (s.instagram) return '인스타그램 DM @' + s.instagram;
    return '';
  }

  /* ---------- 머리말 · 안내 ---------- */

  function renderShop() {
    var s = CONFIG.shop || {};
    document.title = (s.name ? s.name + ' ' : '') + '추석 디저트 선물세트 예약';

    var meta = $('heroMeta');
    var lines = [];
    if (s.name) lines.push(s.name + ' 사전 예약');
    if (CONFIG.closeDate) lines.push('예약 마감  ' + korDate(CONFIG.closeDate) + ' 까지');
    var ways = [];
    if (enabled('pickup')) ways.push('매장 픽업');
    if (enabled('delivery')) ways.push('택배 발송');
    if (ways.length) lines.push(ways.join(' · ') + ' 가능');

    meta.innerHTML = '';
    lines.forEach(function (t) {
      var span = document.createElement('span');
      span.textContent = t;
      meta.appendChild(span);
    });

    /* 바닥글: 매장명 · 주소 / 전화 · 인스타그램 */
    var info = $('shopInfo');
    info.innerHTML = '';

    var line1 = document.createElement('span');
    line1.className = 'footer__line';
    line1.textContent = [s.name, s.address].filter(Boolean).join(' · ');
    info.appendChild(line1);

    var line2 = document.createElement('span');
    line2.className = 'footer__line';

    if (s.phone) {
      var tel = document.createElement('a');
      tel.href = 'tel:' + s.phone.replace(/[^0-9+]/g, '');
      tel.textContent = s.phone;
      line2.appendChild(tel);
    }
    if (s.instagram) {
      if (s.phone) line2.appendChild(document.createTextNode(' · '));
      var ig = document.createElement('a');
      ig.href = 'https://instagram.com/' + s.instagram;
      ig.target = '_blank';
      ig.rel = 'noopener';
      ig.textContent = '@' + s.instagram;
      line2.appendChild(ig);
    }
    if (line2.childNodes.length) info.appendChild(line2);
  }

  function renderBanner() {
    var box = $('banner');
    var left = daysLeft();

    if (isClosed()) {
      box.innerHTML = '<div class="banner banner--closed">' +
        '<strong>예약이 마감되었습니다.</strong><br>문의는 매장으로 연락 주세요.' +
        (contactLine() ? '<br>' + contactLine() : '') + '</div>';
    } else if (left <= 3 && left !== Infinity) {
      box.innerHTML = '<div class="banner banner--warn"><strong>예약 마감이 ' +
        (left === 0 ? '오늘' : left + '일') + ' 남았습니다.</strong></div>';
    }

    /* 구글 시트를 연결하기 전에는 예약이 매장으로 가지 않습니다.
       실수로 손님에게 링크를 뿌리는 일이 없도록 크게 알립니다. */
    if (!CONFIG.sheetUrl) {
      box.insertAdjacentHTML('beforeend',
        '<div class="banner banner--demo">' +
        '<span class="banner__mark">준비 중</span>' +
        '<strong>아직 손님에게 이 링크를 보내지 마세요.</strong>' +
        '<span>구글 시트가 연결되지 않아, 지금 넣은 예약은 매장으로 전달되지 않고 ' +
        '이 기기에만 저장됩니다. 화면을 미리 확인하는 용도로만 사용해 주세요.</span>' +
        '</div>');
    }
  }

  /* 예약 안내 상자 (고른 방법에 따라 내용이 달라집니다) */
  function renderNote() {
    var box = $('noteBox');
    var items = [];

    if (mode === 'pickup') {
      if (CONFIG.pickup.notice) items.push(CONFIG.pickup.notice);
    } else {
      items.push('입금이 확인된 뒤 발송됩니다. 계좌는 신청 완료 화면에서 안내드립니다.');
      if (CONFIG.delivery.notice) items.push(CONFIG.delivery.notice);
      if (feeOf(itemsPrice()) === null) {
        items.push('배송비는 아직 확정되지 않아 합계에서 빠져 있습니다. 매장에서 함께 안내드립니다.');
      }
    }
    if (CONFIG.closeDate) items.push('예약 마감: ' + CONFIG.closeDate.replace(/-/g, '. ') + ' 까지');
    var contact = contactLine();
    items.push(contact ? '예약 변경·취소 문의 — ' + contact
                       : '예약 변경·취소는 매장으로 문의해 주세요.');

    box.innerHTML = '<strong>예약 안내</strong><ul>' +
      items.map(function (t) {
        var d = document.createElement('div');
        d.textContent = t;
        return '<li>' + d.innerHTML + '</li>';
      }).join('') + '</ul>';
  }

  /* ---------- 수령 방법 고르기 ---------- */

  function renderMethods() {
    var box = $('methodList');
    box.innerHTML = '';

    Object.keys(METHODS).forEach(function (key) {
      if (!enabled(key)) return;
      var m = METHODS[key];

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'method';
      btn.disabled = isClosed();

      var icon = document.createElement('span');
      icon.className = 'method__icon';
      icon.textContent = m.icon;

      var body = document.createElement('span');
      body.className = 'method__body';
      var name = document.createElement('span');
      name.className = 'method__name';
      name.textContent = m.label;
      var desc = document.createElement('span');
      desc.className = 'method__desc';
      desc.textContent = m.desc;
      body.append(name, desc);

      var arrow = document.createElement('span');
      arrow.className = 'method__arrow';
      arrow.textContent = '›';

      btn.append(icon, body, arrow);
      btn.addEventListener('click', function () { selectMode(key); });
      box.appendChild(btn);
    });
  }

  function selectMode(m) {
    mode = m;
    $('chooseView').hidden = true;
    $('formView').hidden = false;

    var isPickup = m === 'pickup';
    $('secPickup').hidden = !isPickup;
    $('secReceiver').hidden = isPickup;

    $('ordererStep').textContent = isPickup ? '3' : '2';
    $('ordererTitle').textContent = isPickup ? '예약자 정보' : '주문자 정보';
    $('ordererHint').textContent = isPickup
      ? '준비가 완료되면 이 번호로 연락드립니다.'
      : '입금 확인과 발송 안내를 이 번호로 드립니다.';

    $('modeBadge').textContent = METHODS[m].icon + ' ' + METHODS[m].label;
    $('modeDesc').textContent = isPickup ? '매장에서 직접 수령' : '주소로 보내드림';

    renderSummary();
    renderNote();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function backToChoose() {
    mode = null;
    $('formView').hidden = true;
    $('chooseView').hidden = false;
    clearErrors();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 상품 ---------- */

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
          plus.disabled = next === 99;
          renderSummary();
          renderNote();
        };
        minus.addEventListener('click', function () { step(-1); });
        plus.addEventListener('click', function () { step(1); });

        ctrl.append(minus, num, plus);
        row.appendChild(ctrl);
      }

      list.appendChild(row);
    });
  }

  function chosenItems() {
    return (CONFIG.products || [])
      .filter(function (p) { return qty[p.id] > 0; })
      .map(function (p) {
        return { id: p.id, name: p.name, price: p.price, count: qty[p.id],
                 amount: p.price * qty[p.id] };
      });
  }

  var itemsPrice = function () {
    return chosenItems().reduce(function (s, i) { return s + i.amount; }, 0);
  };

  /* 배송비. null 을 돌려주면 '아직 미정' 이라는 뜻입니다. */
  function feeOf(price) {
    if (mode !== 'delivery') return 0;
    var d = CONFIG.delivery || {};
    if (d.fee === null || d.fee === undefined) return null;
    if (d.freeOver !== null && d.freeOver !== undefined && price >= Number(d.freeOver)) return 0;
    return Number(d.fee) || 0;
  }

  /* ---------- 알약 버튼 ---------- */

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

  function picked(groupName) {
    var el = document.querySelector('input[name="' + groupName + '"]:checked');
    return el ? el.value : '';
  }

  /* ---------- 합계 ---------- */

  function renderSummary() {
    var items = chosenItems();
    var box = $('summary');
    box.innerHTML = '';

    if (!items.length) {
      box.innerHTML = '<p class="summary__empty">선택하신 선물세트가 여기에 표시됩니다.</p>';
      return;
    }

    var count = 0;
    items.forEach(function (it) {
      count += it.count;
      addRow(box, it.name + ' × ' + it.count, won(it.amount));
    });

    var price = itemsPrice();
    var fee = feeOf(price);

    if (mode === 'delivery') {
      addRow(box, '배송비', fee === null ? '추후 안내' : (fee === 0 ? '무료' : won(fee)));
    }

    var total = price + (fee || 0);
    var row = document.createElement('div');
    row.className = 'summary__row summary__row--total';
    var l = document.createElement('span');
    l.textContent = '합계 (' + count + '개)';
    var r = document.createElement('span');
    r.textContent = won(total);
    row.append(l, r);
    box.appendChild(row);
  }

  function addRow(box, left, right) {
    var row = document.createElement('div');
    row.className = 'summary__row';
    var l = document.createElement('span');
    l.textContent = left;
    var r = document.createElement('span');
    r.textContent = right;
    row.append(l, r);
    box.appendChild(row);
  }

  /* ---------- 연락처 ---------- */

  function formatPhone(v) {
    var d = v.replace(/[^0-9]/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }

  var validPhone = function (v) { return /^01[016789]-\d{3,4}-\d{4}$/.test(v); };

  /* ---------- 주소 ---------- */

  function setupAddress() {
    if (!window.daum || !window.daum.Postcode) return;   // 못 불러오면 직접 입력

    var btn = $('findAddr');
    btn.hidden = false;
    btn.addEventListener('click', function () {
      new window.daum.Postcode({
        oncomplete: function (data) {
          $('postcode').value = data.zonecode || '';
          $('address1').value = data.roadAddress || data.jibunAddress || '';
          $('address2').focus();
        },
      }).open();
    });
  }

  function syncReceiver() {
    var same = $('sameAsOrderer').checked;
    if (same) {
      $('receiverName').value = $('name').value;
      $('receiverPhone').value = $('phone').value;
    }
    $('receiverName').readOnly = same;
    $('receiverPhone').readOnly = same;
    $('receiverName').classList.toggle('input--locked', same);
    $('receiverPhone').classList.toggle('input--locked', same);
  }

  /* ---------- 검사 ---------- */

  var ERROR_IDS = ['errProducts', 'errPickupDate', 'errPickupTime', 'errName', 'errPhone',
                   'errReceiverName', 'errReceiverPhone', 'errAddress', 'errShipDate', 'errSubmit'];

  function clearErrors() {
    ERROR_IDS.forEach(function (id) { var el = $(id); if (el) el.hidden = true; });
  }

  /* 손님이 값을 고치면 그 칸의 빨간 경고를 바로 지웁니다.
     (고쳤는데도 경고가 남아 있으면 잘못된 것처럼 보이기 때문입니다.) */
  var WATCH = {
    name:           'errName',
    phone:          'errPhone',
    receiverName:   'errReceiverName',
    receiverPhone:  'errReceiverPhone',
    postcode:       'errAddress',
    address1:       'errAddress',
    address2:       'errAddress',
    pickupDateChips: 'errPickupDate',
    pickupTimeChips: 'errPickupTime',
    shipDateChips:   'errShipDate',
    productList:     'errProducts',
  };

  function watchErrors() {
    Object.keys(WATCH).forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var hide = function () {
        var err = $(WATCH[id]);
        if (err) err.hidden = true;
        $('errSubmit').hidden = true;
      };
      el.addEventListener('input', hide);
      el.addEventListener('change', hide);
      el.addEventListener('click', hide);
    });
  }

  function validate() {
    var bad = [];
    var mark = function (id, isBad, anchor) {
      $(id).hidden = !isBad;
      if (isBad) bad.push(anchor);
    };

    mark('errProducts', !chosenItems().length, $('productList'));

    if (mode === 'pickup') {
      mark('errPickupDate', !picked('pickupDate'), $('pickupDateChips'));
      mark('errPickupTime', !picked('pickupTime'), $('pickupTimeChips'));
    }

    mark('errName', !$('name').value.trim(), $('name'));
    mark('errPhone', !validPhone($('phone').value.trim()), $('phone'));

    if (mode === 'delivery') {
      mark('errReceiverName', !$('receiverName').value.trim(), $('receiverName'));
      mark('errReceiverPhone', !validPhone($('receiverPhone').value.trim()), $('receiverPhone'));
      mark('errAddress', !($('postcode').value.trim() && $('address1').value.trim()), $('postcode'));
      mark('errShipDate', !picked('shipDate'), $('shipDateChips'));
    }

    if (bad.length) bad[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    return bad.length === 0;
  }

  /* ---------- 주문 만들기 ---------- */

  function labelOf(list, value) {
    var hit = (list || []).find(function (d) { return d.date === value; });
    return hit ? hit.label : value;
  }

  function buildOrder() {
    var items = chosenItems();
    var price = itemsPrice();
    var fee = feeOf(price);

    var o = {
      method:      mode,
      methodLabel: METHODS[mode].label,
      shop:        (CONFIG.shop && CONFIG.shop.name) || '',
      name:        $('name').value.trim(),
      phone:       $('phone').value.trim(),
      memo:        $('memo').value.trim(),
      items:       items,
      itemsText:   items.map(function (i) { return i.name + ' ' + i.count + '개'; }).join(', '),
      totalCount:  items.reduce(function (s, i) { return s + i.count; }, 0),
      itemsPrice:  price,
      shippingFee: fee,                       // null 이면 미정
      totalPrice:  price + (fee || 0),
      receiverName: '', receiverPhone: '', address: '',
      pickupDate: '', pickupDateLabel: '', pickupTime: '',
    };

    if (mode === 'pickup') {
      o.pickupDate = picked('pickupDate');
      o.pickupDateLabel = labelOf(CONFIG.pickup.dates, o.pickupDate);
      o.pickupTime = picked('pickupTime');
    } else {
      o.receiverName = $('receiverName').value.trim();
      o.receiverPhone = $('receiverPhone').value.trim();
      o.address = ['[' + $('postcode').value.trim() + ']',
                   $('address1').value.trim(),
                   $('address2').value.trim()].filter(Boolean).join(' ');
      o.pickupDate = picked('shipDate');
      o.pickupDateLabel = labelOf(CONFIG.delivery.dates, o.pickupDate);
    }
    return o;
  }

  /* ---------- 전송 ---------- */

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

  function saveLocally(order) {
    var code = 'DEMO-' + String(Date.now()).slice(-5);
    try {
      var key = 'chuseok-demo-orders';
      var all = JSON.parse(localStorage.getItem(key) || '[]');
      all.push(Object.assign({ code: code, createdAt: new Date().toISOString(), status: '대기' }, order));
      localStorage.setItem(key, JSON.stringify(all));
    } catch (e) { /* 저장 못 해도 화면은 정상 진행 */ }
    return Promise.resolve(code);
  }

  /* ---------- 완료 화면 ---------- */

  function showDone(order, code) {
    var main = document.querySelector('.wrap');
    main.innerHTML = '';

    var box = document.createElement('div');
    box.className = 'card done';
    box.innerHTML =
      '<div class="done__mark">✓</div>' +
      '<h2 class="done__title">예약이 접수되었습니다</h2>';

    var lead = document.createElement('p');
    lead.className = 'done__text';
    lead.textContent = order.method === 'pickup'
      ? '준비가 완료되면 문자 또는 전화로 안내드리겠습니다.'
      : '아래 계좌로 입금해 주시면 확인 후 발송해 드립니다.';
    box.appendChild(lead);

    var codeEl = document.createElement('div');
    codeEl.className = 'done__code';
    codeEl.textContent = '예약번호 ' + code;
    box.appendChild(codeEl);

    /* 택배: 입금 안내 */
    if (order.method === 'delivery') {
      var bank = (CONFIG.delivery && CONFIG.delivery.bank) || {};
      var pay = document.createElement('div');
      pay.className = 'paybox';

      var title = document.createElement('p');
      title.className = 'paybox__title';
      title.textContent = '입금 안내';
      pay.appendChild(title);

      if (bank.bankName && bank.account) {
        var acc = document.createElement('p');
        acc.className = 'paybox__account';
        acc.textContent = bank.bankName + ' ' + bank.account;
        pay.appendChild(acc);
        if (bank.holder) {
          var holder = document.createElement('p');
          holder.className = 'paybox__sub';
          holder.textContent = '예금주 ' + bank.holder;
          pay.appendChild(holder);
        }
      } else {
        var later = document.createElement('p');
        later.className = 'paybox__sub';
        later.textContent = '입금 계좌는 매장에서 문자로 안내드립니다.';
        pay.appendChild(later);
      }

      var amount = document.createElement('p');
      amount.className = 'paybox__amount';
      amount.textContent = order.shippingFee === null
        ? '상품 금액 ' + won(order.itemsPrice) + ' (배송비 별도 안내)'
        : '입금하실 금액 ' + won(order.totalPrice);
      pay.appendChild(amount);

      box.appendChild(pay);
    }

    /* 내역 요약 */
    var recap = document.createElement('div');
    recap.className = 'summary';
    recap.style.textAlign = 'left';
    recap.style.marginTop = '24px';
    recap.style.borderTop = '1px solid var(--line)';

    var rows = [['수령 방법', order.methodLabel]];
    if (order.method === 'pickup') {
      rows.push(['예약자', order.name]);
      rows.push(['연락처', order.phone]);
      rows.push(['수령일시', order.pickupDateLabel + ' ' + order.pickupTime]);
    } else {
      rows.push(['주문자', order.name]);
      rows.push(['받는 분', order.receiverName + ' · ' + order.receiverPhone]);
      rows.push(['배송지', order.address]);
      rows.push(['발송 희망일', order.pickupDateLabel]);
    }
    rows.push(['주문내역', order.itemsText]);
    if (order.method === 'delivery') {
      rows.push(['상품 금액', won(order.itemsPrice)]);
      rows.push(['배송비', order.shippingFee === null ? '추후 안내'
                 : (order.shippingFee === 0 ? '무료' : won(order.shippingFee))]);
    }
    rows.push([order.method === 'pickup' ? '결제예정' : '합계', won(order.totalPrice)]);

    rows.forEach(function (pair) {
      var row = document.createElement('div');
      row.className = 'summary__row';
      var l = document.createElement('span');
      l.textContent = pair[0];
      l.style.whiteSpace = 'nowrap';
      var r = document.createElement('span');
      r.textContent = pair[1];
      r.style.color = 'var(--ink)';
      r.style.textAlign = 'right';
      row.append(l, r);
      recap.appendChild(row);
    });
    box.appendChild(recap);
    main.appendChild(box);

    var note = document.createElement('div');
    note.className = 'note';
    var msg = order.method === 'pickup'
      ? ((CONFIG.pickup && CONFIG.pickup.notice) || '')
      : ((CONFIG.delivery && CONFIG.delivery.notice) || '');
    var strong = document.createElement('strong');
    strong.textContent = msg;
    note.appendChild(strong);
    var contact = contactLine();
    note.appendChild(document.createElement('br'));
    note.appendChild(document.createTextNode(
      contact ? '변경·취소 문의 — ' + contact : '변경·취소는 매장으로 문의해 주세요.'));
    main.appendChild(note);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 제출 ---------- */

  function onSubmit(e) {
    e.preventDefault();
    if (submitting || isClosed() || !mode) return;
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
    renderMethods();
    renderProducts();

    renderChips('pickupDateChips', 'pickupDate',
      ((CONFIG.pickup && CONFIG.pickup.dates) || []).map(function (d) {
        return { value: d.date, label: d.label }; }));
    renderChips('pickupTimeChips', 'pickupTime',
      ((CONFIG.pickup && CONFIG.pickup.times) || []).map(function (t) {
        return { value: t, label: t }; }));
    renderChips('shipDateChips', 'shipDate',
      ((CONFIG.delivery && CONFIG.delivery.dates) || []).map(function (d) {
        return { value: d.date, label: d.label }; }));

    setupAddress();
    watchErrors();

    ['phone', 'receiverPhone'].forEach(function (id) {
      $(id).addEventListener('input', function (e) {
        e.target.value = formatPhone(e.target.value);
        if (id === 'phone') syncReceiver();
      });
    });
    $('name').addEventListener('input', syncReceiver);
    $('sameAsOrderer').addEventListener('change', syncReceiver);

    $('changeMode').addEventListener('click', backToChoose);
    $('form').addEventListener('submit', onSubmit);
    $('form').addEventListener('change', function () { renderSummary(); });

    /* 픽업 또는 택배 하나만 열어둔 경우엔 고르는 화면을 건너뜁니다 */
    var open = ['pickup', 'delivery'].filter(enabled);
    if (open.length === 1) {
      selectMode(open[0]);
      $('changeMode').hidden = true;
    }

    if (isClosed()) {
      var btn = $('submitBtn');
      btn.disabled = true;
      btn.textContent = '예약이 마감되었습니다';
      $('form').querySelectorAll('input, textarea').forEach(function (el) { el.disabled = true; });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
