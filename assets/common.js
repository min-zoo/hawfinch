/* 세 화면(예약·예약확인·직원)이 함께 쓰는 도우미들.
   전에는 파일마다 같은 함수를 따로 두어, 한쪽만 고치면 화면마다 다르게
   보일 위험이 있었습니다. 여기 한 곳에서만 관리합니다. */
var HF = (function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function won(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; }

  /* 숫자만 쳐도 010-1234-5678 로 정리해 줍니다. */
  function formatPhone(v) {
    var d = String(v || '').replace(/[^0-9]/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }

  function validPhone(v) { return /^01[016789]-\d{3,4}-\d{4}$/.test(v); }

  /* 매장 연락처 한 줄. 전화가 없으면 인스타그램으로 대체되고,
     둘 다 없으면 빈 값이 되어 문구에서 생략됩니다.
     뒤에 조사가 붙지 않는 형태라 아이디가 무엇이든 어색하지 않습니다. */
  function contactLine() {
    var s = (typeof CONFIG !== 'undefined' && CONFIG.shop) || {};
    if (s.phone) return s.phone;
    if (s.instagram) return '인스타그램 DM @' + s.instagram;
    return '';
  }

  /* 화면에 글자를 넣을 때 태그로 해석되지 않도록 */
  function escapeHtml(t) {
    var d = document.createElement('div');
    d.textContent = t == null ? '' : t;
    return d.innerHTML;
  }

  /* 미리 입금을 받는 방법인지 (config.js 의 pickup.prepay / delivery.prepay) */
  function prepay(method) {
    var c = (typeof CONFIG !== 'undefined' && CONFIG[method]) || null;
    return !!(c && c.prepay);
  }

  /* 입금 계좌. 픽업·택배가 같은 계좌를 쓰므로 한 곳에서 읽습니다.
     예전 설정처럼 delivery 안에 들어 있어도 그대로 동작합니다. */
  function bank() {
    if (typeof CONFIG === 'undefined') return {};
    return CONFIG.bank || (CONFIG.delivery && CONFIG.delivery.bank) || {};
  }

  /* 2026-09-21 → '9월 21일' */
  function korDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? Number(m[2]) + '월 ' + Number(m[3]) + '일' : String(iso || '');
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  /* 손님이 직접 변경·취소할 수 있는 기준 (config.js 의 customerChange).
       픽업 : 수령일에서 pickupDaysBefore 만큼 앞선 날까지
       택배 : deliveryUntil 날짜까지 (그날 포함)
     { until: 'YYYY-MM-DD', days, open: 아직 되는지 } 를 돌려주고,
     기능이 꺼져 있거나 기준 날짜가 없으면 null 입니다. */
  function changeLimit(method, pickupDate) {
    var c = (typeof CONFIG !== 'undefined' && CONFIG.customerChange) || {};
    if (c.enabled === false) return null;
    var days = typeof c.pickupDaysBefore === 'number' ? c.pickupDaysBefore
             : (typeof c.daysBefore === 'number' ? c.daysBefore : 3);
    var iso = /^(\d{4})-(\d{2})-(\d{2})$/;
    var until;
    if (method === 'delivery') {
      if (!iso.test(String(c.deliveryUntil || ''))) return null;
      until = c.deliveryUntil;
    } else {
      var m = iso.exec(String(pickupDate || ''));
      if (!m) return null;
      var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      d.setDate(d.getDate() - days);
      until = d.getFullYear() + '-' +
              String(d.getMonth() + 1).padStart(2, '0') + '-' +
              String(d.getDate()).padStart(2, '0');
    }
    return { until: until, days: days, open: todayIso() <= until };
  }

  /* 변경·취소 규칙을 손님에게 설명하는 한 줄 */
  function changeRuleText(method) {
    var c = (typeof CONFIG !== 'undefined' && CONFIG.customerChange) || {};
    var days = typeof c.pickupDaysBefore === 'number' ? c.pickupDaysBefore : 3;
    var pick = '수령일 ' + days + '일 전까지';
    var deli = c.deliveryUntil ? korDate(c.deliveryUntil) + '까지' : '';
    if (method === 'pickup') return pick;
    if (method === 'delivery') return deli;
    return '픽업은 ' + pick + ', 택배는 ' + deli;
  }

  /* 다음 우편번호 검색창을 엽니다. 스크립트를 못 불러왔으면 false. */
  function openPostcode(onDone) {
    if (!window.daum || !window.daum.Postcode) return false;
    new window.daum.Postcode({
      oncomplete: function (data) {
        onDone(data.zonecode || '', data.roadAddress || data.jibunAddress || '');
      },
    }).open();
    return true;
  }

  var hasPostcode = function () { return !!(window.daum && window.daum.Postcode); };

  return {
    $: $, won: won, formatPhone: formatPhone,
    validPhone: validPhone, contactLine: contactLine, escapeHtml: escapeHtml,
    prepay: prepay, bank: bank,
    korDate: korDate, todayIso: todayIso, changeLimit: changeLimit, changeRuleText: changeRuleText,
    openPostcode: openPostcode, hasPostcode: hasPostcode,
  };
})();
