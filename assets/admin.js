/* 매장 직원용 예약 목록 화면 ― 이 파일은 수정하지 않아도 됩니다. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var orders = [];
  var adminKey = '';

  var won = function (n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; };

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
        .map(function (o) { return Object.assign({ status: '대기' }, o); });
    } catch (e) { return []; }
  }

  function fetchOrders() {
    if (!CONFIG.sheetUrl) return Promise.resolve(demoOrders());

    var url = CONFIG.sheetUrl + '?action=list&key=' + encodeURIComponent(adminKey);
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('서버 응답 오류 ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error((data && data.error) || '목록을 불러오지 못했습니다.');
        return data.orders || [];
      });
  }

  function updateStatus(code, status) {
    if (!CONFIG.sheetUrl) {
      try {
        var key = 'chuseok-demo-orders';
        var all = JSON.parse(localStorage.getItem(key) || '[]');
        all.forEach(function (o) { if (o.code === code) o.status = status; });
        localStorage.setItem(key, JSON.stringify(all));
      } catch (e) { /* 무시 */ }
      return Promise.resolve();
    }

    return fetch(CONFIG.sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'update', key: adminKey, code: code, status: status }),
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error((data && data.error) || '변경에 실패했습니다.');
      });
  }

  /* ---------- 화면 그리기 ---------- */

  function visibleOrders() {
    var q      = $('search').value.trim().toLowerCase();
    var date   = $('filterDate').value;
    var status = $('filterStatus').value;

    return orders.filter(function (o) {
      if (date && o.pickupDate !== date) return false;
      if (status && (o.status || '대기') !== status) return false;
      if (q) {
        var hay = [o.code, o.name, o.phone, o.itemsText].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function renderStats() {
    var list = visibleOrders();
    var waiting = list.filter(function (o) { return (o.status || '대기') !== '완료'; }).length;
    var sets = list.reduce(function (s, o) { return s + Number(o.totalCount || 0); }, 0);
    var sum  = list.reduce(function (s, o) { return s + Number(o.totalPrice || 0); }, 0);

    var cards = [
      ['예약 건수', list.length + '건'],
      ['준비 대기', waiting + '건'],
      ['세트 수량', sets + '개'],
      ['예상 매출', won(sum)],
    ];

    $('stats').innerHTML = cards.map(function (c) {
      return '<div class="stat"><div class="stat__label">' + c[0] +
             '</div><div class="stat__value">' + c[1] + '</div></div>';
    }).join('');
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
      var done = (o.status || '대기') === '완료';
      var tr = document.createElement('tr');
      if (done) tr.className = 'is-done';

      var cells = [
        o.code || '',
        fmtDateTime(o.createdAt),
        o.name || '',
        o.phone || '',
        (o.pickupDateLabel || o.pickupDate || '') + ' ' + (o.pickupTime || ''),
        o.itemsText || '',
        won(o.totalPrice),
        o.memo || '',
      ];

      cells.forEach(function (text, i) {
        var td = document.createElement('td');
        td.textContent = text;
        if (i === 1 || i === 3 || i === 6) td.className = 'num';
        tr.appendChild(td);
      });

      var td = document.createElement('td');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pill ' + (done ? 'pill--done' : 'pill--wait');
      btn.style.cursor = 'pointer';
      btn.style.border = 'none';
      btn.style.font = 'inherit';
      btn.textContent = done ? '준비 완료' : '준비 대기';
      btn.title = '눌러서 상태를 바꿉니다';
      btn.addEventListener('click', function () {
        var next = done ? '대기' : '완료';
        btn.disabled = true;
        updateStatus(o.code, next).then(function () {
          o.status = next;
          renderStats();
          renderRows();
        }).catch(function (err) {
          btn.disabled = false;
          alert('상태 변경 실패: ' + err.message);
        });
      });
      td.appendChild(btn);
      tr.appendChild(td);

      tbody.appendChild(tr);
    });
  }

  function renderDateFilter() {
    var sel = $('filterDate');
    var current = sel.value;
    var seen = {};
    var opts = ['<option value="">수령일 전체</option>'];

    (CONFIG.pickupDates || []).forEach(function (d) {
      seen[d.date] = true;
      opts.push('<option value="' + d.date + '">' + d.label + '</option>');
    });
    orders.forEach(function (o) {
      if (o.pickupDate && !seen[o.pickupDate]) {
        seen[o.pickupDate] = true;
        opts.push('<option value="' + o.pickupDate + '">' + o.pickupDate + '</option>');
      }
    });

    sel.innerHTML = opts.join('');
    sel.value = current;
  }

  function render() {
    renderDateFilter();
    renderStats();
    renderRows();
    $('lastSync').textContent = '마지막 확인: ' + new Date().toLocaleString('ko-KR') +
      (CONFIG.sheetUrl ? '' : ' · 연습 모드 (이 기기에 저장된 예약만 표시)');
  }

  /* ---------- 엑셀(CSV) 저장 ---------- */

  function toCsv() {
    var head = ['예약번호', '접수일시', '예약자', '연락처', '수령일', '수령시간',
                '주문내역', '수량', '금액', '요청사항', '상태'];
    var esc = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };

    var lines = [head.map(esc).join(',')];
    visibleOrders().forEach(function (o) {
      lines.push([
        o.code, o.createdAt, o.name, o.phone,
        o.pickupDateLabel || o.pickupDate, o.pickupTime,
        o.itemsText, o.totalCount, o.totalPrice, o.memo, o.status || '대기',
      ].map(esc).join(','));
    });

    // 엑셀이 한글을 깨뜨리지 않도록 BOM 을 앞에 붙입니다.
    return '﻿' + lines.join('\r\n');
  }

  function downloadCsv() {
    var blob = new Blob([toCsv()], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '추석선물세트_예약목록_' + new Date().toISOString().slice(0, 10) + '.csv';
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

    $('search').addEventListener('input', function () { renderStats(); renderRows(); });
    $('filterDate').addEventListener('change', function () { renderStats(); renderRows(); });
    $('filterStatus').addEventListener('change', function () { renderStats(); renderRows(); });
    $('reloadBtn').addEventListener('click', load);
    $('csvBtn').addEventListener('click', downloadCsv);

    // 같은 브라우저 탭에서는 비밀번호를 다시 입력하지 않도록
    var saved = '';
    try { saved = sessionStorage.getItem('chuseok-admin-key') || ''; } catch (e) {}
    if (saved || !CONFIG.sheetUrl) {
      $('key').value = saved;
      unlock();
    }
  });
})();
