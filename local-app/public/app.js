let scheduleData = null;
let activeScopeFilter = 'all';
let activeSiteFilter = 'all';
let searchQuery = '';
let selectedChannelId = 'kbs-1radio';

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

function getKstNow() {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const hours = kst.getUTCHours();
  const minutes = kst.getUTCMinutes();
  const seconds = kst.getUTCSeconds();
  const dow = WEEKDAYS_KO[kst.getUTCDay()];
  return {
    dateLabel: `${year}년 ${month}월 ${day}일 (${dow})`,
    timeLabel: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    hmLabel: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    nowMinutes: hours * 60 + minutes
  };
}

function formatKstDateTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '-';
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${m}-${day} ${hh}:${mm} KST`;
}

function computeClientOnAir(channel, nowMinutes) {
  const programs = channel.programs || [];
  let currentProgram = null;
  let nextProgram = null;

  for (let i = 0; i < programs.length; i++) {
    const p = programs[i];
    if (nowMinutes >= p.startMinutes && nowMinutes < p.endMinutes) {
      const total = Math.max(1, p.endMinutes - p.startMinutes);
      const elapsed = nowMinutes - p.startMinutes;
      currentProgram = {
        ...p,
        progressPercent: Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))),
        remainingMinutes: p.endMinutes - nowMinutes
      };
      nextProgram = programs[i + 1] || programs[0] || null;
      break;
    }
  }

  if (!currentProgram && programs.length > 0) {
    const nextIdx = programs.findIndex((p) => p.startMinutes > nowMinutes);
    nextProgram = nextIdx >= 0 ? programs[nextIdx] : programs[0];
  }

  return { currentProgram, nextProgram };
}

function updateClockDisplay() {
  const kst = getKstNow();
  document.getElementById('live-clock').textContent = kst.timeLabel;
  document.getElementById('live-date').textContent = kst.dateLabel;
}

function populateSiteFilter(channels) {
  const select = document.getElementById('site-filter');
  const sites = new Set();
  for (const ch of channels) {
    for (const t of ch.transmissions || []) {
      sites.add(t.siteName);
    }
  }
  const currentVal = select.value;
  select.innerHTML = `<option value="all">모든 송신소 (${sites.size}곳)</option>`;
  for (const siteName of sites) {
    const opt = document.createElement('option');
    opt.value = siteName;
    opt.textContent = siteName;
    select.appendChild(opt);
  }
  if ([...sites].includes(currentVal)) {
    select.value = currentVal;
  }
}

function matchesFilter(ch, nowMinutes) {
  if (activeScopeFilter === 'domestic-fm') {
    if (ch.scope !== 'domestic' || !ch.bands.includes('FM')) return false;
  } else if (activeScopeFilter === 'domestic-am') {
    if (ch.scope !== 'domestic' || !ch.bands.includes('AM')) return false;
  } else if (activeScopeFilter === 'overseas-am') {
    if (ch.scope !== 'overseas' || !ch.bands.includes('AM')) return false;
  } else if (activeScopeFilter === 'overseas-sw') {
    if (ch.scope !== 'overseas' || !ch.bands.includes('SW')) return false;
  }

  if (activeSiteFilter !== 'all') {
    const hasSite = (ch.transmissions || []).some((t) => t.siteName === activeSiteFilter);
    if (!hasSite) return false;
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const { currentProgram, nextProgram } = computeClientOnAir(ch, nowMinutes);
    const haystack = [
      ch.name,
      ch.broadcaster,
      ch.category,
      ...(ch.transmissions || []).map((t) => `${t.frequency} ${t.siteName} ${t.region}`),
      currentProgram?.title || '',
      currentProgram?.subtitle || '',
      nextProgram?.title || ''
    ]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

function renderStatusHeader() {
  if (!scheduleData) return;
  document.getElementById('status-channels').textContent =
    `${scheduleData.successChannels}/${scheduleData.totalChannels} 채널`;
  document.getElementById('status-date').textContent = scheduleData.scheduleDate || '-';
  document.getElementById('status-updated').textContent = formatKstDateTime(scheduleData.updatedAt);
  document.getElementById('status-next').textContent = formatKstDateTime(scheduleData.nextUpdateAt);
}

function renderOnAirDashboard() {
  if (!scheduleData) return;
  const grid = document.getElementById('onair-grid');
  const { nowMinutes } = getKstNow();
  const filtered = (scheduleData.channels || []).filter((ch) => matchesFilter(ch, nowMinutes));

  const totalFreqs = filtered.reduce((acc, ch) => acc + (ch.transmissions?.length || 0), 0);
  document.getElementById('onair-count').textContent =
    `${filtered.length}개 채널 · ${totalFreqs}개 주파수 표시 중`;

  grid.replaceChildren();

  if (filtered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'intro';
    empty.textContent = '조건에 맞는 방송국이 없습니다. 필터나 검색어를 변경해 보세요.';
    grid.appendChild(empty);
    return;
  }

  for (const ch of filtered) {
    const { currentProgram, nextProgram } = computeClientOnAir(ch, nowMinutes);
    const card = document.createElement('article');
    card.className = `onair-card${ch.id === selectedChannelId ? ' selected' : ''}`;
    card.dataset.band = ch.primaryBand;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${ch.name} 일일 전체 편성표 보기`);

    const freqHtml = (ch.transmissions || [])
      .map(
        (t) =>
          `<span class="freq-tag ${t.band}"><strong>${t.frequency}</strong> · ${t.siteName} (${t.distanceKm.toLocaleString()} km)</span>`
      )
      .join('');

    const onAirTitle = currentProgram ? currentProgram.title : '정시 뉴스 / 방송 준비 중';
    const onAirSub = currentProgram?.subtitle || ch.category || '';
    const onAirTime = currentProgram
      ? `${currentProgram.startTime} ~ ${currentProgram.endTime}`
      : '시간표 확인';
    const progress = currentProgram ? currentProgram.progressPercent : 0;
    const remainText = currentProgram ? `${currentProgram.remainingMinutes}분 남음` : '';

    const nextText = nextProgram
      ? `${nextProgram.startTime} ${nextProgram.title}`
      : '다음 편성 정보 없음';

    card.innerHTML = `
      <div class="card-top">
        <div class="station-title-group">
          <span class="band-pill ${ch.primaryBand}">${ch.bands.join('·')}</span>
          <h3 class="station-title">${ch.name}</h3>
        </div>
        <span class="live-badge"><span class="live-dot"></span>ON AIR</span>
      </div>
      <div class="freq-tags">${freqHtml}</div>
      <div class="onair-program-box">
        <div class="program-time-row">
          <span>${onAirTime}</span>
          <span>${remainText} (${progress}%)</span>
        </div>
        <p class="program-main-title">${onAirTitle}</p>
        ${onAirSub ? `<p class="program-sub">${onAirSub}</p>` : ''}
        <div class="progress-track" aria-hidden="true">
          <div class="progress-fill" style="width:${progress}%"></div>
        </div>
      </div>
      <div class="next-program-row">
        <span>다음 방송</span>
        <span class="next-program-title">${nextText}</span>
      </div>
    `;

    const selectStation = () => {
      selectedChannelId = ch.id;
      renderOnAirDashboard();
      renderTimetableSection(true);
      document.getElementById('timetable-section').scrollIntoView({ behavior: 'smooth' });
    };

    card.addEventListener('click', selectStation);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectStation();
      }
    });

    grid.appendChild(card);
  }
}

