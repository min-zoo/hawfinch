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

/* ===== 가짜 예약 막기 ===================================================
   실제 손님이 걸리지 않도록 넉넉하게 잡았습니다. 숫자를 고치려면 여기만
   바꾸고 다시 배포하세요.                                              */
var GUARD = {
  minSeconds:    3,    // 이보다 빨리 제출되면 사람이 아니라고 봅니다
  maxPerPhone:   5,    // 같은 번호로 아래 시간 안에 받을 수 있는 최대 건수
  windowMinutes: 10,
  dupMinutes:    2,    // 같은 번호로 같은 내용이 이 시간 안에 또 오면 중복
};

/* ===== 새 예약 알림 =====================================================
   둘 중 하나만 채워도 되고, 둘 다 채워도 됩니다. 비워두면 보내지 않습니다.

   NOTIFY_EMAIL   : 이메일 주소. 예: 'hawfinch@example.com'
   NOTIFY_WEBHOOK : 디스코드(Discord) 또는 슬랙(Slack) 채널의 웹훅 주소.
                    휴대폰 앱으로 바로 알림이 오고, 메일함에 쌓이지 않습니다.
                    디스코드: 채널 설정 → 연동 → 웹후크 → 새 웹후크 → URL 복사
                    슬랙    : 앱 → Incoming Webhooks → 채널 선택 → URL 복사      */
var NOTIFY_EMAIL   = '';
var NOTIFY_WEBHOOK = '';

var SHEET_NAME = '예약목록';
var HEADERS = [
  '예약번호', '접수일시', '수령방법',
  '주문자', '주문자연락처', '입금자명',
  '받는분', '받는분연락처', '배송지주소',
  '수령일', '수령일표시', '수령시간',
  '주문내역', '상품별수량', '수량', '상품금액', '배송비', '합계',
  '현금영수증', '현금영수증발행', '요청사항', '개인정보동의', '상태',
  '취소일시', '취소사유',
];

/* 열 위치는 항상 이름으로 찾습니다. 번호를 적어두면 열이 하나 늘어날 때마다
   전부 어긋나기 때문입니다. */
function col(name) {
  var i = HEADERS.indexOf(name);
  if (i === -1) throw new Error('알 수 없는 열: ' + name);
  return i;
}


/** 손님이 예약을 보내거나, 직원이 상태를 바꿀 때 호출됩니다. */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'update')   return json(updateStatus(body));
    if (body.action === 'customer') return json(customerEdit(body));
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

  /* 사람만 통과하는 두 가지 확인 */
  if (trim(body.trap)) {
    throw new Error('예약을 접수할 수 없습니다. 매장으로 문의해 주세요.');
  }
  var elapsed = Number(body.elapsed);
  if (isFinite(elapsed) && elapsed >= 0 && elapsed < GUARD.minSeconds * 1000) {
    throw new Error('잠시 후 다시 시도해 주세요.');
  }

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
    guardFlood(sheet, phone, parts.join(', '));
    guardStock(sheet, body.itemCounts, body.stockLimits);
    var code = nextCode(sheet, body.codeStart, body.codePrefix);
    var row = [];
    row[col('예약번호')]      = code;
    row[col('접수일시')]      = new Date();
    row[col('수령방법')]      = method === 'pickup' ? '픽업' : '택배';
    row[col('주문자')]        = name;
    row[col('주문자연락처')]  = phone;
    row[col('입금자명')]      = trim(body.depositor);
    row[col('받는분')]        = receiverName;
    row[col('받는분연락처')]  = receiverPhone;
    row[col('배송지주소')]    = address;
    row[col('수령일')]        = day;
    row[col('수령일표시')]    = trim(body.pickupDateLabel);
    row[col('수령시간')]      = pickupTime;
    row[col('주문내역')]      = parts.join(', ');
    row[col('상품별수량')]    = trim(body.itemCounts);
    row[col('수량')]          = count;
    row[col('상품금액')]      = itemsPrice;
    row[col('배송비')]        = fee;
    row[col('합계')]          = total;
    row[col('현금영수증')]    = trim(body.cashReceipt);
    row[col('현금영수증발행')] = '';       // 발행 여부는 직원이 나중에 체크합니다
    row[col('요청사항')]      = trim(body.memo).slice(0, 300);
    row[col('개인정보동의')]  = trim(body.agreed);
    row[col('상태')]          = initialStatus(body.status);

    for (var k = 0; k < HEADERS.length; k++) if (row[k] === undefined) row[k] = '';
    sheet.appendRow(row);

    notifyNewOrder(code, method, row, parts.join(', '), total);
    return { ok: true, code: code };
  } finally {
    lock.releaseLock();
  }
}


