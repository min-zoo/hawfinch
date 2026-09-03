/* 손님용 예약 확인 화면 ― 이 파일은 수정하지 않아도 됩니다. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var won = function (n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; };

  /* 손님에게는 매장 내부 용어 대신 지금 상황을 그대로 알려줍니다. */
  var STATE = {
    pickup: {
      '대기':     ['예약이 접수되었습니다', '수령일에 매장으로 오시면 됩니다.'],
      '입금확인': ['입금이 확인되었습니다', '수령일에 매장으로 오시면 됩니다.'],
      '현장결제': ['예약이 접수되었습니다', '받으러 오실 때 매장에서 결제해 주시면 됩니다.'],
      '완료':     ['준비 완료', '매장에서 받아가실 수 있습니다.'],
      '취소':     ['취소된 예약입니다', '문의가 필요하시면 매장으로 연락 주세요.'],
    },
    delivery: {
      '대기':     ['입금을 기다리고 있습니다', '입금이 확인되면 발송 준비에 들어갑니다.'],
      '입금확인': ['입금이 확인되었습니다', '발송 일정에 맞춰 보내드립니다.'],
      '현장결제': ['매장에서 결제하실 예정입니다', '자세한 내용은 매장으로 문의해 주세요.'],
      '완료':     ['발송 완료', '택배사 배송이 시작되었습니다.'],
      '취소':     ['취소된 예약입니다', '문의가 필요하시면 매장으로 연락 주세요.'],
    },
  };

  function formatPhone(v) {
    var d = v.replace(/[^0-9]/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }

  function contactLine() {
    var s = CONFIG.shop || {};
    if (s.phone) return s.phone;
    if (s.instagram) return '인스타그램 DM @' + s.instagram;
    return '';
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
    $('noteBox').innerHTML = '<strong>안내</strong><ul>' +
      '<li>예약하실 때 받으신 예약번호(CS-0001 형태)가 필요합니다.</li>' +
      '<li>' + (contact
        ? '예약번호를 잊으셨거나 변경·취소가 필요하시면 — ' + escapeHtml(contact)
        : '예약번호를 잊으셨으면 매장으로 문의해 주세요.') + '</li></ul>';
  }

  function escapeHtml(t) {
    var d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
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
        ? '<p class="order-head__show">픽업하실 때 이 화면을 직원에게 보여주세요.</p>' : '');
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
    tl.textContent = delivery ? '합계' : '결제 예정';
    var tv = document.createElement('span');
    tv.textContent = won(o.totalPrice);
    total.append(tl, tv);
    body.appendChild(total);

    box.appendChild(body);

    /* 입금 전 택배 주문이면 계좌를 다시 보여줍니다 */
    if (delivery && (o.status === '대기' || !o.status)) {
      var bank = (CONFIG.delivery && CONFIG.delivery.bank) || {};
      if (bank.bankName && bank.account) {
        var pay = document.createElement('div');
        pay.className = 'paybox';
        pay.style.margin = '0 20px 20px';
        pay.innerHTML =
          '<p class="paybox__title">입금 안내</p>' +
          '<p class="paybox__account">' + escapeHtml(bank.bankName + ' ' + bank.account) + '</p>' +
          (bank.holder ? '<p class="paybox__sub">예금주 ' + escapeHtml(bank.holder) + '</p>' : '') +
          '<p class="paybox__amount">입금하실 금액 ' + won(o.totalPrice) + '</p>';
        box.appendChild(pay);
      }
    }

    $('findView').hidden = true;
    $('resultView').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
