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

var SHEET_NAME = '예약목록';
var HEADERS = [
  '예약번호', '접수일시', '수령방법',
  '주문자', '주문자연락처',
  '받는분', '받는분연락처', '배송지주소',
  '수령일', '수령일표시', '수령시간',
  '주문내역', '수량', '상품금액', '배송비', '합계',
  '현금영수증', '요청사항', '상태',
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

/** 직원용 화면이 예약 목록을 불러올 때 호출됩니다. */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    requireKey(p.key);
    return json({ ok: true, orders: readOrders() });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
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
      trim(body.memo).slice(0, 300),
      '대기',
    ]);
    return { ok: true, code: code };
  } finally {
    lock.releaseLock();
  }
}


/* ---------- 상태 변경 ---------- */

function updateStatus(body) {
  requireKey(body.key);

  var code = trim(body.code);
  var status = trim(body.status);
  if (!code) throw new Error('예약번호가 없습니다.');
  if (['대기', '확인', '완료'].indexOf(status) === -1) throw new Error('알 수 없는 상태입니다.');

  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('예약이 없습니다.');

  var codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < codes.length; i++) {
    if (String(codes[i][0]) === code) {
      sheet.getRange(i + 2, HEADERS.indexOf('상태') + 1).setValue(status);
      return { ok: true };
    }
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
      memo:            String(r[17]),
      status:          String(r[18] || '대기'),
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
  }
  return sheet;
}

/** CS-0001, CS-0002 … 순서대로 예약번호를 만듭니다. */
function nextCode(sheet) {
  var n = Math.max(0, sheet.getLastRow() - 1) + 1;
  return 'CS-' + ('0000' + n).slice(-4);
}

function requireKey(key) {
  if (String(key || '') !== ADMIN_KEY) throw new Error('비밀번호가 올바르지 않습니다.');
}

function isPhone(v) { return /^01[016789]-?\d{3,4}-?\d{4}$/.test(v); }

function trim(v) { return String(v == null ? '' : v).trim(); }

function tz() { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'Asia/Seoul'; }

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
