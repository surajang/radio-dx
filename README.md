# Radio DX

국내·해외 라디오 송신소 위치와 대한민국 성남시 분당구 기준 거리를 보여주는 정적 웹문서(`page/`)와, 홈 네트워크 내에서 일일 방송 편성표 및 실시간 ON AIR 현황을 수집·서빙하는 로컬 웹 애플리케이션(`local-app/`)으로 구성되어 있습니다.

## 디렉터리 구조

### 1. `page/` (GitHub Pages 정적 페이지)
- `page/index.html`: 국내 라디오. 수도권 주요 22개 방송, 관악산·남산·소래·남양 4개 송신소.
- `page/overseas.html`: 해외 라디오. 일본 닛케이·NHK 5개 방송, 4개 송신소.
- `page/shortwave.html`: 주요 단파방송. 김제·야마타·베이징·시안·나가라·진화 6개 송신소의 지도, 거리, 출력, 한국시간 방송 시간표와 출처.
- `page/tuner.html`: 기존 국내·해외 목록의 주파수 탐색. 주요 단파방송의 시간표는 별도 페이지에서 확인합니다.

`page/index.html`을 브라우저에서 열면 됩니다. 빌드는 필요하지 않으며 D3만 CDN에서 불러옵니다. 지도 지형과 행정구역 데이터는 저장소에 포함되어 있습니다. 지도의 선 중간에는 대권거리를 표시하며, 송신소 라벨에 마우스를 올리거나 키보드로 초점을 맞추면 위경도를 확인할 수 있습니다. 모바일에서는 라벨을 탭할 수 있습니다.

기존 방송 목록은 `page/stations.js`, 주요 단파방송 자료는 `page/shortwave-data.js`와 `page/shortwave.html`, 지도와 목록 표시는 `page/app.js`, 화면 스타일은 `page/style.css`에서 관리합니다.

### 2. `local-app/` (홈 네트워크 로컬 편성표 서버)
- 국내 AM/FM 20개 방송국 및 일본 NHK 제1·라디오 닛케이 4개 방송국의 일일 편성표를 24시간 주기로 자동 수집하여 로컬 네트워크(`http://localhost:3000`)에 서빙합니다.
- 자세한 실행 및 서비스 설정 방법은 [`local-app/README.md`](local-app/README.md)를 참고하세요.

## GitHub Pages 배포

`page/` 폴더의 파일이 변경될 때만 GitHub Pages가 배포되도록 [`.github/workflows/pages.yml`](.github/workflows/pages.yml) 워크플로가 포함되어 있습니다.
저장소 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택하면 `local-app/` 등 외부 폴더 변경 시에는 불필요한 배포가 실행되지 않고 `page/` 변경 시에만 게시됩니다.

## 데이터

분당구청 부근(37.3827, 127.1188)에서 각 송신소까지 대권거리를 계산합니다. 국내는 0.1 km, 해외는 1 km 단위로 반올림합니다. 실제 전파의 이동 거리나 수신 가능 범위를 의미하지 않습니다. 좌표·방송 정보 출처는 각 페이지 하단에 있습니다. 국내 목록은 전국의 모든 방송을 망라하지 않으며, 해외 목록은 현재 일본 송신소로 구성되어 있습니다.

지도 지형은 Natural Earth의 public domain 데이터를 사용합니다. 국내 행정구역은 southkorea-maps에서 제공하는 KOSTAT 2013 시군구 자료를 사용하며, 현재 행정경계와 다를 수 있습니다. D3의 라이선스는 ISC입니다.