/**
 * 같은 번호로 짧은 시간에 몰아서 넣는 것을 막습니다.
 * 실제 손님이 여러 건을 나눠 넣는 경우까지 막지 않도록 여유를 뒀습니다.
 */
function guardFlood(sheet, phone, itemsText) {
  var last = sheet.getLastRow();
  if (last < 2) return;

  var iPhone = col('주문자연락처');
  var iWhen  = col('접수일시');
  var iItems = col('주문내역');

  /* 최근 줄만 봅니다. 시트가 길어져도 느려지지 않습니다. */
  var span = Math.min(last - 1, 200);
  var rows = sheet.getRange(last - span + 1, 1, span, HEADERS.length).getValues();

  var now = new Date().getTime();
  var d = onlyDigits(phone);
  var recent = 0;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (onlyDigits(r[iPhone]) !== d) continue;

    var when = r[iWhen] instanceof Date ? r[iWhen].getTime() : 0;
    if (!when) continue;
    var minutesAgo = (now - when) / 60000;

    if (minutesAgo <= GUARD.dupMinutes && String(r[iItems]).trim() === itemsText) {
      throw new Error('방금 같은 내용으로 접수되었습니다. 예약 확인 페이지에서 확인해 주세요.');
    }
    if (minutesAgo <= GUARD.windowMinutes) recent++;
  }

  if (recent >= GUARD.maxPerPhone) {
    throw new Error('짧은 시간에 너무 많이 신청하셨습니다. 잠시 후 다시 시도하시거나 매장으로 문의해 주세요.');
  }
}


/**
 * 만들 수 있는 수량을 넘겨 받지 않도록 막습니다.
 * 두 손님이 동시에 마지막 하나를 담는 경우도 여기서 걸러집니다.
 * (화면에서도 남은 수량을 보여주지만, 최종 판단은 여기서 합니다)
 */
function guardStock(sheet, itemCounts, stockLimits) {
  var limits = parsePairs(stockLimits);
  var want = parsePairs(itemCounts);
  if (!Object.keys(limits).length || !Object.keys(want).length) return;

  var sold = {};
  var last = sheet.getLastRow();
  if (last >= 2) {
    var rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
    var iCounts = col('상품별수량');
    var iStatus = col('상태');
    rows.forEach(function (r) {
      if (String(r[iStatus]).trim() === '취소') return;    // 취소된 건 빼고 셉니다
      var m = parsePairs(r[iCounts]);
      Object.keys(m).forEach(function (id) { sold[id] = (sold[id] || 0) + m[id]; });
    });
  }

  Object.keys(want).forEach(function (id) {
    if (!(id in limits)) return;
    var left = limits[id] - (sold[id] || 0);
    if (want[id] > left) {
      throw new Error(left > 0
        ? '남은 수량이 ' + left + '개뿐입니다. 수량을 줄여 다시 시도해 주세요.'
        : '방금 품절되었습니다. 다른 세트를 확인해 주세요.');
    }
  });
}

/** 'set-1:2|set-2:1' 을 { 'set-1': 2, 'set-2': 1 } 로 */
function parsePairs(text) {
  var out = {};
  String(text || '').split('|').forEach(function (pair) {
    var kv = pair.split(':');
    if (kv.length !== 2) return;
    var k = trim(kv[0]);
    var v = Math.floor(Number(kv[1]));
    if (k && isFinite(v) && v >= 0) out[k] = v;
  });
  return out;
}