function renderTimetableSection(scrollToOnAir = false) {
  if (!scheduleData || !scheduleData.channels?.length) return;
  const channels = scheduleData.channels;
  const selected = channels.find((c) => c.id === selectedChannelId) || channels[0];
  selectedChannelId = selected.id;

  const { nowMinutes, hmLabel } = getKstNow();

  // 1. 왼쪽 방송국 선택 사이드바
  const selectorEl = document.getElementById('station-selector');
  selectorEl.replaceChildren();

  for (const ch of channels) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `station-select-btn${ch.id === selected.id ? ' active' : ''}`;
    const freqs = (ch.transmissions || []).map((t) => t.frequency).join(' / ');
    const { currentProgram } = computeClientOnAir(ch, nowMinutes);
    btn.innerHTML = `
      <div class="select-top">
        <span>${ch.name}</span>
        <span class="band-pill ${ch.primaryBand}">${ch.primaryBand}</span>
      </div>
      <div class="select-sub">${freqs} · ${currentProgram ? currentProgram.title : ch.category}</div>
    `;
    btn.addEventListener('click', () => {
      selectedChannelId = ch.id;
      renderOnAirDashboard();
      renderTimetableSection(true);
    });
    selectorEl.appendChild(btn);
  }

  // 2. 선택된 방송국 상단 메타 카드
  const headerEl = document.getElementById('selected-station-header');
  const freqBadges = (selected.transmissions || [])
    .map(
      (t) =>
        `<span class="freq-tag ${t.band}"><strong>${t.frequency}</strong> · ${t.siteName} (${t.region} · 분당까지 ${t.distanceKm.toLocaleString()} km)</span>`
    )
    .join('');

  headerEl.innerHTML = `
    <div class="selected-station-top">
      <div>
        <div class="station-title-group">
          <span class="band-pill ${selected.primaryBand}">${selected.bands.join(' / ')}</span>
          <h3>${selected.name}</h3>
        </div>
        <p class="intro" style="margin-top:4px">${selected.category} · 총 ${selected.programCount}개 일일 프로그램 (${selected.scheduleDate})</p>
      </div>
      <a href="${selected.sourceUrl}" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="text-decoration:none">공식 편성표 출처 (${selected.sourceName}) ↗</a>
    </div>
    <div class="selected-meta-grid">${freqBadges}</div>
  `;

  // 3. 24시간 타임라인 트랙 렌더링
  const trackEl = document.getElementById('timeline-track');
  trackEl.replaceChildren();
  const programs = selected.programs || [];

  for (const p of programs) {
    const leftPct = (p.startMinutes / 1440) * 100;
    const widthPct = Math.max(0.4, ((p.endMinutes - p.startMinutes) / 1440) * 100);
    const isOnAir = nowMinutes >= p.startMinutes && nowMinutes < p.endMinutes;
    const seg = document.createElement('div');
    seg.className = `timeline-seg${isOnAir ? ' onair' : ''}`;
    seg.style.left = `${leftPct}%`;
    seg.style.width = `${widthPct}%`;
    seg.title = `${p.startTime}~${p.endTime} ${p.title}`;
    trackEl.appendChild(seg);
  }

  const nowPct = (nowMinutes / 1440) * 100;
  document.getElementById('timeline-now-line').style.left = `${nowPct}%`;
  document.getElementById('timeline-cursor-label').textContent = `현재 ${hmLabel} KST`;

  // 4. 일일 편성표 테이블 렌더링
  const tbody = document.getElementById('schedule-rows');
  tbody.replaceChildren();
  document.getElementById('schedule-table-caption').textContent =
    `${selected.name} (${selected.scheduleDate}) 일일 편성표`;

  let onAirRowEl = null;

  for (const p of programs) {
    const tr = document.createElement('tr');
    const isOnAir = nowMinutes >= p.startMinutes && nowMinutes < p.endMinutes;
    const isPast = p.endMinutes <= nowMinutes;

    if (isOnAir) {
      tr.className = 'row-onair';
      onAirRowEl = tr;
    } else if (isPast) {
      tr.className = 'row-past';
    }

    const stateBadge = isOnAir
      ? '<span class="badge-state onair">ON AIR</span>'
      : isPast
        ? '<span class="badge-state past">방송 종료</span>'
        : '<span class="badge-state upcoming">방송 예정</span>';

    const durMin = p.endMinutes - p.startMinutes;

    tr.innerHTML = `
      <td class="time-cell">${p.startTime} ~ ${p.endTime}</td>
      <td class="status-cell">${stateBadge}</td>
      <td><strong>${p.title}</strong></td>
      <td>${p.subtitle || '-'}</td>
      <td class="duration-cell">${durMin}분</td>
    `;
    tbody.appendChild(tr);
  }

  if (scrollToOnAir && onAirRowEl) {
    const wrap = document.querySelector('.schedule-table-wrap');
    if (wrap) {
      const topPos = Math.max(0, onAirRowEl.offsetTop - wrap.clientHeight / 2 + 30);
      wrap.scrollTo({ top: topPos, behavior: 'smooth' });
    }
  }
}

