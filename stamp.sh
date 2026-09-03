#!/bin/sh
# 파일을 고쳐도 손님 브라우저가 옛날 것을 계속 쓰는 일을 막습니다.
# HTML 안의 assets/... 주소 뒤에 지금 시각을 붙여, 브라우저가 새 파일로 인식하게 합니다.
# 파일을 고친 뒤 커밋 전에 한 번 실행하세요:  sh stamp.sh
V=$(date -u +%Y%m%d%H%M)
for f in index.html admin.html order.html; do
  sed -i -E "s#(assets/[A-Za-z0-9_.-]+\.(css|js|png|svg))(\?v=[0-9]+)?#\1?v=$V#g" "$f"
done
echo "버전 도장 완료: v=$V"
