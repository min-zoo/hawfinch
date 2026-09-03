/**
 * 호핀치 추석 선물세트 예약 ― 구글 시트 저장소
 *
 * 이 파일은 구글 스프레드시트의 [확장 프로그램] > [Apps Script] 에 붙여넣는 코드입니다.
 * 설치 방법은 저장소의 README.md 를 참고하세요.
 */

/* ===== 매장 비밀번호 =====================================================
   직원용 예약 목록 화면(admin.html)에서 입력할 비밀번호입니다.
   아래 따옴표 안의 글자를 원하는 비밀번호로 꼭 바꿔주세요.        */
var ADMIN_KEY = '바꿔주세요1234';

/* 직원이 고를 수 있는 처리 상태.
   assets/config.js 의 statuses 와 같은 값으로 맞춰주세요.
   '취소' 는 취소 버튼이 쓰므로 항상 허용됩니다. */
var ALLOWED_STATUS = ['대기', '입금확인', '현장결제', '완료', '취소'];

var SHEET_NAME = '예약목록';
var HEADERS = [
  '예약번호', '접수일시', '수령방법',
  '주문자', '주문자연락처',
  '받는분', '받는분연락처', '배송지주소',
  '수령일', '수령일표시', '수령시간',
  '주문내역', '수량', '상품금액', '배송비', '합계',
  '현금영수증', '현금영수증발행', '요청사항', '상태',
];


/** 손님이 예약을 보내거나, 직원이 상태를 바꿀 때 호출됩니다. */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'update') return json(updateStatus(body));
    return json(createOrder(body));
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

/**
 * 직원용 목록(key 필요) 과 손님용 조회(예약번호 + 연락처) 를 처리합니다.
 */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};

    if (p.action === 'lookup') return json({ ok: true, order: lookupOrder(p.code, p.phone) });

    requireKey(p.key);
    return json({ ok: true, orders: readOrders() });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}


/**
 * 손님이 자기 예약을 확인합니다.
 * 예약번호와 연락처가 둘 다 맞아야 합니다. 하나만으로는 조회되지 않습니다.
 * (연락처는 주문자 것이든 받는 분 것이든 맞으면 됩니다)
 */
function lookupOrder(code, phone) {
  var c = trim(code).toUpperCase();
  var d = onlyDigits(phone);
  if (!c || !d) throw new Error('예약번호와 연락처를 모두 입력해 주세요.');

  var hit = null;
  readOrders().forEach(function (o) {
    if (o.code.toUpperCase() !== c) return;
    if (onlyDigits(o.phone) === d || onlyDigits(o.receiverPhone) === d) hit = o;
  });

  if (!hit) throw new Error('예약을 찾을 수 없습니다. 예약번호와 연락처를 다시 확인해 주세요.');
  return hit;
}


/* ---------- 예약 접수 ---------- */