/** 새 예약이 들어오면 알려줍니다. 실패해도 예약 접수는 그대로 진행됩니다. */
function notifyNewOrder(code, method, row, itemsText, total) {
  var g = function (name) { return String(row[col(name)] || ''); };
  var way = method === 'pickup' ? '픽업' : '택배';
  var lines = [
    '예약번호 : ' + code,
    '수령방법 : ' + (method === 'pickup' ? '매장 픽업' : '택배 발송'),
    '주문자   : ' + g('주문자') + ' · ' + g('주문자연락처'),
  ];
  if (method === 'pickup') {
    lines.push('수령일시 : ' + g('수령일표시') + ' ' + g('수령시간'));
  } else {
    lines.push('받는 분  : ' + g('받는분') + ' · ' + g('받는분연락처'));
    lines.push('배송지   : ' + g('배송지주소'));
  }
  lines.push('주문내역 : ' + itemsText);
  if (g('현금영수증')) lines.push('현금영수증 : ' + g('현금영수증'));
  lines.push('입금할 금액 : ' + Number(total).toLocaleString('ko-KR') + '원');
  notify('새 예약 ' + code + ' · ' + way + ' · ' + g('주문자'), lines);
}

/**
 * 매장에 알림을 보냅니다. 이메일과 웹훅 중 채워진 곳으로 보내고,
 * 어느 쪽이 실패해도 예약 처리는 그대로 진행됩니다.
 */
function notify(title, lines) {
  var text = lines.join('\n');

  if (NOTIFY_EMAIL) {
    try {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: '[호핀치] ' + title,
        body: text + '\n\n직원용 목록에서 확인하세요.',
      });
    } catch (e) { /* 알림 실패는 무시 */ }
  }

  if (NOTIFY_WEBHOOK) {
    try {
      var msg = '**[호핀치] ' + title + '**\n' + text;
      UrlFetchApp.fetch(NOTIFY_WEBHOOK, {
        method: 'post',
        contentType: 'application/json',
        /* content 는 디스코드, text 는 슬랙이 읽습니다. 서로 모르는 칸은 무시합니다. */
        payload: JSON.stringify({ content: msg, text: msg }),
        muteHttpExceptions: true,
      });
    } catch (e) { /* 알림 실패는 무시 */ }
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

  var reason = trim(body.cancelReason).slice(0, 200);

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
      sheet.getRange(row, col('상태') + 1).setValue(status);

      /* 취소로 바꾸면 언제·왜 취소했는지 남깁니다.
         취소를 되돌리면 두 칸을 비워 기록이 남지 않게 합니다. */
      if (status === '취소') {
        sheet.getRange(row, col('취소일시') + 1)
             .setValue(Utilities.formatDate(new Date(), tz(), 'yyyy-MM-dd HH:mm'));
        sheet.getRange(row, col('취소사유') + 1).setValue(reason);
      } else {
        sheet.getRange(row, col('취소일시') + 1).setValue('');
        sheet.getRange(row, col('취소사유') + 1).setValue('');
      }
    }
    if (hasReceipt) {
      sheet.getRange(row, col('현금영수증발행') + 1)
           .setValue(body.receiptIssued ? '발행' : '');
    }
    return { ok: true };
  }
  throw new Error('해당 예약번호를 찾을 수 없습니다: ' + code);
}


/* ---------- 손님이 직접 변경·취소 ---------- */

/* 손님이 직접 바꿀 수 있는 마지막 날의 기본값.
   화면(config.js 의 customerChange)이 값을 보내오면 그것을 쓰고, 없으면 여기 값을 씁니다.
     pickupDaysBefore : 픽업은 수령일 며칠 전까지
     deliveryUntil    : 택배는 이 날까지 */
var CUSTOMER_EDIT = { pickupDaysBefore: 3, deliveryUntil: '2026-09-12' };
var CUSTOMER_EDITABLE = ['대기', '입금확인'];   // 이 상태일 때만 손님이 손댈 수 있습니다

/**
 * 손님이 예약 확인 화면에서 자기 예약을 취소하거나(op: 'cancel')
 * 수령일·시간 / 받는 분·주소를 바꿉니다(op: 'change').
 * 예약번호 + 연락처가 맞아야 하고, 기한 안이어야 하며, 상태가 대기·입금확인이어야 합니다.
 * 세트·수량은 바꿀 수 없습니다 (금액이 달라지므로).
 */