async function loadSchedules(scrollToOnAir = false) {
  const res = await fetch('/api/schedules');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  scheduleData = await res.json();
  populateSiteFilter(scheduleData.channels || []);
  renderStatusHeader();
  renderOnAirDashboard();
  renderTimetableSection(scrollToOnAir);
}

// 이벤트 바인딩
document.getElementById('scope-filters').addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-chip');
  if (!btn) return;
  document.querySelectorAll('#scope-filters .filter-chip').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  activeScopeFilter = btn.dataset.filter;
  renderOnAirDashboard();
});

document.getElementById('site-filter').addEventListener('change', (e) => {
  activeSiteFilter = e.target.value;
  renderOnAirDashboard();
});

document.getElementById('search-input').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  renderOnAirDashboard();
});

document.getElementById('scroll-onair-btn').addEventListener('click', () => {
  renderTimetableSection(true);
});

document.getElementById('refresh-btn').addEventListener('click', async () => {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = '웹에서 수집 중...';
  try {
    const res = await fetch('/api/refresh', { method: 'POST' });
    if (!res.ok) throw new Error('업데이트 요청 실패');
    scheduleData = await res.json();
    renderStatusHeader();
    renderOnAirDashboard();
    renderTimetableSection(true);
  } catch (err) {
    alert(`편성표 업데이트 중 오류가 발생했습니다: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '지금 편성표 업데이트';
  }
});

// 초기 실행 및 실시간 타이머
updateClockDisplay();
setInterval(updateClockDisplay, 1000);

// 20초마다 현재 시각 기준 ON AIR 진행률 및 프로그램 전환 자동 반영
setInterval(() => {
  if (scheduleData) {
    renderOnAirDashboard();
    renderTimetableSection(false);
  }
}, 20 * 1000);

// 10분마다 서버의 최신 편성표 상태 동기화
setInterval(() => {
  loadSchedules(false).catch(() => {});
}, 10 * 60 * 1000);

loadSchedules(true).catch((err) => {
  console.error('초기 편성표 로드 실패:', err);
});