function createOrder(body) {
  var method = body.method === 'delivery' ? 'delivery' : 'pickup';
  var name   = trim(body.name);
  var phone  = trim(body.phone);
  var items  = Array.isArray(body.items) ? body.items : [];

  if (!name)  throw new Error('성함이 비어 있습니다.');
  if (!isPhone(phone)) throw new Error('연락처 형식이 올바르지 않습니다.');
  if (!items.length) throw new Error('선택된 선물세트가 없습니다.');

  /* 금액은 화면 값을 그대로 믿지 않고 여기서 다시 계산합니다. */
  var count = 0, itemsPrice = 0, parts = [];
  items.forEach(function (it) {
    var c = Math.max(0, Math.min(99, Number(it.count) || 0));
    var p = Math.max(0, Number(it.price) || 0);
    if (!c) return;
    count += c;
    itemsPrice += c * p;
    parts.push(trim(it.name) + ' ' + c + '개');
  });
  if (!count) throw new Error('선택된 수량이 없습니다.');

  var receiverName = '', receiverPhone = '', address = '', pickupTime = '';
  var day = trim(body.pickupDate);

  if (method === 'pickup') {
    if (!day) throw new Error('수령 날짜가 비어 있습니다.');
    pickupTime = trim(body.pickupTime);
    if (!pickupTime) throw new Error('수령 시간이 비어 있습니다.');
  } else {
    receiverName = trim(body.receiverName);
    receiverPhone = trim(body.receiverPhone);
    address = trim(body.address);
    if (!receiverName) throw new Error('받는 분 성함이 비어 있습니다.');
    if (!isPhone(receiverPhone)) throw new Error('받는 분 연락처 형식이 올바르지 않습니다.');
    if (!address) throw new Error('배송지 주소가 비어 있습니다.');
    /* 발송일은 손님이 고르지 않고 매장이 순차로 정하므로 비어 있어도 됩니다. */
  }

  /* 배송비: 값이 없으면(미정) 빈 칸으로 남기고 합계에 넣지 않습니다. */
  var feeRaw = body.shippingFee;
  var feeKnown = (method === 'delivery') && feeRaw !== null && feeRaw !== undefined && feeRaw !== '';
  var fee = feeKnown ? Math.max(0, Number(feeRaw) || 0) : '';
  var total = itemsPrice + (feeKnown ? fee : 0);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet();
    var code = nextCode(sheet);
    sheet.appendRow([
      code,
      new Date(),
      method === 'pickup' ? '픽업' : '택배',
      name,
      phone,
      receiverName,
      receiverPhone,
      address,
      day,
      trim(body.pickupDateLabel),
      pickupTime,
      parts.join(', '),
      count,
      itemsPrice,
      fee,
      total,
      trim(body.cashReceipt),
      '',                                  // 발행 여부는 직원이 나중에 체크합니다
      trim(body.memo).slice(0, 300),
      initialStatus(body.status),
    ]);
    return { ok: true, code: code };
  } finally {
    lock.releaseLock();
  }
}


/* ---------- 상태 변경 ---------- */

/**
 * 직원이 처리 상태나 현금영수증 발행 여부를 바꿉니다.
 * status 와 receiptIssued 중 보내온 것만 반영합니다.
 */
function updateStatus(body) {
  requireKey(body.key);

  var code = trim(body.code);
  if (!code) throw new Error('예약번호가 없습니다.');

  var hasStatus  = body.status !== undefined && body.status !== null;
  var hasReceipt = body.receiptIssued !== undefined && body.receiptIssued !== null;
  if (!hasStatus && !hasReceipt) throw new Error('바꿀 내용이 없습니다.');

  var status = trim(body.status);
  if (hasStatus && ALLOWED_STATUS.indexOf(status) === -1) {
    throw new Error('알 수 없는 상태입니다: ' + status);
  }

  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('예약이 없습니다.');

  var codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < codes.length; i++) {
    if (String(codes[i][0]) !== code) continue;
    var row = i + 2;
    if (hasStatus) {
      sheet.getRange(row, HEADERS.indexOf('상태') + 1).setValue(status);
    }
    if (hasReceipt) {
      sheet.getRange(row, HEADERS.indexOf('현금영수증발행') + 1)
           .setValue(body.receiptIssued ? '발행' : '');
    }
    return { ok: true };
  }
  throw new Error('해당 예약번호를 찾을 수 없습니다: ' + code);
}


/* ---------- 목록 읽기 ---------- */

