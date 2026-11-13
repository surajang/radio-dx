# Radio DX

일본 라디오 송신소 위치와 대한민국 성남시 분당구 기준 거리를 보여주는 한국어 웹문서입니다.

## 포함 송신소

- 라디오 닛케이 나가라 / 네무로
- NHK 오사카 미하라: 666 kHz, JOBK
- NHK 후쿠오카 가스가: 612 kHz, JOLK

`index.html`을 브라우저에서 열면 됩니다. 빌드는 필요하지 않으며 D3만 CDN에서 불러옵니다. 지형 데이터는 문서 안에 포함되어 있습니다.

## GitHub Pages

저장소 **Settings → Pages → Build and deployment → Deploy from a branch**에서 `main`과 `/ (root)`를 선택하면 게시할 수 있습니다. 설정 후 기본 주소는 `https://surajang.github.io/radio-dx/`입니다.

## 데이터

분당구청 부근(37.3827, 127.1188)에서 각 송신소까지 대권거리를 계산하고 10 km 단위로 반올림합니다. 실제 전파의 이동 거리나 수신 가능 범위를 의미하지 않습니다. 좌표·방송 정보 출처는 웹문서 하단에 있습니다.

지도 지형은 Natural Earth의 public domain 데이터를 사용합니다. D3의 라이선스는 ISC입니다.
