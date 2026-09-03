# 호핀치 추석 예약 시스템 ― 작업 지침

## 사장님과의 약속

- **"링크"** 라고만 하시면 아래 세 주소를 **모두** 정리해서 답하세요.
  매번 어느 링크냐고 되묻지 마세요.

  | 용도 | 주소 |
  | --- | --- |
  | 손님용 · 예약 | https://min-zoo.github.io/hawfinch/ |
  | 손님용 · 예약 확인 | https://min-zoo.github.io/hawfinch/order.html |
  | 직원용 · 예약 목록 | https://min-zoo.github.io/hawfinch/admin.html |

- 사장님은 비개발자입니다. 전문 용어를 피하고, 화면에서 무엇을 누르는지
  구체적으로 안내하세요.

- **예약 기간은 9월 6일 ~ 12일로 확정**되어 `openDate`/`closeDate` 에
  들어가 있습니다. 그리고 **`practice: true` 로 시작일 전에도 열어둔
  상태**입니다. 사장님이 시험 중이시니 **절대 먼저 닫지 마세요.**
  "이제 됐다 / 손님에게 뿌린다" 고 하실 때 `practice: false` 로 바꾸면
  됩니다. 이 얘기를 먼저 꺼내지도 마세요.

## 작업할 때

- 파일을 고친 뒤 **커밋 전에 `sh stamp.sh`** 를 실행하세요.
  브라우저가 옛날 파일을 계속 쓰는 것을 막습니다.
- 검증은 `/tmp/.../scratchpad/test.js` 로 돌립니다. 없으면 다시 만드세요.
  Chromium 은 `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` 에 있습니다.
- 이 작업 공간에서는 **github.io 와 script.google.com 에 접속할 수 없습니다.**
  배포 확인은 GitHub deployments API 로 하고, 실제 동작은 사장님께 부탁하세요.
- 붙여넣은 이미지는 디스크에 남지 않습니다. 파일이 필요하면 사장님께
  깃허브 업로드를 요청하세요 (`.../upload/main`).

## 구조

- `assets/config.js` 하나만 고치면 매장 정보·상품·날짜·배송비·상태가 바뀝니다.
- `apps-script/Code.gs` 를 고치면 **사장님이 직접 다시 배포해야 합니다.**
  되도록 config.js 로 해결되게 설계하세요.
