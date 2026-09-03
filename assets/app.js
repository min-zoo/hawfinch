/* 손님용 예약 페이지 동작 ― 이 파일은 수정하지 않아도 됩니다.
   흐름: 수령 방법 고르기 → 방법에 맞는 예약서 작성 → 접수 */
(function () {
  'use strict';

  var openedAt = Date.now();   // 화면을 연 시각. 너무 빠른 제출을 걸러냅니다.
  var finished = false;        // 예약을 마치면 화면 구조가 사라집니다.
  var mode = null;        // 'pickup' | 'delivery'
  var qty = {};           // { 상품id: 수량 }
  var submitting = false;

  var $ = HF.$, won = HF.won, formatPhone = HF.formatPhone,
      validPhone = HF.validPhone, contactLine = HF.contactLine;

  var METHODS = {
    pickup:   { label: '매장 픽업', icon: '🏠',
                desc: '매장에 직접 오셔서 받아가십니다. 입금 확인 후 준비해 둡니다.',
                descOnsite: '매장에 직접 오셔서 받아가시고, 결제도 그때 하시면 됩니다.' },
    delivery: { label: '택배 발송', icon: '📦',
                desc: '원하는 주소로 보내드립니다. 입금 확인 후 발송됩니다.',
                descOnsite: '원하는 주소로 보내드립니다.' },
  };

  /* 선입금이냐 현장 결제냐에 따라 설명이 달라집니다. */
  function methodDesc(key) {
    var m = METHODS[key];
    return HF.prepay(key) ? m.desc : (m.descOnsite || m.desc);
  }

  /* ---------- 날짜 도우미 ---------- */

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function daysUntil(iso) {
    if (!iso) return null;
    return Math.round((new Date(iso + 'T00:00:00') -
                       new Date(todayStr() + 'T00:00:00')) / 86400000);
  }

  /* 마감일까지 남은 날. 마감일 당일은 0 이고, 지나면 음수가 됩니다. */
  function daysLeft() {
    var d = daysUntil(CONFIG.closeDate);
    return d === null ? Infinity : d;
  }

  /* 예약 시작 전이면 남은 날 수, 이미 시작했으면 0 이하 */
  function daysToOpen() {
    var d = daysUntil(CONFIG.openDate);
    return d === null ? 0 : d;
  }

  var isBeforeOpen = function () { return daysToOpen() > 0; };
  var isClosed     = function () { return daysLeft() < 0; };
  /* 신청을 받을 수 없는 상태 (시작 전이거나 마감 후) */
  var isLocked     = function () { return isBeforeOpen() || isClosed(); };

  /* '2026-09-20' → '9월 20일' */
  function korDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? Number(m[2]) + '월 ' + Number(m[3]) + '일' : String(iso || '');
  }

  var enabled = function (key) { return !!(CONFIG[key] && CONFIG[key].enabled); };

  /* 미리 입금을 받는 방법인지. config.js 의 pickup.prepay / delivery.prepay 로 정합니다. */
  function isPrepay(m) { return HF.prepay(m || mode); }


  /* ---------- 머리말 · 안내 ---------- */

  function renderShop() {
    var s = CONFIG.shop || {};
    document.title = (s.name ? s.name + ' ' : '') + '추석 디저트 선물세트 예약';

    var meta = $('heroMeta');
    var lines = [];
    if (s.name) lines.push(s.name + ' 사전 예약');
    if (CONFIG.openDate && CONFIG.closeDate) {
      lines.push('예약 기간  ' + korDate(CONFIG.openDate) + ' ~ ' + korDate(CONFIG.closeDate));
    } else if (CONFIG.closeDate) {
      lines.push('예약 마감  ' + korDate(CONFIG.closeDate) + ' 까지');
    }
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

    if (isBeforeOpen()) {
      box.innerHTML = '<div class="banner banner--soon">' +
        '<strong>예약은 ' + korDate(CONFIG.openDate) + '부터 시작됩니다.</strong><br>' +
        '(' + daysToOpen() + '일 남음) 그때 다시 찾아와 주세요.</div>';
    } else if (isClosed()) {
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
      btn.disabled = isLocked();

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
      desc.textContent = methodDesc(key);
      body.append(name, desc);

      var arrow = document.createElement('span');
      arrow.className = 'method__arrow';
      arrow.textContent = '›';

      btn.append(icon, body, arrow);
      btn.addEventListener('click', function () { selectMode(key); });
      box.appendChild(btn);
    });
  }

  /* 방법을 고르면 브라우저에 '한 단계 들어왔다'고 알려서,
     뒤로가기를 누르면 사이트를 벗어나지 않고 첫 화면으로 돌아오게 합니다. */
  function selectMode(m, fromHistory) {
    if (!fromHistory) {
      try { history.pushState({ view: 'form', mode: m }, ''); } catch (e) {}
    }
    mode = m;
    $('chooseView').hidden = true;
    $('formView').hidden = false;

    var isPickup = m === 'pickup';
    $('secPickup').hidden = !isPickup;
    $('secReceiver').hidden = isPickup;

    $('ordererStep').textContent = isPickup ? '3' : '2';
    $('ordererTitle').textContent = isPickup ? '예약자 정보' : '주문자 정보';
    /* 매장에서 따로 연락드리지 않으므로, 연락처의 쓰임을 사실대로 적습니다. */
    $('ordererHint').textContent = isPickup
      ? '픽업하실 때 예약을 확인하는 데 사용됩니다.'
      : '주문 확인에 사용되며, 문제가 있을 때만 연락드립니다.';

    $('depositorField').hidden = !isPrepay(m);
    $('memoField').hidden = !CONFIG.showMemo;
    $('cashField').hidden = !cashOn();

    var ship = $('shipNote');
    if (ship) ship.textContent = (CONFIG.delivery && CONFIG.delivery.shipPeriod) || '';

    $('modeBadge').textContent = METHODS[m].icon + ' ' + METHODS[m].label;
    $('modeDesc').textContent = isPickup ? '매장에서 직접 수령' : '주소로 보내드림';

    renderSummary();
    renderNote();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function backToChoose(fromHistory) {
    if (!fromHistory) {
      try { history.back(); return; } catch (e) {}   // 뒤로가기와 동작을 맞춥니다
    }
    mode = null;
    $('formView').hidden = true;
    $('chooseView').hidden = false;
    clearErrors();

    /* 수령 방법을 바꾸면 배송비 조건이 달라지므로 담은 수량을 비웁니다.
       방법별로만 쓰는 선택(픽업 날짜·시간)도 함께 지웁니다.
       성함·연락처처럼 방법과 상관없는 값은 그대로 둡니다. */
    renderProducts();
    document.querySelectorAll('input[name="pickupDate"], input[name="pickupTime"]')
      .forEach(function (el) { el.checked = false; });
    renderSummary();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 상품 ---------- */

  /* 가격이 아직 정해지지 않은 세트는 담을 수 없습니다. */
  var priceReady = function (p) { return typeof p.price === 'number' && p.price > 0; };

  /* 남은 수량. 한도를 정하지 않았으면 null(제한 없음)을 돌려줍니다.
     sold 는 매장에서 이미 팔린 수량으로, 저장소가 알려줍니다. */
  var soldMap = {};
  function leftOf(p) {
    if (typeof p.stock !== 'number' || p.stock < 0) return null;
    return Math.max(0, p.stock - (Number(soldMap[p.id]) || 0));
  }

  function renderProducts() {
    var list = $('productList');
    list.innerHTML = '';

    (CONFIG.products || []).forEach(function (p) {
      qty[p.id] = 0;

      var pending = !priceReady(p);
      var left = leftOf(p);
      var soldOut = p.soldOut || left === 0;
      var row = document.createElement('div');
      row.className = 'product' + (soldOut || pending ? ' product--out' : '');

      /* 상품 사진. 파일이 없으면 조용히 숨겨서 빈 칸이 남지 않게 합니다. */
      if (p.image) {
        var thumb = document.createElement('button');
        thumb.type = 'button';
        thumb.className = 'product__thumb';
        thumb.setAttribute('aria-label', p.name + ' 사진 크게 보기');

        var img = document.createElement('img');
        img.src = p.image;
        img.alt = p.name;
        img.loading = 'lazy';
        img.addEventListener('error', function () { thumb.remove(); });
        thumb.appendChild(img);
        thumb.addEventListener('click', function () { openPhoto(p.image, p.name); });

        row.appendChild(thumb);
      }

      var body = document.createElement('div');
      body.className = 'product__body';

      var name = document.createElement('p');
      name.className = 'product__name';
      name.textContent = p.name;
      if (soldOut) {
        name.insertAdjacentHTML('beforeend', ' <span class="badge badge--out">품절</span>');
      } else if (pending) {
        name.insertAdjacentHTML('beforeend', ' <span class="badge badge--out">준비 중</span>');
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
      if (p.note) {
        var note = document.createElement('p');
        note.className = 'product__note';
        note.textContent = p.note;
        body.appendChild(note);
      }

      /* 가격과 수량 버튼을 한 줄에 둡니다. 설명 글이 넓게 쓰이도록. */
      /* 얼마 안 남았으면 알려줍니다 */
      if (!soldOut && !pending && left !== null && left <= 10) {
        var leftEl = document.createElement('p');
        leftEl.className = 'product__left';
        leftEl.textContent = left + '개 남았습니다';
        body.appendChild(leftEl);
      }

      var foot = document.createElement('div');
      foot.className = 'product__foot';

      var price = document.createElement('p');
      price.className = 'product__price';
      price.textContent = pending ? '가격 준비 중' : won(p.price);
      if (pending) price.classList.add('product__price--pending');
      foot.appendChild(price);

      body.appendChild(foot);
      row.appendChild(body);

      if (!soldOut && !pending && !isLocked()) {
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

        var cap = left === null ? 99 : Math.min(99, left);
        var step = function (delta) {
          var next = Math.min(cap, Math.max(0, qty[p.id] + delta));
          qty[p.id] = next;
          num.textContent = String(next);
          minus.disabled = next === 0;
          plus.disabled = next >= cap;
          renderSummary();
          renderNote();
        };
        minus.addEventListener('click', function () { step(-1); });
        plus.addEventListener('click', function () { step(1); });

        ctrl.append(minus, num, plus);
        foot.appendChild(ctrl);
      }

      list.appendChild(row);
    });
  }

  function chosenItems() {
    return (CONFIG.products || [])
      .filter(function (p) { return qty[p.id] > 0 && priceReady(p); })
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

  /* 사진을 눌렀을 때 크게 보여줍니다. 어두운 배경 아무 데나 누르면 닫힙니다. */
  function openPhoto(src, alt) {
    var back = document.createElement('div');
    back.className = 'photo-view';

    var img = document.createElement('img');
    img.src = src;
    img.alt = alt || '';
    back.appendChild(img);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'photo-view__close';
    close.textContent = '✕';
    close.setAttribute('aria-label', '닫기');
    back.appendChild(close);

    function closeView() {
      back.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') closeView(); }

    back.addEventListener('click', closeView);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    document.body.appendChild(back);
    close.focus();
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

  /* ---------- 현금영수증 ---------- */

  var CASH_TYPES = ['소득공제', '지출증빙'];

  function cashOn() {
    var c = (CONFIG.delivery && CONFIG.delivery.cashReceipt) || {};
    if (!c.enabled) return false;
    if (!isPrepay()) return false;                 // 현장 결제면 매장에서 처리합니다
    return mode === 'delivery' || !!c.forPickup;
  }

  var cashType = function () { return picked('cashType') || CASH_TYPES[0]; };

  /* 사업자등록번호 000-00-00000 */
  function formatBizNo(v) {
    var d = v.replace(/[^0-9]/g, '').slice(0, 10);
    if (d.length < 4) return d;
    if (d.length < 6) return d.slice(0, 3) + '-' + d.slice(3);
    return d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5);
  }

  var validBizNo = function (v) { return /^\d{3}-\d{2}-\d{5}$/.test(v); };

  function cashValid() {
    var v = $('cashNo').value.trim();
    return cashType() === '지출증빙' ? validBizNo(v) : validPhone(v);
  }

  /* 용도에 따라 입력 안내와 서식이 달라집니다 */
  function syncCash() {
    var want = $('cashWant').checked;
    $('cashDetail').hidden = !want;
    var biz = cashType() === '지출증빙';
    $('cashNoLabel').textContent = biz ? '사업자등록번호' : '휴대폰 번호';
    $('cashNo').placeholder = biz ? '123-45-67890' : '010-1234-5678';
    $('cashNo').maxLength = biz ? 12 : 13;
  }

  /* ---------- 개인정보 동의 ---------- */

  function renderConsent() {
    var pv = CONFIG.privacy || {};
    var box = $('consentBox');
    if (!pv.required) { box.hidden = true; return; }
    box.hidden = false;

    var d = $('agreeDetail');
    d.innerHTML = '';
    var dl = document.createElement('dl');
    (pv.items || []).forEach(function (pair) {
      var dt = document.createElement('dt');
      dt.textContent = pair[0];
      var dd = document.createElement('dd');
      dd.textContent = pair[1];
      dl.append(dt, dd);
    });
    d.appendChild(dl);
    if (pv.refusal) {
      var note = document.createElement('p');
      note.textContent = pv.refusal;
      d.appendChild(note);
    }
  }

  var needAgree = function () { return !!(CONFIG.privacy && CONFIG.privacy.required); };

  /* ---------- 검사 ---------- */

  var ERROR_IDS = ['errProducts', 'errPickupDate', 'errPickupTime', 'errName', 'errPhone',
                   'errReceiverName', 'errReceiverPhone', 'errAddress', 'errCash',
                   'errAgree', 'errSubmit'];

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
    agree:          'errAgree',
    cashNo:         'errCash',
    cashTypeChips:  'errCash',
    postcode:       'errAddress',
    address1:       'errAddress',
    address2:       'errAddress',
    pickupDateChips: 'errPickupDate',
    pickupTimeChips: 'errPickupTime',
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

    if (cashOn() && $('cashWant').checked) {
      mark('errCash', !cashValid(), $('cashNo'));
    } else {
      $('errCash').hidden = true;
    }

    if (mode === 'delivery') {
      mark('errReceiverName', !$('receiverName').value.trim(), $('receiverName'));
      mark('errReceiverPhone', !validPhone($('receiverPhone').value.trim()), $('receiverPhone'));
      mark('errAddress', !($('postcode').value.trim() && $('address1').value.trim()), $('postcode'));
    }

    if (needAgree()) mark('errAgree', !$('agree').checked, $('consentBox'));

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

    var initial = (CONFIG.defaultStatus || {})[mode] || (CONFIG.statuses || [])[0] || '대기';

    var o = {
      method:      mode,
      methodLabel: METHODS[mode].label,
      status:      initial,          // 새 예약이 처음 받는 상태
      codeStart:   CONFIG.codeStart,   // 예약번호 시작 값
      codePrefix:  CONFIG.codePrefix,  // 예약번호 앞글자 (HFC-0100)
      trap:        $('website').value,          // 사람은 비워두는 칸
      elapsed:     Date.now() - openedAt,       // 작성에 걸린 시간(ms)
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
      receiverName: '', receiverPhone: '', address: '', depositor: '',
      cashReceipt: '',
      agreed: needAgree() ? '동의' : '',
      /* 저장소가 팔린 수량을 셀 수 있도록 기계가 읽기 쉬운 형태로도 담습니다 */
      itemCounts: items.map(function (i) { return i.id + ':' + i.count; }).join('|'),
      stockLimits: (CONFIG.products || []).filter(function (x) {
        return typeof x.stock === 'number';
      }).map(function (x) { return x.id + ':' + x.stock; }).join('|'),
      pickupDate: '', pickupDateLabel: '', pickupTime: '',
    };

    if (cashOn() && $('cashWant').checked) {
      o.cashReceipt = cashType() + ' ' + $('cashNo').value.trim();
    }

    if (isPrepay()) o.depositor = $('depositor').value.trim() || o.name;

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
      o.pickupDate = '';                                   // 발송일은 매장이 순차로 정합니다
      o.pickupDateLabel = (CONFIG.delivery && CONFIG.delivery.shipPeriod) || '';
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

  /* 클립보드 복사. 최신 방법이 막혀 있으면 예전 방법으로 한 번 더 시도합니다. */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text)
        .then(function () { return true; })
        .catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:absolute;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ---------- 예약 내용을 이미지로 저장 ----------
     손님이 예약번호를 잊어버리지 않도록, 완료 화면을 그림 한 장으로
     만들어 앨범에 저장할 수 있게 합니다. 화면을 그대로 찍는 대신 필요한
     내용만 직접 그리므로, 다른 회사 프로그램을 불러오지 않아도 됩니다. */

  var CARD_FONT = 'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';

  /* 글자가 칸을 넘어가면 줄을 나눕니다. 한글은 단어 사이가 없어도
     끊어야 하므로, 공백이 없으면 글자 단위로 나눕니다. */
  function wrapText(ctx, text, maxWidth) {
    var out = [];
    String(text == null ? '' : text).split('\n').forEach(function (para) {
      var line = '';
      para.split(/(\s+)/).forEach(function (piece) {
        if (!piece) return;
        if (ctx.measureText(line + piece).width <= maxWidth) { line += piece; return; }
        if (line.trim()) { out.push(line.trim()); line = ''; }
        if (ctx.measureText(piece).width <= maxWidth) { line = piece; return; }
        for (var i = 0; i < piece.length; i++) {
          if (ctx.measureText(line + piece[i]).width > maxWidth) { out.push(line); line = ''; }
          line += piece[i];
        }
      });
      out.push(line.trim());
    });
    return out.filter(function (t, i) { return t || i === 0; });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* 완료 화면의 내용을 그림으로 그립니다. rows 는 요약에 쓴 것과 같습니다. */
  function drawCard(code, rows, payLines) {
    var W = 720, PAD = 48, INNER = W - PAD * 2;
    var scale = Math.min(window.devicePixelRatio || 1, 3);

    /* 높이를 먼저 재기 위해 임시 캔버스에 글자 크기만 계산합니다. */
    var probe = document.createElement('canvas').getContext('2d');
    var plan = [];
    var y = 0;

    y += 56;                                     // 위 여백
    plan.push({ t: 'shop', y: y });  y += 34;    // 매장 이름
    plan.push({ t: 'title', y: y }); y += 54;    // 예약이 접수되었습니다
    y += 14;
    plan.push({ t: 'code', y: y });  y += 108;   // 예약번호 상자
    y += 12;

    rows.forEach(function (pair) {
      probe.font = '400 22px ' + CARD_FONT;
      var lines = wrapText(probe, pair[1], INNER - 150);
      plan.push({ t: 'row', y: y, label: pair[0], lines: lines });
      y += Math.max(1, lines.length) * 32 + 12;
    });

    if (payLines.length) {
      y += 10;
      plan.push({ t: 'payTop', y: y });
      y += 22;
      payLines.forEach(function (line) {
        plan.push({ t: 'pay', y: y, text: line.text, big: !!line.big });
        y += line.big ? 40 : 32;
      });
      y += 10;
    }

    y += 16;
    plan.push({ t: 'foot', y: y });
    y += 30 + 40;

    var H = y;
    var cv = document.createElement('canvas');
    cv.width = W * scale;
    cv.height = H * scale;
    var ctx = cv.getContext('2d');
    ctx.scale(scale, scale);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    /* 위쪽에 연둣빛 띠를 둘러 매장 화면과 같은 느낌을 냅니다. */
    ctx.fillStyle = '#eaf3e2';
    ctx.fillRect(0, 0, W, 10);

    var shop = (CONFIG.shop && CONFIG.shop.name) || '';
    var contact = contactLine();

    plan.forEach(function (it) {
      if (it.t === 'shop') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#8a9384';
        ctx.font = '600 20px ' + CARD_FONT;
        ctx.fillText(shop, W / 2, it.y + 20);
      } else if (it.t === 'title') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#2f3630';
        ctx.font = '700 30px ' + CARD_FONT;
        ctx.fillText('예약이 접수되었습니다', W / 2, it.y + 30);
      } else if (it.t === 'code') {
        ctx.fillStyle = '#f2f7ec';
        roundRect(ctx, PAD, it.y, INNER, 92, 18);
        ctx.fill();
        ctx.strokeStyle = '#d7e6c8';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#7d8a72';
        ctx.font = '600 18px ' + CARD_FONT;
        ctx.fillText('예약번호', W / 2, it.y + 30);
        ctx.fillStyle = '#2f3630';
        ctx.font = '700 40px ' + CARD_FONT;
        ctx.fillText(code, W / 2, it.y + 74);
      } else if (it.t === 'row') {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#8a9384';
        ctx.font = '500 22px ' + CARD_FONT;
        ctx.fillText(it.label, PAD, it.y + 22);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#2f3630';
        ctx.font = '400 22px ' + CARD_FONT;
        it.lines.forEach(function (line, i) {
          ctx.fillText(line, W - PAD, it.y + 22 + i * 32);
        });
      } else if (it.t === 'payTop') {
        ctx.strokeStyle = '#e6e9e2';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, it.y);
        ctx.lineTo(W - PAD, it.y);
        ctx.stroke();
      } else if (it.t === 'pay') {
        ctx.textAlign = 'center';
        ctx.fillStyle = it.big ? '#2f3630' : '#6d766a';
        ctx.font = (it.big ? '700 26px ' : '400 22px ') + CARD_FONT;
        ctx.fillText(it.text, W / 2, it.y + (it.big ? 28 : 22));
      } else if (it.t === 'foot') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#a3aa9d';
        ctx.font = '400 18px ' + CARD_FONT;
        var line = [shop, contact].filter(Boolean).join('  ·  ');
        ctx.fillText(line, W / 2, it.y + 18);
      }
    });

    return cv;
  }

  /* 아이폰 사파리는 내려받기가 막혀 있어, 그림을 띄우고 길게 눌러
     저장하시도록 안내합니다. 그 밖의 환경에서는 바로 내려받습니다. */
  var isIOS = function () {
    return /iP(hone|ad|od)/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };

  function showImageSheet(url, code) {
    var back = document.createElement('div');
    back.className = 'shot';
    var inner = document.createElement('div');
    inner.className = 'shot__inner';

    var hint = document.createElement('p');
    hint.className = 'shot__hint';
    hint.textContent = '그림을 길게 눌러 “사진에 추가”를 선택하세요.';

    var img = document.createElement('img');
    img.className = 'shot__img';
    img.src = url;
    img.alt = '예약번호 ' + code;

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn--ghost shot__close';
    close.textContent = '닫기';
    close.addEventListener('click', function () { back.remove(); });

    inner.append(hint, img, close);
    back.appendChild(inner);
    back.addEventListener('click', function (e) { if (e.target === back) back.remove(); });
    document.body.appendChild(back);
  }

  function saveCardImage(btn, code, rows, payLines) {
    var done = function (msg) {
      btn.textContent = msg;
      btn.disabled = false;
      setTimeout(function () { btn.textContent = '예약 내용 이미지로 저장'; }, 2500);
    };

    btn.disabled = true;
    btn.textContent = '만드는 중입니다…';

    var ready = (document.fonts && document.fonts.ready)
      ? document.fonts.ready.catch(function () {})
      : Promise.resolve();

    ready.then(function () {
      var cv;
      try {
        cv = drawCard(code, rows, payLines);
      } catch (e) {
        done('저장하지 못했습니다');
        return;
      }

      var url = cv.toDataURL('image/png');
      if (isIOS()) {
        showImageSheet(url, code);
        done('예약 내용 이미지로 저장');
        return;
      }

      var a = document.createElement('a');
      a.href = url;
      a.download = ((CONFIG.shop && CONFIG.shop.name) || '예약') + '_' + code + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      done('저장되었습니다');
    });
  }

  /* ---------- 완료 화면 ---------- */

  function showDone(order, code) {
    finished = true;
    var main = document.querySelector('.wrap');
    main.innerHTML = '';

    var box = document.createElement('div');
    box.className = 'card done';
    box.innerHTML =
      '<div class="done__mark">✓</div>' +
      '<h2 class="done__title">예약이 접수되었습니다</h2>';

    var lead = document.createElement('p');
    lead.className = 'done__text';
    var prepaid = isPrepay(order.method);
    lead.textContent = !prepaid
      ? '아래 예약번호를 저장해 두시고, 수령일에 매장으로 오시면 됩니다.'
      : (order.method === 'pickup'
         ? '아래 계좌로 입금해 주시면 확인 후 준비해 두겠습니다.'
         : '아래 계좌로 입금해 주시면 확인 후 발송해 드립니다.');
    box.appendChild(lead);

    var codeEl = document.createElement('div');
    codeEl.className = 'done__code';
    codeEl.textContent = '예약번호 ' + code;
    box.appendChild(codeEl);

    /* 매장에서 따로 연락드리지 않으므로, 예약번호가 유일한 확인 수단입니다. */
    var codeHint = document.createElement('p');
    codeHint.className = 'done__codehint';
    codeHint.textContent = order.method === 'pickup'
      ? '픽업하실 때 직원에게 이 번호를 보여주세요.'
      : '문의하실 때 이 번호를 알려주시면 빠릅니다.';
    box.appendChild(codeHint);

    /* 선입금으로 받는 방법: 입금 안내 */
    if (prepaid) {
      var bank = HF.bank();
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

        /* 계좌번호를 손으로 옮겨 적지 않도록 복사 버튼을 답니다.
           숫자만 복사해야 은행 앱에 그대로 붙여넣을 수 있습니다. */
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'paybox__copy';
        copyBtn.textContent = '계좌번호 복사';
        copyBtn.addEventListener('click', function () {
          copyText(bank.account.replace(/[^0-9]/g, '')).then(function (done) {
            copyBtn.textContent = done ? '복사되었습니다' : '복사하지 못했습니다';
            copyBtn.classList.toggle('is-done', done);
            setTimeout(function () {
              copyBtn.textContent = '계좌번호 복사';
              copyBtn.classList.remove('is-done');
            }, 2000);
          });
        });
        pay.appendChild(copyBtn);
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

      var payHint = document.createElement('p');
      payHint.className = 'paybox__sub';
      payHint.textContent = '입금자명이 다르면 매장으로 알려주세요.';
      pay.appendChild(payHint);

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
      if (order.depositor && order.depositor !== order.name) {
        rows.push(['입금자명', order.depositor]);
      }
      rows.push(['수령일시', order.pickupDateLabel + ' ' + order.pickupTime]);
    } else {
      rows.push(['주문자', order.name]);
      if (order.depositor && order.depositor !== order.name) {
        rows.push(['입금자명', order.depositor]);
      }
      rows.push(['받는 분', order.receiverName + ' · ' + order.receiverPhone]);
      rows.push(['배송지', order.address]);
      rows.push(['발송 일정', order.pickupDateLabel]);
    }
    rows.push(['주문내역', order.itemsText]);
    if (order.cashReceipt) rows.push(['현금영수증', order.cashReceipt]);
    if (order.method === 'delivery') {
      rows.push(['상품 금액', won(order.itemsPrice)]);
      rows.push(['배송비', order.shippingFee === null ? '추후 안내'
                 : (order.shippingFee === 0 ? '무료' : won(order.shippingFee))]);
    }
    rows.push([prepaid ? '입금하실 금액' : '결제예정', won(order.totalPrice)]);

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

    /* 예약번호를 앨범에 남겨두실 수 있게 그림으로 저장합니다. */
    var payLines = [];
    if (prepaid) {
      var b = HF.bank();
      if (b.bankName && b.account) {
        payLines.push({ text: '아래 계좌로 입금해 주세요' });
        payLines.push({ text: b.bankName + ' ' + b.account, big: true });
        if (b.holder) payLines.push({ text: '예금주 ' + b.holder });
      } else {
        payLines.push({ text: '입금 계좌는 매장에서 안내드립니다.' });
      }
    }

    var shot = document.createElement('button');
    shot.type = 'button';
    shot.className = 'btn btn--ghost';
    shot.style.cssText = 'display:block;width:100%;margin-top:20px;padding:14px;text-align:center';
    shot.textContent = '예약 내용 이미지로 저장';
    shot.addEventListener('click', function () {
      saveCardImage(shot, code, rows, payLines);
    });
    main.appendChild(shot);

    /* 예약번호를 잊어버려도 다시 확인할 수 있게 안내합니다. */
    var look = document.createElement('a');
    look.className = 'btn btn--ghost';
    look.style.cssText = 'display:block;width:100%;margin-top:10px;padding:14px;text-align:center;text-decoration:none';
    look.href = 'order.html?code=' + encodeURIComponent(code);
    look.textContent = '예약 내용 다시 보기';
    main.appendChild(look);

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
    if (submitting || isLocked() || !mode) return;
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

    renderConsent();
    $('agreeMore').addEventListener('click', function () {
      var d = $('agreeDetail');
      d.hidden = !d.hidden;
      $('agreeMore').textContent = d.hidden ? '내용 보기' : '접기';
    });

    renderChips('cashTypeChips', 'cashType',
      CASH_TYPES.map(function (t) { return { value: t, label: t }; }));
    var firstCash = document.querySelector('input[name="cashType"]');
    if (firstCash) firstCash.checked = true;

    $('cashWant').addEventListener('change', syncCash);
    $('cashTypeChips').addEventListener('change', function () {
      $('cashNo').value = '';
      syncCash();
    });
    $('cashNo').addEventListener('input', function (e) {
      e.target.value = cashType() === '지출증빙'
        ? formatBizNo(e.target.value) : formatPhone(e.target.value);
    });
    syncCash();

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

    $('changeMode').addEventListener('click', function () { backToChoose(); });

    /* 뒤로가기를 누르면 첫 화면으로.
       예약을 마친 뒤에는 예약서가 화면에서 사라진 상태라, 되돌리는 대신
       페이지를 새로 엽니다. (예약을 한 건 더 하려는 손님을 위해) */
    window.addEventListener('popstate', function (e) {
      if (finished) { location.reload(); return; }
      if (!$('formView')) return;

      var st = e.state;
      if (st && st.view === 'form' && st.mode) selectMode(st.mode, true);
      else if (!$('formView').hidden) backToChoose(true);
    });
    $('form').addEventListener('submit', onSubmit);
    $('form').addEventListener('change', function () { renderSummary(); });

    /* 픽업 또는 택배 하나만 열어둔 경우엔 고르는 화면을 건너뜁니다 */
    var open = ['pickup', 'delivery'].filter(enabled);
    if (open.length === 1) {
      selectMode(open[0], true);
      $('changeMode').hidden = true;
    }

    if (isLocked()) {
      var btn = $('submitBtn');
      btn.disabled = true;
      btn.textContent = isBeforeOpen()
        ? korDate(CONFIG.openDate) + '부터 예약할 수 있습니다'
        : '예약이 마감되었습니다';
      $('form').querySelectorAll('input, textarea').forEach(function (el) { el.disabled = true; });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
