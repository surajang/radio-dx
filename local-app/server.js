const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const {
  getKstDateParts,
  loadExistingData,
  updateAllSchedules,
  enrichWithOnAirStatus
} = require('./src/fetcher');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const UPDATE_INTERVAL_HOURS = Number(process.env.UPDATE_INTERVAL_HOURS || 24);
const UPDATE_INTERVAL_MS = UPDATE_INTERVAL_HOURS * 60 * 60 * 1000;

const PUBLIC_DIR = path.resolve(__dirname, 'public');
const STATIC_PAGE_DIR = path.resolve(__dirname, '../page');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

let currentPayload = null;
let isUpdating = false;
let lastUpdateError = null;
let nextUpdateAt = null;

async function triggerUpdate(reason = 'scheduled') {
  if (isUpdating) {
    return currentPayload;
  }
  isUpdating = true;
  lastUpdateError = null;
  console.log(`[Server] 편성표 업데이트 시작 (사유: ${reason})...`);
  try {
    currentPayload = await updateAllSchedules();
    nextUpdateAt = new Date(Date.now() + UPDATE_INTERVAL_MS).toISOString();
    console.log(
      `[Server] 편성표 업데이트 완료 · 기준일: ${currentPayload.scheduleDate} · 성공: ${currentPayload.successChannels}/${currentPayload.totalChannels} 채널 · 다음 업데이트: ${nextUpdateAt}`
    );
    return currentPayload;
  } catch (err) {
    lastUpdateError = err.message;
    console.error('[Server] 편성표 업데이트 실패:', err.message);
    throw err;
  } finally {
    isUpdating = false;
  }
}

async function initScheduleState() {
  const existing = await loadExistingData();
  const todayKst = getKstDateParts().ymdHyphen;

  if (existing && existing.channels && existing.channels.length > 0) {
    currentPayload = existing;
    const ageMs = Date.now() - new Date(existing.updatedAt).getTime();
    if (existing.scheduleDate !== todayKst || ageMs >= UPDATE_INTERVAL_MS) {
      try {
        await triggerUpdate('startup-stale');
      } catch (err) {
        console.error('[Server] 부팅 초기 업데이트 실패 (기존 캐시 유지):', err.message);
      }
    } else {
      nextUpdateAt = new Date(new Date(existing.updatedAt).getTime() + UPDATE_INTERVAL_MS).toISOString();
      console.log(
        `[Server] 기존 수집 데이터 로드 완료 (${existing.scheduleDate}, ${existing.successChannels}/${existing.totalChannels} 채널)`
      );
    }
  } else {
    try {
      await triggerUpdate('startup-initial');
    } catch (err) {
      console.error('[Server] 최초 수집 실패 (잠시 후 재시도):', err.message);
    }
  }

  // 부팅 직후 네트워크 지연으로 일부 채널 수집이 누락된 경우 1분 뒤 재시도
  if (!currentPayload || currentPayload.successChannels < currentPayload.totalChannels) {
    const retryTimer = setTimeout(() => {
      triggerUpdate('boot-network-retry').catch(() => {});
    }, 60 * 1000);
    retryTimer.unref();
  }

  // 24시간 주기 정기 업데이트 타이머 및 KST 날짜 변경 감지
  const timer = setInterval(async () => {
    try {
      const nowKstDate = getKstDateParts().ymdHyphen;
      const ageMs = currentPayload?.updatedAt
        ? Date.now() - new Date(currentPayload.updatedAt).getTime()
        : Infinity;

      if (ageMs >= UPDATE_INTERVAL_MS || currentPayload?.scheduleDate !== nowKstDate) {
        await triggerUpdate(ageMs >= UPDATE_INTERVAL_MS ? '24h-interval' : 'kst-date-rollover');
      }
    } catch (err) {
      console.error('[Server] 정기 업데이트 루프 오류:', err.message);
    }
  }, 5 * 60 * 1000); // 5분마다 만료 여부 및 자정 경과 점검
  timer.unref();
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

async function serveStaticFile(res, baseDir, relPath) {
  const safeRel = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = path.join(baseDir, safeRel);

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const list = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        list.push(net.address);
      }
    }
  }
  return list;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // API 1: 전체 편성표 + 실시간 ON AIR 상태 조회
  if (pathname === '/api/schedules' && req.method === 'GET') {
    if (!currentPayload) {
      return sendJson(res, 503, { error: '편성표 데이터를 준비 중입니다.' });
    }
    const enriched = enrichWithOnAirStatus(currentPayload, new Date());
    return sendJson(res, 200, {
      ...enriched,
      isUpdating,
      lastUpdateError,
      nextUpdateAt
    });
  }

  // API 2: 현재 ON AIR 요약 조회
  if (pathname === '/api/onair' && req.method === 'GET') {
    if (!currentPayload) {
      return sendJson(res, 503, { error: '편성표 데이터를 준비 중입니다.' });
    }
    const enriched = enrichWithOnAirStatus(currentPayload, new Date());
    const summary = enriched.channels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      broadcaster: ch.broadcaster,
      scope: ch.scope,
      primaryBand: ch.primaryBand,
      transmissions: ch.transmissions,
      currentProgram: ch.currentProgram,
      nextProgram: ch.nextProgram
    }));
    return sendJson(res, 200, {
      kstNow: enriched.kstNow,
      updatedAt: enriched.updatedAt,
      nextUpdateAt,
      channels: summary
    });
  }

  // API 3: 수동 즉시 업데이트 트리거
  if (pathname === '/api/refresh' && req.method === 'POST') {
    try {
      await triggerUpdate('manual-ui');
      const enriched = enrichWithOnAirStatus(currentPayload, new Date());
      return sendJson(res, 200, {
        ...enriched,
        isUpdating,
        lastUpdateError,
        nextUpdateAt
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 기존 정적 지도/탐색기 페이지 연동 (/dx-map/*)
  if (pathname.startsWith('/dx-map/')) {
    const subPath = pathname.slice('/dx-map/'.length) || 'index.html';
    return serveStaticFile(res, STATIC_PAGE_DIR, subPath);
  }

  // 로컬 웹 앱 정적 파일 서빙
  const reqPath = pathname === '/' ? 'index.html' : pathname.slice(1);
  return serveStaticFile(res, PUBLIC_DIR, reqPath);
});

async function start() {
  await initScheduleState();
  server.listen(PORT, HOST, () => {
    const lanIps = getLanAddresses();
    console.log('================================================================');
    console.log(' Radio DX 홈 네트워크 로컬 편성표 서버가 시작되었습니다.');
    console.log(` - 로컬 접속:   http://localhost:${PORT}`);
    for (const ip of lanIps) {
      console.log(` - 홈 네트워크: http://${ip}:${PORT}`);
    }
    console.log(` - 업데이트 주기: ${UPDATE_INTERVAL_HOURS}시간 (자정/일일 자동 갱신 포함)`);
    console.log('================================================================');
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('[Server] 시작 실패:', err);
    process.exit(1);
  });
}

module.exports = { server, initScheduleState, triggerUpdate };
