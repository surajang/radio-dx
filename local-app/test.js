const assert = require('assert');
const { server, initScheduleState } = require('./server');

async function runTests() {
  console.log('[Test] 1. 초기 편성표 상태 초기화 및 검증...');
  await initScheduleState();

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Test] 테스트 서버 실행 완료: ${baseUrl}`);

  try {
    // 1. 메인 페이지 확인
    const indexRes = await fetch(`${baseUrl}/`);
    assert.strictEqual(indexRes.status, 200, '메인 페이지 응답은 200이어야 합니다.');
    const indexHtml = await indexRes.text();
    assert(indexHtml.includes('지금 방송 중 (ON AIR) 요약 대시보드'), '대시보드 제목이 포함되어야 합니다.');

    // 2. /api/schedules 확인
    const apiRes = await fetch(`${baseUrl}/api/schedules`);
    assert.strictEqual(apiRes.status, 200, '/api/schedules 응답은 200이어야 합니다.');
    const data = await apiRes.json();
    assert.strictEqual(data.totalChannels, 24, '총 24개 고유 채널이어야 합니다.');
    assert.strictEqual(data.successChannels, 24, '24개 채널 모두 수집 성공 상태여야 합니다.');

    const totalTransmissions = data.channels.reduce((sum, c) => sum + c.transmissions.length, 0);
    assert.strictEqual(totalTransmissions, 27, 'stations.js의 27개 송출 주파수(국내 22 + 해외 5)가 모두 매핑되어야 합니다.');

    // 3. /api/onair 확인
    const onairRes = await fetch(`${baseUrl}/api/onair`);
    assert.strictEqual(onairRes.status, 200, '/api/onair 응답은 200이어야 합니다.');
    const onairData = await onairRes.json();
    assert.strictEqual(onairData.channels.length, 24, 'ON AIR 목록은 24개 채널을 반환해야 합니다.');

    // 4. 기존 정적 지도 페이지 연동 확인
    const mapRes = await fetch(`${baseUrl}/dx-map/index.html`);
    assert.strictEqual(mapRes.status, 200, '/dx-map/index.html 연동 응답은 200이어야 합니다.');

    console.log('[Test] 모든 테스트 통과! (24개 채널 · 27개 주파수 · 웹서버 API 정상 작동)');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('[Test] 실패:', err);
  process.exit(1);
});
