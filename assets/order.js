/* 손님용 예약 확인 화면 ― 이 파일은 수정하지 않아도 됩니다. */
(function () {
  'use strict';

  var $ = HF.$, won = HF.won, formatPhone = HF.formatPhone, validPhone = HF.validPhone,
      contactLine = HF.contactLine, escapeHtml = HF.escapeHtml, korDate = HF.korDate;

  var current = null;      // 지금 화면에 보이는 예약
  var phoneUsed = '';      // 조회할 때 쓴 연락처 (변경·취소 때 다시 보냅니다)

  /* 손님에게는 매장 내부 용어 대신 지금 상황을 그대로 알려줍니다. */
  var STATE = {
    pickup: {
      '대기':     ['입금 대기 중입니다', '제품은 입금 확인 후 준비됩니다.'],
      '입금확인': ['입금이 확인되었습니다', '수령일에 매장으로 오시면 됩니다.'],
      '현장결제': ['예약이 접수되었습니다', '받으러 오실 때 매장에서 결제해 주시면 됩니다.'],
      '완료':     ['준비 완료', '매장에서 받아가실 수 있습니다.'],
      '취소':     ['취소된 예약입니다', '문의가 필요하시면 매장으로 연락 주세요.'],
    },
    delivery: {
      '대기':     ['입금 대기 중입니다', '제품은 입금 확인 후 준비되어 발송됩니다.'],
      '입금확인': ['입금이 확인되었습니다', '발송 일정에 맞춰 보냅니다.'],
      '현장결제': ['매장에서 결제하실 예정입니다', '자세한 내용은 매장으로 문의해 주세요.'],
      '완료':     ['발송 완료', '택배사 배송이 시작되었습니다.'],
      '취소':     ['취소된 예약입니다', '문의가 필요하시면 매장으로 연락 주세요.'],
    },
  };



  /* 예약번호 예시 (config.js 의 codePrefix 를 그대로 씁니다) */
  function codeSample() {
    return (CONFIG.codePrefix || 'HFC') + '-0100';
  }

  function renderShop() {
    var s = CONFIG.shop || {};
    document.title = (s.name ? s.name + ' ' : '') + '예약 확인';

    var info = $('shopInfo');
    info.innerHTML = '';
    var l1 = document.createElement('span');
    l1.className = 'footer__line';
    l1.textContent = [s.name, s.address].filter(Boolean).join(' · ');
    info.appendChild(l1);
    if (s.instagram) {
      var l2 = document.createElement('span');
      l2.className = 'footer__line';
      var a = document.createElement('a');
      a.href = 'https://instagram.com/' + s.instagram;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = '@' + s.instagram;
      l2.appendChild(a);
      info.appendChild(l2);
    }

    var contact = contactLine();
    var cc = CONFIG.customerChange || {};
    var rule = cc.enabled === false
      ? (contact ? '변경·취소가 필요하시면 — ' + escapeHtml(contact) : '변경·취소는 매장으로 문의해 주세요.')
      : '조회 후 <b>예약 변경</b>·<b>예약 취소</b> 버튼으로 직접 처리하실 수 있습니다. ' +
        escapeHtml(HF.changeRuleText()) + '만 됩니다.';
    $('noteBox').innerHTML = '<strong>안내</strong><ul>' +
      '<li>예약하실 때 받으신 예약번호(' + escapeHtml(codeSample()) + ' 형태)가 필요합니다.</li>' +
      '<li>' + rule + '</li>' +
      '<li>세트·수량을 바꾸시려면 입금 전에 취소하고 다시 예약해 주세요.</li></ul>';
  }


  /* ---------- 조회 ---------- */

  function lookup() {
    var code = $('code').value.trim().toUpperCase();
    var phone = $('phone').value.trim();

    if (!code || !phone) return fail('예약번호와 연락처를 모두 입력해 주세요.');
    if (!CONFIG.sheetUrl) return fail('아직 조회를 준비 중입니다. 매장으로 문의해 주세요.');

    var btn = $('findBtn');
    btn.disabled = true;
    btn.textContent = '조회 중입니다…';
    $('err').hidden = true;

    fetch(CONFIG.sheetUrl + '?action=lookup' +
          '&code=' + encodeURIComponent(code) +
          '&phone=' + encodeURIComponent(phone))
      .then(function (r) {
        if (!r.ok) throw new Error('서버 응답 오류 ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error((data && data.error) || '조회에 실패했습니다.');
        phoneUsed = phone;
        show(data.order);
      })
      .catch(function (e) { fail(e.message); })
      .then(function () {
        btn.disabled = false;
        btn.textContent = '예약 조회하기';
      });
  }

  function fail(msg) {
    var box = $('err');
    box.textContent = msg;
    box.hidden = false;
  }

  function row(box, label, value) {
    if (!value) return;
    var r = document.createElement('div');
    r.className = 'summary__row';
    var l = document.createElement('span');
    l.textContent = label;
    l.style.whiteSpace = 'nowrap';
    var v = document.createElement('span');
    v.textContent = value;
    v.style.color = 'var(--ink)';
    v.style.textAlign = 'right';
    r.append(l, v);
    box.appendChild(r);
  }

  function show(o) {
    current = o;
    var delivery = (o.method || 'pickup') === 'delivery';
    var map = STATE[delivery ? 'delivery' : 'pickup'] || {};
    var fallback = (CONFIG.defaultStatus || {})[delivery ? 'delivery' : 'pickup'];
    var st = map[o.status] || map[fallback] || ['접수되었습니다', ''];

    var box = $('result');
    box.innerHTML = '';

    var head = document.createElement('div');
    head.className = 'order-head' + (o.status === '취소' ? ' order-head--void' : '');
    head.innerHTML =
      '<p class="order-head__code">' + escapeHtml(o.code) + '</p>' +
      '<p class="order-head__state">' + escapeHtml(st[0]) + '</p>' +
      (st[1] ? '<p class="order-head__desc">' + escapeHtml(st[1]) + '</p>' : '') +
      (!delivery && o.status !== '취소'
        ? '<p class="order-head__show">픽업하실 때 받으신 예약번호를 알려주세요.</p>' : '');
    box.appendChild(head);

    var body = document.createElement('div');
    body.className = 'summary';

    row(body, '수령 방법', delivery ? '택배 발송' : '매장 픽업');
    row(body, '주문내역', o.itemsText);
    if (delivery) {
      row(body, '받는 분', [o.receiverName, o.receiverPhone].filter(Boolean).join(' · '));
      row(body, '배송지', o.address);
      row(body, '발송 일정', o.pickupDateLabel);
      row(body, '상품 금액', won(o.itemsPrice));
      row(body, '배송비', o.shippingFee === null || o.shippingFee === undefined
                          ? '추후 안내' : (o.shippingFee === 0 ? '무료' : won(o.shippingFee)));
    } else {
      row(body, '수령 일시', [o.pickupDateLabel, o.pickupTime].filter(Boolean).join(' '));
    }
    if (o.cashReceipt) {
      row(body, '현금영수증', o.cashReceipt + (o.receiptIssued ? ' · 발행 완료' : ' · 발행 예정'));
    }

    var total = document.createElement('div');
    total.className = 'summary__row summary__row--total';
    var tl = document.createElement('span');
    tl.textContent = HF.prepay(delivery ? 'delivery' : 'pickup') ? '입금하실 금액' : '결제 예정';
    var tv = document.createElement('span');
    tv.textContent = won(o.totalPrice);
    total.append(tl, tv);
    body.appendChild(total);

    box.appendChild(body);

    /* 아직 입금 전이면 계좌를 다시 보여줍니다 (픽업·택배 모두) */
    if (HF.prepay(delivery ? 'delivery' : 'pickup') && (o.status === '대기' || !o.status)) {
      var bank = HF.bank();
      if (bank.bankName && bank.account) {
        var pay = document.createElement('div');
        pay.className = 'paybox';
        pay.style.margin = '0 20px 20px';
        pay.innerHTML =
          '<p class="paybox__title">입금 안내</p>' +
          '<p class="paybox__account">' + escapeHtml(bank.bankName + ' ' + bank.account) + '</p>' +
          (bank.holder ? '<p class="paybox__sub">예금주 ' + escapeHtml(bank.holder) + '</p>' : '') +
          '<p class="paybox__amount">입금하실 금액 ' + won(o.totalPrice) + '</p>' +
          '<p class="paybox__sub">입금자명은 예약자 성함 「' + escapeHtml(o.name) + '」 으로 해주세요.</p>';
        box.appendChild(pay);
      }
    }

    renderActions(box, o);

    $('findView').hidden = true;
    $('resultView').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 손님이 직접 변경·취소 ---------- */

  var EDITABLE = ['대기', '입금확인'];      // 이 상태일 때만 손님이 손댈 수 있습니다

  function renderActions(box, o) {
    var delivery = (o.method || 'pickup') === 'delivery';
    var wrap = document.createElement('div');
    wrap.className = 'order-actions';

    var limit = HF.changeLimit(o.method, o.pickupDate);
    if (!limit) return;                                    // 기능이 꺼져 있음

    var msg = document.createElement('p');
    msg.className = 'order-actions__note';

    if (o.status === '취소') {
      return;                                              // 이미 취소된 예약
    }
    if (EDITABLE.indexOf(o.status || '대기') === -1) {
      msg.textContent = delivery
        ? '이미 발송된 예약은 변경·취소할 수 없습니다. 매장으로 문의해 주세요.'
        : '이미 전달된 예약입니다.';
      wrap.appendChild(msg);
      box.appendChild(wrap);
      return;
    }
    if (!limit.open) {
      msg.textContent = '변경·취소 가능 기한(' + korDate(limit.until) + ')이 지났습니다. ' +
                        '급한 사정은 매장으로 문의해 주세요.';
      wrap.appendChild(msg);
      box.appendChild(wrap);
      return;
    }

    msg.textContent = (limit.fixed ? '' : '수령일 ' + limit.days + '일 전인 ') +
                      korDate(limit.until) + '까지 직접 변경·취소하실 수 있습니다.';
    wrap.appendChild(msg);

    var row = document.createElement('div');
    row.className = 'order-actions__row';

    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn btn--ghost';
    edit.textContent = delivery ? '받는 분·주소 변경' : '수령일·시간 변경';
    edit.addEventListener('click', function () { openEdit(o); });

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn--ghost btn--danger';
    cancel.textContent = '예약 취소';
    cancel.addEventListener('click', function () { askCancel(o, cancel); });

    row.append(edit, cancel);
    wrap.appendChild(row);

    var err = document.createElement('p');
    err.className = 'error';
    err.id = 'actErr';
    err.hidden = true;
    wrap.appendChild(err);

    box.appendChild(wrap);
  }

  function actFail(msg) {
    var el = $('actErr');
    if (!el) return alert(msg);
    el.textContent = msg;
    el.hidden = false;
  }

  /* 서버에 손님 요청을 보냅니다. 예약번호 + 조회에 쓴 연락처로 본인 확인을 합니다. */
  function sendCustomer(payload) {
    var body = Object.assign({
      action: 'customer', code: current.code, phone: phoneUsed,
      /* 기한 계산에 필요한 값. 서버가 다시 검사합니다. */
      pickupDaysBefore: (CONFIG.customerChange || {}).pickupDaysBefore,
      pickupUntil: (CONFIG.customerChange || {}).pickupUntil,
      deliveryUntil: (CONFIG.customerChange || {}).deliveryUntil,
    }, payload);
    return fetch(CONFIG.sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error((data && data.error) || '처리하지 못했습니다.');
        return data;
      });
  }

  function askCancel(o, btn) {
    var paid = o.status === '입금확인';
    var text = o.code + ' 예약을 취소할까요?\n' +
      (paid ? '이미 입금하신 금액의 환불은 매장으로 문의해 주세요.\n' : '') +
      '취소한 뒤에는 되돌릴 수 없습니다.';
    if (!confirm(text)) return;

    btn.disabled = true;
    btn.textContent = '취소 중입니다…';
    sendCustomer({ op: 'cancel' }).then(function (data) {
      show(data.order);
      var head = $('result').querySelector('.order-head__desc');
      if (head) head.textContent = paid
        ? '취소되었습니다. 입금하신 금액의 환불은 매장으로 문의해 주세요.'
        : '취소되었습니다. 다시 예약하시려면 아래 「예약하러 가기」를 눌러주세요.';
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = '예약 취소';
      actFail(e.message);
    });
  }

  /* ----- 변경 화면 ----- */

  function chips(name, items, selected) {
    var box = document.createElement('div');
    box.className = 'chips';
    items.forEach(function (it) {
      var value = typeof it === 'string' ? it : it.date;
      var label = typeof it === 'string' ? it : it.label;
      var lab = document.createElement('label');
      lab.className = 'chip';
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.checked = value === selected;
      var span = document.createElement('span');
      span.textContent = label;
      lab.append(input, span);
      box.appendChild(lab);
    });
    return box;
  }

  function picked(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  function field(labelText, input, id) {
    var f = document.createElement('div');
    f.className = 'field';
    var l = document.createElement('label');
    l.className = 'field__label';
    l.textContent = labelText;
    if (id) { l.htmlFor = id; input.id = id; }
    f.append(l, input);
    return f;
  }

  function textInput(value, placeholder, maxLength) {
    var i = document.createElement('input');
    i.className = 'input';
    i.type = 'text';
    i.value = value || '';
    i.placeholder = placeholder || '';
    if (maxLength) i.maxLength = maxLength;
    return i;
  }

  function openEdit(o) {
    var delivery = (o.method || 'pickup') === 'delivery';
    var box = $('result');
    var old = box.querySelector('.order-actions');
    if (old) old.remove();

    var form = document.createElement('div');
    form.className = 'order-edit';

    var title = document.createElement('p');
    title.className = 'order-edit__title';
    title.textContent = delivery ? '받는 분·배송지 변경' : '수령일·시간 변경';
    form.appendChild(title);

    var get;   // 저장할 때 값을 모아 주는 함수

    if (!delivery) {
      var dl = document.createElement('span');
      dl.className = 'field__label';
      dl.textContent = '수령일';
      form.appendChild(dl);
      form.appendChild(chips('editDate', (CONFIG.pickup && CONFIG.pickup.dates) || [], o.pickupDate));

      var tl = document.createElement('span');
      tl.className = 'field__label';
      tl.style.marginTop = '14px';
      tl.textContent = '수령 시간';
      form.appendChild(tl);
      form.appendChild(chips('editTime', (CONFIG.pickup && CONFIG.pickup.times) || [], o.pickupTime));

      get = function () {
        var date = picked('editDate'), time = picked('editTime');
        if (!date || !time) throw new Error('수령일과 시간을 모두 골라주세요.');
        var hit = (CONFIG.pickup.dates || []).find(function (d) { return d.date === date; });
        return { op: 'change', pickupDate: date, pickupDateLabel: hit ? hit.label : date, pickupTime: time };
      };
    } else {
      var rn = textInput(o.receiverName, '홍길동', 30);
      var rp = textInput(o.receiverPhone, '010-1234-5678', 13);
      rp.type = 'tel';
      rp.inputMode = 'numeric';
      rp.addEventListener('input', function (e) { e.target.value = formatPhone(e.target.value); });

      /* 저장된 주소 '[우편번호] 기본주소 상세주소' 를 세 칸으로 나눕니다 */
      var m = /^\[(\d+)\]\s*(.*)$/.exec(o.address || '');
      var zip = textInput(m ? m[1] : '', '우편번호', 10);
      zip.inputMode = 'numeric';
      var a1 = textInput(m ? m[2] : (o.address || ''), '기본주소 (도로명 또는 지번)', 120);
      var a2 = textInput('', '상세주소 (동·호수 등) — 다시 적어주세요', 80);

      form.appendChild(field('받는 분 성함', rn, 'editRn'));
      form.appendChild(field('받는 분 연락처', rp, 'editRp'));

      var addrField = document.createElement('div');
      addrField.className = 'field';
      var al = document.createElement('span');
      al.className = 'field__label';
      al.textContent = '배송지 주소';
      addrField.appendChild(al);
      var addrRow = document.createElement('div');
      addrRow.className = 'addr-row';
      addrRow.appendChild(zip);
      if (HF.hasPostcode()) {
        var find = document.createElement('button');
        find.type = 'button';
        find.className = 'btn btn--ghost';
        find.textContent = '주소 찾기';
        find.addEventListener('click', function () {
          HF.openPostcode(function (z, a) { zip.value = z; a1.value = a; a2.focus(); });
        });
        addrRow.appendChild(find);
      }
      addrField.appendChild(addrRow);
      a1.style.marginTop = '9px';
      a2.style.marginTop = '9px';
      addrField.append(a1, a2);
      form.appendChild(addrField);

      var hint = document.createElement('p');
      hint.className = 'section__hint';
      hint.style.margin = '0';
      hint.textContent = '지금 저장된 주소: ' + (o.address || '—');
      form.appendChild(hint);

      get = function () {
        if (!rn.value.trim()) throw new Error('받는 분 성함을 입력해 주세요.');
        if (!validPhone(rp.value.trim())) throw new Error('받는 분 연락처를 정확히 입력해 주세요.');
        if (!zip.value.trim() || !a1.value.trim()) throw new Error('우편번호와 기본주소를 입력해 주세요.');
        return {
          op: 'change',
          receiverName: rn.value.trim(),
          receiverPhone: rp.value.trim(),
          address: ['[' + zip.value.trim() + ']', a1.value.trim(), a2.value.trim()].filter(Boolean).join(' '),
        };
      };
    }

    var err = document.createElement('p');
    err.className = 'error';
    err.hidden = true;
    form.appendChild(err);

    var row = document.createElement('div');
    row.className = 'order-actions__row';
    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn';
    save.textContent = '이대로 변경';
    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn btn--ghost';
    back.textContent = '돌아가기';
    back.addEventListener('click', function () { show(o); });
    row.append(save, back);
    form.appendChild(row);

    save.addEventListener('click', function () {
      var payload;
      try { payload = get(); } catch (e) { err.textContent = e.message; err.hidden = false; return; }
      err.hidden = true;
      save.disabled = true;
      save.textContent = '저장 중입니다…';
      sendCustomer(payload).then(function (data) {
        show(data.order);
        var head = $('result').querySelector('.order-head__desc');
        if (head) head.textContent = '변경되었습니다. ' + head.textContent;
      }).catch(function (e) {
        save.disabled = false;
        save.textContent = '이대로 변경';
        err.textContent = e.message;
        err.hidden = false;
      });
    });

    box.appendChild(form);
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderShop();

    $('phone').addEventListener('input', function (e) {
      e.target.value = formatPhone(e.target.value);
    });
    ['code', 'phone'].forEach(function (id) {
      $(id).addEventListener('input', function () { $('err').hidden = true; });
      $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(); });
    });

    $('findBtn').addEventListener('click', lookup);
    $('againBtn').addEventListener('click', function () {
      $('resultView').hidden = true;
      $('findView').hidden = false;
      $('code').value = '';
      $('phone').value = '';
      $('code').focus();
    });

    /* 예약 완료 화면에서 넘어온 경우 예약번호를 미리 채웁니다 */
    var m = /[?&]code=([^&]+)/.exec(location.search);
    if (m) $('code').value = decodeURIComponent(m[1]).toUpperCase();
  });
})();
