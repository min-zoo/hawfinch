/* 매장 직원용 예약 목록 화면 ― 이 파일은 수정하지 않아도 됩니다. */
(function () {
  'use strict';

  var $ = HF.$, won = HF.won;
  var orders = [];
  var adminKey = '';


  /* 고를 수 있는 처리 상태는 config.js 의 statuses 에서 옵니다.
     '취소' 는 목록에 넣지 않고 별도 취소 버튼이 담당합니다. */
  var STATUSES = (typeof CONFIG !== 'undefined' && CONFIG.statuses && CONFIG.statuses.length)
    ? CONFIG.statuses.slice() : ['대기', '완료'];

  var TONE = {
    '대기':     'pill--wait',
    '입금확인': 'pill--mid',
    '현장결제': 'pill--mid',
    '완료':     'pill--done',
    '취소':     'pill--void',
  };

  var isVoid = function (o) { return (o.status || '') === '취소'; };

  /* 상태가 비어 있으면 수령 방법에 맞는 기본값으로 봅니다. */
  function defaultStatusOf(o) {
    var d = (CONFIG.defaultStatus || {})[o.method || 'pickup'];
    return (d && STATUSES.indexOf(d) !== -1) ? d : STATUSES[0];
  }

  function statusOf(o) {
    var s = o.status || defaultStatusOf(o);
    if (s === '취소') return '취소';
    return STATUSES.indexOf(s) === -1 ? defaultStatusOf(o) : s;
  }


  function fmtDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return String(iso);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------- 서버 통신 ---------- */

  function demoOrders() {
    try {
      return JSON.parse(localStorage.getItem('chuseok-demo-orders') || '[]')
        .map(function (o) { return Object.assign({ status: '대기', method: 'pickup' }, o); });
    } catch (e) { return []; }
  }

  function fetchOrders() {
    if (!CONFIG.sheetUrl) return Promise.resolve(demoOrders());

    return fetch(CONFIG.sheetUrl + '?action=list&key=' + encodeURIComponent(adminKey))
      .then(function (r) {
        if (!r.ok) throw new Error('서버 응답 오류 ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error((data && data.error) || '목록을 불러오지 못했습니다.');
        return data.orders || [];
      });
  }

  var saveReceipt = function (code, issued) { return save(code, { receiptIssued: issued }); };
  var saveStatus  = function (code, status) { return save(code, { status: status }); };

  function save(code, patch) {
    if (!CONFIG.sheetUrl) {
      try {
        var key = 'chuseok-demo-orders';
        var all = JSON.parse(localStorage.getItem(key) || '[]');
        all.forEach(function (o) { if (o.code === code) Object.assign(o, patch); });
        localStorage.setItem(key, JSON.stringify(all));
      } catch (e) { /* 무시 */ }
      return Promise.resolve();
    }

    var body = Object.assign({ action: 'update', key: adminKey, code: code }, patch);
    return fetch(CONFIG.sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error((data && data.error) || '변경에 실패했습니다.');
      });
  }

  /* ---------- 거르기 ---------- */

  function visibleOrders() {
    var q      = $('search').value.trim().toLowerCase();
    var method = $('filterMethod').value;
    var date   = $('filterDate').value;
    var status = $('filterStatus').value;

    return orders.filter(function (o) {
      if (method && (o.method || 'pickup') !== method) return false;
      if (date && o.pickupDate !== date) return false;
      if (status && statusOf(o) !== status) return false;
      if (q) {
        var hay = [o.code, o.name, o.phone, o.receiverName, o.receiverPhone,
                   o.address, o.itemsText, o.cashReceipt].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  /* ---------- 화면 그리기 ---------- */

  function renderStats() {
    var all  = visibleOrders();
    var list = all.filter(function (o) { return !isVoid(o); });   // 취소는 집계에서 뺍니다
    var voided = all.length - list.length;
    var pickup = list.filter(function (o) { return (o.method || 'pickup') === 'pickup'; }).length;
    var sets = list.reduce(function (s, o) { return s + Number(o.totalCount || 0); }, 0);
    var sum  = list.reduce(function (s, o) { return s + Number(o.totalPrice || 0); }, 0);
    var todo = list.filter(function (o) { return statusOf(o) !== '완료'; }).length;

    var cards = [
      ['유효 예약', list.length + '건' + (voided ? ' (취소 ' + voided + ')' : '')],
      ['픽업 / 택배', pickup + ' / ' + (list.length - pickup)],
      ['처리 대기', todo + '건'],
      ['세트 수량', sets + '개'],
      ['예상 매출', won(sum)],
    ];

    $('stats').innerHTML = cards.map(function (c) {
      return '<div class="stat"><div class="stat__label">' + c[0] +
             '</div><div class="stat__value">' + c[1] + '</div></div>';
    }).join('');
  }

  /* 칸 하나 만들기. sub 는 작은 글씨로 아랫줄에 붙습니다(여러 줄 가능). */
  function cell(main, sub, cls) {
    var td = document.createElement('td');
    if (cls) td.className = cls;
    td.appendChild(document.createTextNode(main || ''));
    [].concat(sub || []).filter(Boolean).forEach(function (text) {
      var s = document.createElement('span');
      s.className = 'cell-sub';
      s.textContent = text;
      td.appendChild(s);
    });
    return td;
  }

  function renderRows() {
    var list = visibleOrders().slice().sort(function (a, b) {
      return String(a.pickupDate).localeCompare(String(b.pickupDate)) ||
             String(a.pickupTime).localeCompare(String(b.pickupTime));
    });

    var tbody = $('rows');
    tbody.innerHTML = '';
    $('emptyMsg').hidden = list.length > 0;

    list.forEach(function (o) {
      var isDelivery = (o.method || 'pickup') === 'delivery';
      var tr = document.createElement('tr');
      if (isVoid(o)) tr.className = 'is-void';
      else if (statusOf(o) === '완료') tr.className = 'is-done';

      tr.appendChild(cell(o.code || '', '', 'nowrap'));
      tr.appendChild(cell(fmtDateTime(o.createdAt), '', 'nowrap num'));

      var td = document.createElement('td');
      td.className = 'nowrap';
      var tag = document.createElement('span');
      tag.className = 'tag ' + (isDelivery ? 'tag--delivery' : 'tag--pickup');
      tag.textContent = isDelivery ? '택배' : '픽업';
      td.appendChild(tag);
      tr.appendChild(td);

      tr.appendChild(cell(o.name || '', [o.phone || ''], 'nowrap'));

      tr.appendChild(isDelivery
        ? cell(o.receiverName || '', [o.receiverPhone || '', o.address || ''])
        : cell('—', '', 'nowrap'));

      tr.appendChild(cell(o.pickupDateLabel || o.pickupDate || '',
                          isDelivery ? '' : (o.pickupTime || ''), 'nowrap'));

      tr.appendChild(cell(o.itemsText || '', '수량 ' + (o.totalCount || 0) + '개'));

      var feeText = '';
      if (isDelivery) {
        feeText = o.shippingFee === null || o.shippingFee === undefined
          ? '배송비 미정' : '배송비 ' + won(o.shippingFee);
      }
      tr.appendChild(cell(won(o.totalPrice), feeText, 'num'));

      /* 현금영수증 : 손님이 신청한 내용 + 매장이 발행했는지 */
      var crTd = document.createElement('td');
      if (o.cashReceipt) {
        var info = document.createElement('div');
        info.textContent = o.cashReceipt;
        crTd.appendChild(info);

        var rb = document.createElement('button');
        rb.type = 'button';
        rb.className = 'receipt-btn' + (o.receiptIssued ? ' is-issued' : '');
        rb.textContent = o.receiptIssued ? '발행 완료' : '미발행';
        rb.title = '눌러서 발행 여부를 바꿉니다';
        rb.addEventListener('click', function () {
          var next = !o.receiptIssued;
          rb.disabled = true;
          saveReceipt(o.code, next).then(function () {
            o.receiptIssued = next;
            renderRows();
          }).catch(function (err) {
            rb.disabled = false;
            alert('변경 실패: ' + err.message);
          });
        });
        crTd.appendChild(rb);
      } else {
        crTd.textContent = '—';
        crTd.className = 'nowrap';
      }
      tr.appendChild(crTd);

      tr.appendChild(cell(o.memo || ''));

      var stTd = document.createElement('td');
      stTd.className = 'nowrap';

      var sel = document.createElement('select');
      sel.className = 'status-sel ' + TONE[statusOf(o)];
      sel.disabled = isVoid(o);
      sel.title = isVoid(o) ? '취소된 예약입니다' : '처리 상태를 고르세요';

      (isVoid(o) ? ['취소'] : STATUSES).forEach(function (st) {
        var op = document.createElement('option');
        op.value = st;
        op.textContent = st;
        if (st === statusOf(o)) op.selected = true;
        sel.appendChild(op);
      });

      sel.addEventListener('change', function () {
        var next = sel.value, prev = statusOf(o);
        sel.disabled = true;
        saveStatus(o.code, next).then(function () {
          o.status = next;
          renderStats();
          renderRows();
        }).catch(function (err) {
          sel.value = prev;
          sel.disabled = false;
          alert('상태 변경 실패: ' + err.message);
        });
      });
      stTd.appendChild(sel);

      /* 취소 / 취소 되돌리기. 진행 상태와 섞이지 않게 별도 버튼으로 둡니다. */
      var vd = document.createElement('button');
      vd.type = 'button';
      vd.className = 'void-btn';
      vd.textContent = isVoid(o) ? '되돌리기' : '취소';
      vd.title = isVoid(o) ? '취소를 취소하고 대기 상태로' : '이 예약을 취소 처리';
      vd.addEventListener('click', function () {
        var next = isVoid(o) ? '대기' : '취소';
        if (next === '취소' && !confirm(o.code + ' 예약을 취소 처리할까요?\n기록은 남고 집계에서만 빠집니다.')) return;
        vd.disabled = true;
        saveStatus(o.code, next).then(function () {
          o.status = next;
          renderStats();
          renderRows();
        }).catch(function (err) {
          vd.disabled = false;
          alert('변경 실패: ' + err.message);
        });
      });
      stTd.appendChild(vd);

      tr.appendChild(stTd);

      tbody.appendChild(tr);
    });
  }

  /* 상태 거르기 목록도 설정에서 만듭니다 */
  function renderStatusFilter() {
    var sel = $('filterStatus');
    var current = sel.value;
    var opts = ['<option value="">상태 전체</option>'];
    STATUSES.concat(['취소']).forEach(function (st) {
      var d = document.createElement('div');
      d.textContent = st;
      opts.push('<option value="' + d.innerHTML + '">' + d.innerHTML + '</option>');
    });
    sel.innerHTML = opts.join('');
    sel.value = current;
  }

  function renderDateFilter() {
    var sel = $('filterDate');
    var current = sel.value;
    var seen = {};
    var opts = ['<option value="">날짜 전체</option>'];

    var add = function (date, label) {
      if (!date || seen[date]) return;
      seen[date] = true;
      var d = document.createElement('div');
      d.textContent = label || date;
      opts.push('<option value="' + date + '">' + d.innerHTML + '</option>');
    };

    ((CONFIG.pickup && CONFIG.pickup.dates) || []).forEach(function (d) { add(d.date, d.label); });
    ((CONFIG.delivery && CONFIG.delivery.dates) || []).forEach(function (d) { add(d.date, d.label); });
    orders.forEach(function (o) { add(o.pickupDate, o.pickupDateLabel); });

    sel.innerHTML = opts.join('');
    sel.value = current;
  }

  function render() {
    renderStatusFilter();
    renderDateFilter();
    renderStats();
    renderRows();
    $('lastSync').textContent = '마지막 확인: ' + new Date().toLocaleString('ko-KR') +
      (CONFIG.sheetUrl ? '' : ' · 연습 모드 (이 기기에 저장된 예약만 표시)');
  }

  /* ---------- 엑셀(CSV) 저장 ---------- */

  function toCsv() {
    var head = ['예약번호', '접수일시', '수령방법', '주문자', '주문자연락처',
                '받는분', '받는분연락처', '배송지주소', '수령일', '수령시간',
                '주문내역', '수량', '상품금액', '배송비', '합계',
                '현금영수증', '현금영수증발행', '요청사항', '상태'];
    var esc = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };

    var lines = [head.map(esc).join(',')];
    visibleOrders().forEach(function (o) {
      lines.push([
        o.code, o.createdAt, o.methodLabel || ((o.method === 'delivery') ? '택배' : '픽업'),
        o.name, o.phone, o.receiverName, o.receiverPhone, o.address,
        o.pickupDateLabel || o.pickupDate, o.pickupTime,
        o.itemsText, o.totalCount, o.itemsPrice,
        (o.shippingFee === null || o.shippingFee === undefined) ? '미정' : o.shippingFee,
        o.totalPrice, o.cashReceipt, o.receiptIssued ? '발행' : '',
        o.memo, statusOf(o),
      ].map(esc).join(','));
    });

    // 엑셀이 한글을 깨뜨리지 않도록 BOM 을 앞에 붙입니다.
    return '﻿' + lines.join('\r\n');
  }

  function downloadCsv() {
    var blob = new Blob([toCsv()], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '호핀치_추석예약_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- 시작 ---------- */

  function load() {
    $('reloadBtn').disabled = true;
    return fetchOrders().then(function (list) {
      orders = list;
      render();
    }).catch(function (err) {
      alert('목록을 불러오지 못했습니다.\n' + err.message);
    }).then(function () {
      $('reloadBtn').disabled = false;
    });
  }

  function unlock() {
    adminKey = $('key').value.trim();
    if (CONFIG.sheetUrl && !adminKey) {
      $('keyErr').textContent = '비밀번호를 입력해 주세요.';
      $('keyErr').hidden = false;
      return;
    }
    $('keyErr').hidden = true;

    fetchOrders().then(function (list) {
      orders = list;
      try { sessionStorage.setItem('chuseok-admin-key', adminKey); } catch (e) {}
      $('lockView').hidden = true;
      $('dataView').hidden = false;
      render();
    }).catch(function (err) {
      $('keyErr').textContent = err.message;
      $('keyErr').hidden = false;
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('unlockBtn').addEventListener('click', unlock);
    $('key').addEventListener('keydown', function (e) { if (e.key === 'Enter') unlock(); });

    ['search', 'filterMethod', 'filterDate', 'filterStatus'].forEach(function (id) {
      $(id).addEventListener('input', function () { renderStats(); renderRows(); });
      $(id).addEventListener('change', function () { renderStats(); renderRows(); });
    });
    $('reloadBtn').addEventListener('click', load);
    $('csvBtn').addEventListener('click', downloadCsv);

    var saved = '';
    try { saved = sessionStorage.getItem('chuseok-admin-key') || ''; } catch (e) {}
    if (saved || !CONFIG.sheetUrl) {
      $('key').value = saved;
      unlock();
    }
  });
})();
