/**
 * 추석 선물세트 예약 ― 구글 시트 저장소
 *
 * 이 파일은 구글 스프레드시트의 [확장 프로그램] > [Apps Script] 에 붙여넣는 코드입니다.
 * 설치 방법은 저장소의 README.md 를 참고하세요.
 */

/* ===== 매장 비밀번호 =====================================================
   직원용 예약 목록 화면(admin.html)에서 입력할 비밀번호입니다.
   아래 따옴표 안의 글자를 원하는 비밀번호로 꼭 바꿔주세요.        */
var ADMIN_KEY = '바꿔주세요1234';

/* 시트 이름과 열 제목 */
var SHEET_NAME = '예약목록';
var HEADERS = ['예약번호', '접수일시', '예약자', '연락처', '수령일', '수령일표시',
               '수령시간', '주문내역', '수량', '금액', '요청사항', '상태'];


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


/* ---------- 실제 동작 ---------- */

function createOrder(body) {
  var name  = trim(body.name);
  var phone = trim(body.phone);
  var items = Array.isArray(body.items) ? body.items : [];

  if (!name)  throw new Error('성함이 비어 있습니다.');
  if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(phone)) throw new Error('연락처 형식이 올바르지 않습니다.');
  if (!items.length) throw new Error('선택된 선물세트가 없습니다.');
  if (!trim(body.pickupDate)) throw new Error('수령 날짜가 비어 있습니다.');

  var count = 0, price = 0, parts = [];
  items.forEach(function (it) {
    var c = Math.max(0, Math.min(99, Number(it.count) || 0));
    var p = Math.max(0, Number(it.price) || 0);
    if (!c) return;
    count += c;
    price += c * p;
    parts.push(trim(it.name) + ' ' + c + '개');
  });
  if (!count) throw new Error('선택된 수량이 없습니다.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet();
    var code  = nextCode(sheet);
    sheet.appendRow([
      code,
      new Date(),
      name,
      phone,
      trim(body.pickupDate),
      trim(body.pickupDateLabel),
      trim(body.pickupTime),
      parts.join(', '),
      count,
      price,
      trim(body.memo).slice(0, 300),
      '대기',
    ]);
    return { ok: true, code: code };
  } finally {
    lock.releaseLock();
  }
}

function updateStatus(body) {
  requireKey(body.key);

  var code   = trim(body.code);
  var status = body.status === '완료' ? '완료' : '대기';
  if (!code) throw new Error('예약번호가 없습니다.');

  var sheet = getSheet();
  var codes = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 1).getValues();
  for (var i = 0; i < codes.length; i++) {
    if (String(codes[i][0]) === code) {
      sheet.getRange(i + 2, HEADERS.indexOf('상태') + 1).setValue(status);
      return { ok: true };
    }
  }
  throw new Error('해당 예약번호를 찾을 수 없습니다: ' + code);
}

function readOrders() {
  var sheet = getSheet();
  if (sheet.getLastRow() < 2) return [];

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  return rows.filter(function (r) { return r[0]; }).map(function (r) {
    return {
      code:            String(r[0]),
      createdAt:       r[1] instanceof Date ? r[1].toISOString() : String(r[1]),
      name:            String(r[2]),
      phone:           String(r[3]),
      pickupDate:      r[4] instanceof Date ? Utilities.formatDate(r[4], tz(), 'yyyy-MM-dd') : String(r[4]),
      pickupDateLabel: String(r[5]),
      pickupTime:      String(r[6]),
      itemsText:       String(r[7]),
      totalCount:      Number(r[8]) || 0,
      totalPrice:      Number(r[9]) || 0,
      memo:            String(r[10]),
      status:          String(r[11] || '대기'),
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

function trim(v) { return String(v == null ? '' : v).trim(); }

function tz() { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'Asia/Seoul'; }

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