function readOrders() {
  var sheet = getSheet();
  if (sheet.getLastRow() < 2) return [];

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  return rows.filter(function (r) { return r[0]; }).map(function (r) {
    return {
      code:            String(r[0]),
      createdAt:       r[1] instanceof Date ? r[1].toISOString() : String(r[1]),
      method:          String(r[2]) === '택배' ? 'delivery' : 'pickup',
      methodLabel:     String(r[2]),
      name:            String(r[3]),
      phone:           String(r[4]),
      receiverName:    String(r[5]),
      receiverPhone:   String(r[6]),
      address:         String(r[7]),
      pickupDate:      r[8] instanceof Date ? Utilities.formatDate(r[8], tz(), 'yyyy-MM-dd') : String(r[8]),
      pickupDateLabel: String(r[9]),
      pickupTime:      String(r[10]),
      itemsText:       String(r[11]),
      totalCount:      Number(r[12]) || 0,
      itemsPrice:      Number(r[13]) || 0,
      shippingFee:     r[14] === '' ? null : (Number(r[14]) || 0),
      totalPrice:      Number(r[15]) || 0,
      cashReceipt:     String(r[16]),
      receiptIssued:   String(r[17]) === '발행',
      memo:            String(r[18]),
      status:          String(r[19] || '대기'),
    };
  });
}


/* ---------- 도우미 ---------- */

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }
  syncHeaders(sheet);
  return sheet;
}

/**
 * 이미 쓰고 있는 시트의 열을 지금 HEADERS 에 맞춥니다.
 *
 * 나중에 열이 하나 추가되면, 새로 들어오는 예약은 그 열까지 채워 넣는데
 * 기존 시트에는 그 열이 없어 기록이 한 칸씩 밀립니다. 그래서 빠진 열을
 * 제자리에 끼워 넣어 기존 예약의 값이 제 칸에 남도록 합니다.
 */
function syncHeaders(sheet) {
  var width = Math.max(sheet.getLastColumn(), 1);
  var cur = sheet.getRange(1, 1, 1, width).getValues()[0]
                 .map(function (v) { return String(v).trim(); });

  // 이미 같으면 아무것도 하지 않습니다
  var same = cur.length >= HEADERS.length &&
             HEADERS.every(function (h, i) { return cur[i] === h; });
  if (same) return;

  // 빠진 열을 제자리에 끼워 넣습니다
  for (var i = 0; i < HEADERS.length; i++) {
    if (cur[i] === HEADERS[i]) continue;
    if (cur.indexOf(HEADERS[i]) !== -1) continue;   // 순서만 다른 경우는 건드리지 않음
    sheet.insertColumnBefore(i + 1);
    cur.splice(i, 0, HEADERS[i]);
  }

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

/**
 * CS-0001, CS-0002 … 순서대로 예약번호를 만듭니다.
 * 이미 쓰인 번호 중 가장 큰 값 다음을 씁니다. 시트에서 줄을 지워도
 * 번호가 겹치지 않습니다. (줄 개수로 세면 지운 뒤 중복됩니다)
 */
function nextCode(sheet) {
  var last = sheet.getLastRow();
  var max = 0;
  if (last >= 2) {
    sheet.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) {
      var m = /^CS-(\d+)$/.exec(String(r[0]).trim());
      if (m) max = Math.max(max, Number(m[1]));
    });
  }
  return 'CS-' + ('0000' + (max + 1)).slice(-4);
}

/**
 * 새 예약의 처음 상태. 화면(config.js 의 defaultStatus)이 보내온 값을 쓰되,
 * 허용된 값이 아니면 목록의 첫 값으로 둡니다. '취소' 로는 시작할 수 없습니다.
 * 이렇게 해두면 기본 상태를 바꿀 때 이 코드를 다시 배포하지 않아도 됩니다.
 */
function initialStatus(v) {
  var s = trim(v);
  if (s && s !== '취소' && ALLOWED_STATUS.indexOf(s) !== -1) return s;
  return ALLOWED_STATUS[0];
}

function requireKey(key) {
  if (String(key || '') !== ADMIN_KEY) throw new Error('비밀번호가 올바르지 않습니다.');
}

function isPhone(v) { return /^01[016789]-?\d{3,4}-?\d{4}$/.test(v); }

function trim(v) { return String(v == null ? '' : v).trim(); }

function onlyDigits(v) { return String(v == null ? '' : v).replace(/[^0-9]/g, ''); }

function tz() { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'Asia/Seoul'; }

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