function customerEdit(body) {
  var order = lookupOrder(body.code, body.phone);          // 본인 확인
  var sheet = getSheet();
  var rowNo = findRow(sheet, order.code);
  if (!rowNo) throw new Error('예약을 찾을 수 없습니다.');

  var status = trim(sheet.getRange(rowNo, col('상태') + 1).getValue()) || '대기';
  if (status === '취소') throw new Error('이미 취소된 예약입니다.');
  if (CUSTOMER_EDITABLE.indexOf(status) === -1) {
    throw new Error('이미 처리가 끝난 예약은 바꿀 수 없습니다. 매장으로 문의해 주세요.');
  }

  /* 기한: 픽업은 시트의 수령일에서 며칠 앞, 택배는 정해진 날짜까지 */
  var days = Math.floor(Number(body.pickupDaysBefore));
  if (!(days >= 0 && days <= 30)) days = CUSTOMER_EDIT.pickupDaysBefore;
  var isoRe = /^(\d{4})-(\d{2})-(\d{2})$/;
  var ref, back;
  if (order.method === 'delivery') {
    ref = isoRe.test(trim(body.deliveryUntil)) ? trim(body.deliveryUntil) : CUSTOMER_EDIT.deliveryUntil;
    back = 0;
  } else {
    ref = order.pickupDate;
    back = days;
  }
  var m = isoRe.exec(ref || '');
  if (m) {
    var until = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - back);
    var today = Utilities.formatDate(new Date(), tz(), 'yyyy-MM-dd');
    if (today > Utilities.formatDate(until, tz(), 'yyyy-MM-dd')) {
      throw new Error('변경·취소 가능 기한(' + Utilities.formatDate(until, tz(), 'M월 d일') + ')이 지났습니다. 매장으로 문의해 주세요.');
    }
  }

  var stamp = Utilities.formatDate(new Date(), tz(), 'M/d HH:mm');
  var set = function (name, v) { sheet.getRange(rowNo, col(name) + 1).setValue(v); };
  var note = function (text) {
    var cur = trim(sheet.getRange(rowNo, col('요청사항') + 1).getValue());
    set('요청사항', (cur ? cur + '\n' : '') + '[' + stamp + ' 손님 ' + text + ']');
  };

  if (body.op === 'cancel') {
    set('상태', '취소');
    set('취소일시', Utilities.formatDate(new Date(), tz(), 'yyyy-MM-dd HH:mm'));
    set('취소사유', '손님 직접 취소' + (status === '입금확인' ? ' (입금 완료 상태 · 환불 필요)' : ''));
    notify('손님 취소 ' + order.code + ' · ' + order.name + (status === '입금확인' ? ' · 환불 필요' : ''), [
      '예약번호 : ' + order.code,
      '주문자   : ' + order.name + ' · ' + order.phone,
      '주문내역 : ' + order.itemsText,
      '취소 전 상태 : ' + status,
    ]);
  } else if (body.op === 'change') {
    if (order.method === 'pickup') {
      var date = trim(body.pickupDate), time = trim(body.pickupTime).slice(0, 40);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) throw new Error('수령일과 시간을 골라주세요.');
      var before = order.pickupDateLabel + ' ' + order.pickupTime;
      set('수령일', date);
      set('수령일표시', trim(body.pickupDateLabel).slice(0, 40) || date);
      set('수령시간', time);
      var after = (trim(body.pickupDateLabel) || date) + ' ' + time;
      note('변경: 수령 ' + before + ' → ' + after);
      notify('손님 변경 ' + order.code + ' · ' + order.name, [
        '예약번호 : ' + order.code,
        '주문자   : ' + order.name + ' · ' + order.phone,
        '수령일시 : ' + before + ' → ' + after,
        '주문내역 : ' + order.itemsText,
      ]);
    } else {
      var rn = trim(body.receiverName).slice(0, 30);
      var rp = trim(body.receiverPhone);
      var addr = trim(body.address).slice(0, 200);
      if (!rn) throw new Error('받는 분 성함이 비어 있습니다.');
      if (!isPhone(rp)) throw new Error('받는 분 연락처 형식이 올바르지 않습니다.');
      if (!addr) throw new Error('배송지 주소가 비어 있습니다.');
      var changed = [];
      if (rn !== order.receiverName) changed.push('받는 분 ' + order.receiverName + ' → ' + rn);
      if (onlyDigits(rp) !== onlyDigits(order.receiverPhone)) changed.push('받는 분 연락처 변경');
      if (addr !== order.address) changed.push('배송지 ' + order.address + ' → ' + addr);
      set('받는분', rn);
      set('받는분연락처', rp);
      set('배송지주소', addr);
      note('변경: ' + (changed.join(' · ') || '내용 같음'));
      if (changed.length) {
        notify('손님 변경 ' + order.code + ' · ' + order.name, [
          '예약번호 : ' + order.code,
          '주문자   : ' + order.name + ' · ' + order.phone,
          '바뀐 내용 : ' + changed.join(' · '),
          '받는 분  : ' + rn + ' · ' + rp,
          '배송지   : ' + addr,
        ]);
      }
    }
  } else {
    throw new Error('알 수 없는 요청입니다.');
  }

  return { ok: true, order: lookupOrder(body.code, body.phone) };
}

