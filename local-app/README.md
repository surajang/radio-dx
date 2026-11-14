# Radio DX 홈 네트워크 로컬 편성표 서버 (`local-app`)

기존 GitHub Pages 정적 사이트(루트 디렉터리)와 분리되어 독립적으로 동작하는 **Node.js 기반 홈 네트워크 로컬 웹 애플리케이션**입니다.
[`stations.js`](../stations.js)에 수록된 **국내 AM/FM 20개 고유 방송국(22개 주파수)**과 **일본 NHK 중파·라디오 닛케이 단파 4개 방송국(5개 주파수)**의 일일 편성표를 24시간 주기로 자동 수집하여 로컬 웹서버로 서빙합니다.

## 주요 기능

1. **24시간 주기 편성표 자동 수집 (`src/fetcher.js`)**
   - **국내 20개 채널 (22개 주파수)**: KBS(1·2·3라디오, 클래식FM, 쿨FM), MBC(표준FM, FM4U), SBS(러브FM, 파워FM), EBS FM, CBS(표준FM, 음악FM), TBS FM, FEBC 극동방송, CPBC 평화방송, BBS 불교방송, WBS 원음방송, 국악방송, KFN 국방FM, AFN The Eagle
   - **해외 4개 채널 (5개 주파수)**: 라디오 닛케이 제1(6.055 / 3.925 MHz), 라디오 닛케이 제2(6.115 MHz), NHK 제1 오사카 JOBK(666 kHz), NHK 제1 후쿠오카 JOLK(612 kHz)
   - 수집된 편성표는 `data/schedules.json`에 저장되며, 서버 가동 중 **24시간 주기** 및 **KST 자정(날짜 변경)** 마다 자동으로 최신 편성표를 갱신합니다.
2. **실시간 ON AIR 요약 대시보드 (`public/index.html`, `public/app.js`)**
   - 한국표준시(KST · UTC+9) 기준 각 주파수에서 **지금 방송 중인 프로그램(ON AIR)**, 진행률(%), 남은 시간, 다음 방송(NEXT)을 한눈에 표시합니다.
   - 대역별(`전체`, `국내 FM`, `국내 AM`, `일본 NHK 중파`, `라디오 닛케이 단파`), 송신소별(관악산·남산·소래·남양·나가라·네무로·오사카·후쿠오카), 키워드/주파수별 실시간 검색을 지원합니다.
3. **방송국·주파수별 일일 전체 편성표 타임라인 & 테이블 뷰**
   - 00:00 ~ 24:00 24시간 시각적 타임라인 바 및 현재 시각 표시선 제공
   - 방송국 선택 시 하루 전체 편성표와 방송 상태(`방송 종료` / `ON AIR` / `방송 예정`)를 확인할 수 있습니다.

## 실행 방법

외부 패키지 설치 없이 Node.js(v18 이상) 내장 모듈만으로 즉시 구동됩니다.

```bash
cd local-app

# 1. 로컬 웹 서버 시작 (기본 포트: 3000, 홈 네트워크 0.0.0.0 바인딩)
npm start

# 포트 또는 업데이트 주기를 변경하여 실행할 경우:
PORT=8080 UPDATE_INTERVAL_HOURS=24 npm start

# 2. CLI에서 수동으로 편성표 즉시 수집 및 콘솔 요약 확인
npm run update

# 3. 통합 동작 테스트 실행
npm test
```

서버 시작 후 콘솔에 표시되는 로컬 주소(`http://localhost:3000`) 또는 홈 네트워크 내부 IP 주소(`http://192.168.x.x:3000`)로 집안 내 PC, 스마트폰, 태블릿에서 접속할 수 있습니다.

## 부팅 시 자동 실행 (systemd 사용자 서비스)

현재 시스템(`surajang` 계정, `Linger=yes` 활성화됨)의 `systemd --user` 서비스로 등록되어 있어, **시스템 재부팅 시 로그인 여부와 관계없이 포트 3000에서 자동 실행**되며 프로세스 비정상 종료 시에도 5초 후 자동 재시작됩니다.

- 서비스 유닛 파일: `~/.config/systemd/user/radio-dx-local.service` (저장소 내 백업본: [`radio-dx-local.service`](./radio-dx-local.service))

```bash
# 서비스 상태 확인
systemctl --user status radio-dx-local.service

# 실시간 서버 로그 확인
journalctl --user -u radio-dx-local.service -f

# 서비스 재시작 / 중지
systemctl --user restart radio-dx-local.service
systemctl --user stop radio-dx-local.service
```