/* 예약번호로 시트의 줄 번호를 찾습니다. 없으면 0. */
function findRow(sheet, code) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < codes.length; i++) {
    if (String(codes[i][0]) === code) return i + 2;
  }
  return 0;
}


/* ---------- 목록 읽기 ---------- */

function readOrders() {
  var sheet = getSheet();
  if (sheet.getLastRow() < 2) return [];

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  var g = function (r, name) { return r[col(name)]; };

  return rows.filter(function (r) { return r[col('예약번호')]; }).map(function (r) {
    var day = g(r, '수령일');
    var when = g(r, '접수일시');
    return {
      code:            String(g(r, '예약번호')),
      createdAt:       when instanceof Date ? when.toISOString() : String(when),
      method:          String(g(r, '수령방법')) === '택배' ? 'delivery' : 'pickup',
      methodLabel:     String(g(r, '수령방법')),
      name:            String(g(r, '주문자')),
      phone:           String(g(r, '주문자연락처')),
      depositor:       String(g(r, '입금자명')),
      receiverName:    String(g(r, '받는분')),
      receiverPhone:   String(g(r, '받는분연락처')),
      address:         String(g(r, '배송지주소')),
      pickupDate:      day instanceof Date ? Utilities.formatDate(day, tz(), 'yyyy-MM-dd') : String(day),
      pickupDateLabel: String(g(r, '수령일표시')),
      pickupTime:      String(g(r, '수령시간')),
      itemsText:       String(g(r, '주문내역')),
      itemCounts:      String(g(r, '상품별수량')),
      totalCount:      Number(g(r, '수량')) || 0,
      itemsPrice:      Number(g(r, '상품금액')) || 0,
      shippingFee:     g(r, '배송비') === '' ? null : (Number(g(r, '배송비')) || 0),
      totalPrice:      Number(g(r, '합계')) || 0,
      cashReceipt:     String(g(r, '현금영수증')),
      receiptIssued:   String(g(r, '현금영수증발행')) === '발행',
      memo:            String(g(r, '요청사항')),
      agreed:          String(g(r, '개인정보동의')),
      status:          String(g(r, '상태') || '대기'),
      canceledAt:      String(g(r, '취소일시') || ''),
      cancelReason:    String(g(r, '취소사유') || ''),
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

/* 예약번호 앞에 붙는 기본 글자. 화면(config.js 의 codePrefix)이 보내오면
   그 값을 쓰므로, 앞글자를 바꿔도 이 코드를 다시 배포할 필요는 없습니다. */
var CODE_PREFIX = 'HFC';

/**
 * 예약번호를 만듭니다. 기본은 HFC-0001 부터이고, 화면(config.js 의
 * codeStart)이 시작 번호를 보내면 그 번호부터 시작합니다.
 *
 * 이미 쓰인 번호 중 가장 큰 값 다음을 쓰므로, 시트에서 줄을 지워도
 * 번호가 겹치지 않습니다. (줄 개수로 세면 지운 뒤 중복됩니다)
 * 앞글자가 예전 것(CS-)이어도 숫자만 보고 이어붙이므로 겹치지 않습니다.
 */
function nextCode(sheet, start, prefix) {
  var last = sheet.getLastRow();
  var max = 0;
  if (last >= 2) {
    sheet.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) {
      var m = /^[A-Z]+-(\d+)$/.exec(String(r[0]).trim());   // 예약번호는 항상 첫 열
      if (m) max = Math.max(max, Number(m[1]));
    });
  }

  var from = Math.floor(Number(start));
  if (!(from >= 1 && from <= 999999)) from = 1;      // 이상한 값이 오면 무시

  var head = String(prefix || '').trim().toUpperCase();
  if (!/^[A-Z]{1,6}$/.test(head)) head = CODE_PREFIX;   // 이상한 값이 오면 무시

  var n = Math.max(max + 1, from);
  return head + '-' + ('0000' + n).slice(-4);
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
