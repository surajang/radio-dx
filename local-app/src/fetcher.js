const fs = require('fs/promises');
const path = require('path');
const { buildStationCatalog } = require('./stations-meta');

const DATA_FILE = path.resolve(__dirname, '../data/schedules.json');
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function getKstDateParts(date = new Date()) {
  const kstMs = date.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const hours = kst.getUTCHours();
  const minutes = kst.getUTCMinutes();
  const seconds = kst.getUTCSeconds();
  const dayOfWeek = kst.getUTCDay(); // 0(Sun) ~ 6(Sat)
  return {
    year,
    month,
    day,
    ymd: `${year}${month}${day}`,
    ymdHyphen: `${year}-${month}-${day}`,
    hours,
    minutes,
    seconds,
    nowMinutes: hours * 60 + minutes,
    dayOfWeek
  };
}

function decodeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function minutesToHHMM(min) {
  const clamped = Math.max(0, Math.min(1440, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hhmmToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * 00:00 ~ 24:00 (0 ~ 1440분) 기준으로 프로그램 목록을 정렬·보정합니다.
 * 24:00 이후(예: 24:00~29:00) 편성 항목은 00:00~05:00 구간으로 변환하여 하루 24시간 타임라인을 완성합니다.
 */
function normalizeScheduleItems(rawItems) {
  const expanded = [];

  for (const item of rawItems) {
    const title = decodeHtml(item.title);
    if (!title) continue;
    const subtitle = decodeHtml(item.subtitle || '');

    let sMin = item.startMinutes ?? hhmmToMinutes(item.startTime);
    let eMin = item.endMinutes ?? (item.endTime ? hhmmToMinutes(item.endTime) : null);
    if (sMin === null || !Number.isFinite(sMin)) continue;

    if (eMin !== null && Number.isFinite(eMin)) {
      if (eMin <= sMin && eMin <= 300 && sMin >= 1200) {
        // 예: 22:00 ~ 05:00 또는 23:00 ~ 01:00
        eMin += 1440;
      }
      // 24:00(1440분) 이상으로 넘어가는 구간 분리
      if (sMin >= 1440) {
        const wrappedStart = sMin - 1440;
        const wrappedEnd = Math.min(1440, eMin - 1440);
        if (wrappedEnd > wrappedStart) {
          expanded.push({
            startMinutes: wrappedStart,
            endMinutes: wrappedEnd,
            title,
            subtitle
          });
        }
      } else if (eMin > 1440) {
        // 자정을 걸치는 프로그램 (예: 23:00 ~ 25:00) -> 23:00~24:00 + 00:00~01:00
        expanded.push({
          startMinutes: sMin,
          endMinutes: 1440,
          title,
          subtitle
        });
        const afterMidnight = Math.min(1440, eMin - 1440);
        if (afterMidnight > 0) {
          expanded.push({
            startMinutes: 0,
            endMinutes: afterMidnight,
            title,
            subtitle
          });
        }
      } else if (eMin > sMin) {
        expanded.push({
          startMinutes: sMin,
          endMinutes: eMin,
          title,
          subtitle
        });
      }
    } else {
      // 종료 시각이 없는 경우 일단 시작 시각만 등록 후 다음 프로그램 시작 시각으로 채움
      const normStart = sMin >= 1440 ? sMin - 1440 : sMin;
      expanded.push({
        startMinutes: normStart,
        endMinutes: null,
        title,
        subtitle
      });
    }
  }

  // 시작 시각 기준 정렬 및 중복 제거
  expanded.sort((a, b) => a.startMinutes - b.startMinutes || (a.endMinutes || 0) - (b.endMinutes || 0));

  const deduped = [];
  for (const item of expanded) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.startMinutes === item.startMinutes && prev.title === item.title) {
      if (!prev.endMinutes && item.endMinutes) prev.endMinutes = item.endMinutes;
      continue;
    }
    deduped.push({ ...item });
  }

  // endMinutes 보정
  for (let i = 0; i < deduped.length; i++) {
    const cur = deduped[i];
    const next = deduped[i + 1];
    if (cur.endMinutes === null || cur.endMinutes <= cur.startMinutes) {
      cur.endMinutes = next ? Math.max(cur.startMinutes + 5, next.startMinutes) : 1440;
    }
    if (cur.endMinutes > 1440) cur.endMinutes = 1440;
    cur.startTime = minutesToHHMM(cur.startMinutes);
    cur.endTime = minutesToHHMM(cur.endMinutes);
    cur.durationMinutes = cur.endMinutes - cur.startMinutes;
  }

  return deduped;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': USER_AGENT,
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} (${url})`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// 1. KBS 5개 채널 일괄 수집 (21, 22, 23, 24, 25)
async function fetchKbsAll(ymd) {
  const url = `https://static.api.kbs.co.kr/mediafactory/v1/schedule/weekly?rtype=json&channel_code=21,22,23,24,25&local_station_code=00&program_planned_date_from=${ymd}&program_planned_date_to=${ymd}`;
  const res = await fetchWithTimeout(url);
  const data = await res.json();
  const byCode = {};
  for (const entry of data) {
    const code = entry.channel_code;
    const raw = (entry.schedules || []).map((s) => {
      const st = String(s.program_planned_start_time || '');
      const et = String(s.program_planned_end_time || '');
      const sMin = Number(st.slice(0, 2)) * 60 + Number(st.slice(2, 4));
      const eMin = Number(et.slice(0, 2)) * 60 + Number(et.slice(2, 4));
      const parts = [s.program_subtitle, s.program_actor].filter(Boolean);
      return {
        startMinutes: sMin,
        endMinutes: eMin,
        title: s.program_title,
        subtitle: parts.join(' · ')
      };
    });
    byCode[code] = normalizeScheduleItems(raw);
  }
  return byCode;
}

// 2. MBC (FM / FM4U)
async function fetchMbc(type, ymd) {
  const url = `https://control.imbc.com/Schedule/RADIO?sDate=${ymd}&sType=${type}`;
  const res = await fetchWithTimeout(url);
  const list = await res.json();
  const raw = (Array.isArray(list) ? list : []).map((item) => {
    const st = String(item.StartTime || '');
    const et = String(item.EndTime || '');
    const sMin = Number(st.slice(0, 2)) * 60 + Number(st.slice(2, 4));
    let eMin = Number(et.slice(0, 2)) * 60 + Number(et.slice(2, 4));
    if (eMin <= sMin) eMin += 1440;
    return {
      startMinutes: sMin,
      endMinutes: eMin,
      title: item.Title,
      subtitle: item.SubTitle || (item.Live === 'Y' ? '생방송' : '')
    };
  });
  return normalizeScheduleItems(raw);
}

// 3. SBS (Power / Love)
async function fetchSbs(channel, { year, month, day }) {
  const m = Number(month);
  const d = Number(day);
  const url = `https://static.cloud.sbs.co.kr/schedule/${year}/${m}/${d}/${channel}.json`;
  const res = await fetchWithTimeout(url);
  const list = await res.json();
  const raw = (Array.isArray(list) ? list : []).map((item) => {
    const sMin = hhmmToMinutes(item.start_time);
    const eMin = hhmmToMinutes(item.end_time);
    const notes = [];
    if (item.is_bora === 'Y') notes.push('보는 라디오');
    if (item.description) notes.push(item.description);
    return {
      startMinutes: sMin,
      endMinutes: eMin,
      title: item.title,
      subtitle: notes.join(' · ')
    };
  });
  return normalizeScheduleItems(raw);
}

// 4. EBS FM
async function fetchEbs(ymd) {
  const url = `https://www.ebs.co.kr/schedule?channelCd=RADIO&date=${ymd}`;
  const res = await fetchWithTimeout(url);
  const html = await res.text();
  const matches = [
    ...html.matchAll(
      /<div class="time">[\s\S]*?<span>(\d{2}:\d{2})<\/span>[\s\S]*?<div class="tit">[\s\S]*?<strong>([\s\S]*?)<\/strong>(?:[\s\S]*?<span class="txt_cnt">([\s\S]*?)<\/span>)?/g
    )
  ];
  const raw = matches.map((m) => ({
    startTime: m[1],
    title: m[2],
    subtitle: m[3] || ''
  }));
  return normalizeScheduleItems(raw);
}

// 5. CBS (fm / musicFm)
async function fetchCbs(type, ymd) {
  const url = `https://www.cbs.co.kr/schedule?type=${type}`;
  const res = await fetchWithTimeout(url);
  const html = await res.text();

  // 오늘 날짜 swiper-slide 블록 우선 추출, 없으면 첫 번째 swiper-slide 사용
  let slideBlock = '';
  const dayRegex = new RegExp(
    `<div class="swiper-slide"[^>]*data-fulldate="${ymd}"[^>]*>([\\s\\S]*?)<\\/ul>`,
    'i'
  );
  const dayMatch = dayRegex.exec(html);
  if (dayMatch) {
    slideBlock = dayMatch[1];
  } else {
    const firstSlide = /<div class="swiper-slide"[^>]*data-fulldate="\d{8}"[^>]*>([\s\S]*?)<\/ul>/i.exec(html);
    slideBlock = firstSlide ? firstSlide[1] : html;
  }

  const itemMatches = [
    ...slideBlock.matchAll(
      /<li class="slide[^"]*">[\s\S]*?<div class="time">(\d{2}:\d{2})<\/div>[\s\S]*?<div class="program[^"]*">([\s\S]*?)<\/div>\s*<div class="btn-cont">/g
    )
  ];
  const raw = itemMatches.map((m) => {
    const time = m[1];
    const progHtml = m[2];
    let subtitle = '';
    const mcMatch = /<div class="mc">([\s\S]*?)<\/div>/i.exec(progHtml);
    if (mcMatch) {
      subtitle = decodeHtml(mcMatch[1]);
    }
    const titlePart = progHtml.replace(/<div class="mc">[\s\S]*?<\/div>/gi, '');
    return {
      startTime: time,
      title: decodeHtml(titlePart),
      subtitle
    };
  });
  return normalizeScheduleItems(raw);
}

// 6. TBS FM
async function fetchTbs() {
  const url = 'http://tbs.seoul.kr/fm/schedule.do';
  const res = await fetchWithTimeout(url);
  const html = await res.text();
  const matches = [
    ...html.matchAll(
      /<tr>\s*<td>\s*(\d{2}:\d{2})\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g
    )
  ];
  const raw = matches.map((m) => ({
    startTime: m[1],
    title: m[2],
    subtitle: m[3]
  }));
  return normalizeScheduleItems(raw);
}

// 7. FEBC 극동방송
async function fetchFebc() {
  const url = 'https://seoul.febc.net/radio/schedule';
  const res = await fetchWithTimeout(url);
  const html = await res.text();
  const matches = [
    ...html.matchAll(
      /<span class="time">(\d{2}:\d{2})<\/span>[\s\S]*?<p class="tit">([\s\S]*?)<\/p>(?:[\s\S]*?<p class="sub-tit">([\s\S]*?)<\/p>)?/g
    )
  ];
  const raw = matches.map((m) => ({
    startTime: m[1],
    title: m[2],
    subtitle: m[3] || ''
  }));
  return normalizeScheduleItems(raw);
}

// 8. CPBC 평화방송
async function fetchCpbc(ymd) {
  const url = `https://apis.cpbc.co.kr/radio-api/schedule/01/${ymd}`;
  const res = await fetchWithTimeout(url);
  const body = await res.json();
  const list = body.data || [];
  const raw = list.map((item) => ({
    startTime: item.startTime,
    endTime: item.endTime === '00:00' ? '24:00' : item.endTime,
    title: item.program?.title || item.title || '',
    subtitle: item.program?.subTitle || ''
  }));
  return normalizeScheduleItems(raw);
}

// 9. BBS 불교방송
async function fetchBbs(ymdHyphen) {
  const url = `https://www.bbs.or.kr/HOME2/template/ajaxSchedule.html?CODE=WWW&SchGubun=RADIO&SchDate=${ymdHyphen}`;
  const res = await fetchWithTimeout(url);
  const html = await res.text();
  const matches = [
    ...html.matchAll(/<div class="date-box">\s*<p>(\d{2}:\d{2})<\/p>[\s\S]*?<strong>([\s\S]*?)<\/strong>/g)
  ];
  const raw = matches.map((m) => ({
    startTime: m[1],
    title: m[2],
    subtitle: ''
  }));
  return normalizeScheduleItems(raw);
}

// 10. WBS 원음방송
async function fetchWbs() {
  const url = 'https://wbsi.kr/schedule_radio.php';
  const res = await fetchWithTimeout(url);
  const html = await res.text();
  const jsonMatch = /<script[^>]*class="wbs-onair-day-data"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[1]);
    const raw = (parsed.items || []).map((item) => {
      let sMin = null;
      let eMin = null;
      if (item.start && item.end) {
        const sDate = new Date(item.start + 9 * 3600 * 1000);
        const eDate = new Date(item.end + 9 * 3600 * 1000);
        sMin = sDate.getUTCHours() * 60 + sDate.getUTCMinutes();
        eMin = eDate.getUTCHours() * 60 + eDate.getUTCMinutes();
        if (eMin === 0 && eDate > sDate) eMin = 1440;
      } else {
        const timeRange = /(\d{2}:\d{2})\s*[~-]\s*(\d{2}:\d{2})/.exec(item.btime || '');
        if (timeRange) {
          sMin = hhmmToMinutes(timeRange[1]);
          eMin = hhmmToMinutes(timeRange[2]);
          if (eMin === 0) eMin = 1440;
        }
      }
      return {
        startMinutes: sMin,
        endMinutes: eMin,
        title: item.title,
        subtitle: item.man || item.subtitle || ''
      };
    });
    return normalizeScheduleItems(raw);
  }
  return [];
}

// 11. 국악방송
async function fetchGugak() {
  const url = 'https://www.igbf.kr/gugak_web/?sub_num=786';
  const res = await fetchWithTimeout(url);
  const html = await res.text();
  const rows = [
    ...html.matchAll(
      /<tr[^>]*>[\s\S]*?<span class="t-range">(\d{2}:\d{2})\s*~\s*(\d{2}:\d{2})<\/span>([\s\S]*?)<\/tr>/g
    )
  ];
  const raw = rows.map((r) => {
    const startTime = r[1];
    const endTime = r[2];
    const names = [...r[3].matchAll(/<div class="sch-name">([\s\S]*?)<\/div>/g)].map((m) =>
      decodeHtml(m[1])
    );
    return {
      startTime,
      endTime,
      title: names[0] || '국악방송 프로그램',
      subtitle: names.slice(1).join(' / ')
    };
  });
  return normalizeScheduleItems(raw);
}

// 12. KFN 국방FM
async function fetchKfn(ymd) {
  const url = 'https://www.dema.mil.kr/web/api/v1/media/radio/fmTimeTableListAjax.do';
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ program_date: ymd })
  });
  const body = await res.json();
  const list = body?.map?.resultList || [];
  const raw = list.map((item) => {
    const st = String(item.program_time || '').padStart(4, '0');
    const et = String(item.program_end_time || '').padStart(4, '0');
    const sMin = Number(st.slice(0, 2)) * 60 + Number(st.slice(2, 4));
    let eMin = et.length === 4 ? Number(et.slice(0, 2)) * 60 + Number(et.slice(2, 4)) : null;
    if (eMin === 0) eMin = 1440;
    return {
      startMinutes: sMin,
      endMinutes: eMin,
      title: item.program_title,
      subtitle: item.program_subtitle || item.program_manger || ''
    };
  });
  return normalizeScheduleItems(raw);
}

// 13. AFN The Eagle (주한미군 FM 102.7 MHz)
async function fetchAfnEagle(dayOfWeek) {
  // AFN Korea The Eagle (Seoul/Humphreys 102.7 MHz) 표준 요일별 편성
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const raw = isWeekend
    ? [
        { startTime: '00:00', endTime: '06:00', title: 'AFN The Eagle Overnight Music', subtitle: 'Adult Hits & AP Radio News on the Hour' },
        { startTime: '06:00', endTime: '10:00', title: 'American Top 40 / Weekend Countdown', subtitle: 'Ryan Seacrest · AFN Eagle Weekend' },
        { startTime: '10:00', endTime: '14:00', title: 'AFN The Eagle Weekend Midday', subtitle: 'Humphreys / Yongsan FM 102.7 MHz' },
        { startTime: '14:00', endTime: '18:00', title: 'Rick Dees Weekly Top 40 / Country Countdown', subtitle: 'AFN Syndicated Music Feature' },
        { startTime: '18:00', endTime: '24:00', title: 'AFN The Eagle Evening & Late Night', subtitle: 'Today’s Best Hits & Hourly AP News' }
      ]
    : [
        { startTime: '00:00', endTime: '05:00', title: 'AFN The Eagle Overnight', subtitle: 'Today’s Best Variety & Hourly AP News' },
        { startTime: '05:00', endTime: '06:00', title: 'Early Riser Music Mix', subtitle: 'AFN Korea FM 102.7 MHz' },
        { startTime: '06:00', endTime: '10:00', title: 'AFN The Eagle Morning Show', subtitle: 'Local Korea Community Info, Weather & Hits' },
        { startTime: '10:00', endTime: '14:00', title: 'AFN The Eagle Midday Show', subtitle: 'Adult Contemporary & Pop Hits' },
        { startTime: '14:00', endTime: '18:00', title: 'AFN The Eagle Afternoon Drive', subtitle: 'Local Korea Updates, Traffic & Music' },
        { startTime: '18:00', endTime: '21:00', title: 'AFN The Eagle Evening Mix', subtitle: 'American Forces Network Pacific' },
        { startTime: '21:00', endTime: '24:00', title: 'AFN Nighttime Radio', subtitle: 'Classic & Contemporary Hits' }
      ];
  return normalizeScheduleItems(raw);
}

// 14. 일본 NHK 제1 (JOBK 오사카 / JOLK 후쿠오카) 및 라디오 닛케이 (RN1 / RN2) - Radiko 공식 XML API
async function fetchRadiko(stationId, ymd) {
  const url = `https://radiko.jp/v3/program/station/date/${ymd}/${stationId}.xml`;
  const res = await fetchWithTimeout(url);
  const xml = await res.text();
  const progMatches = [
    ...xml.matchAll(/<prog\b([^>]*)>([\s\S]*?)<\/prog>/g)
  ];
  const raw = progMatches.map((m) => {
    const attrs = m[1];
    const inner = m[2];
    const ftl = /ftl="(\d{4})"/.exec(attrs)?.[1] || '0000';
    const tol = /tol="(\d{4})"/.exec(attrs)?.[1] || '0000';
    const sMin = Number(ftl.slice(0, 2)) * 60 + Number(ftl.slice(2, 4));
    const eMin = Number(tol.slice(0, 2)) * 60 + Number(tol.slice(2, 4));
    const title = /<title>([\s\S]*?)<\/title>/.exec(inner)?.[1] || '';
    const pfm = decodeHtml(/<pfm>([\s\S]*?)<\/pfm>/.exec(inner)?.[1] || '');
    const desc = decodeHtml(/<desc>([\s\S]*?)<\/desc>/.exec(inner)?.[1] || '');
    return {
      startMinutes: sMin,
      endMinutes: eMin,
      title,
      subtitle: [pfm, desc].filter(Boolean).join(' · ').slice(0, 120)
    };
  });
  return normalizeScheduleItems(raw);
}

async function loadExistingData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 전체 24개 채널의 일일 편성표를 웹에서 가져와 로컬 파일(data/schedules.json)에 저장합니다.
 */
async function updateAllSchedules() {
  const startedAt = new Date();
  const dateParts = getKstDateParts(startedAt);
  const catalog = buildStationCatalog();
  const existing = await loadExistingData();
  const previousMap = new Map((existing?.channels || []).map((c) => [c.id, c]));

  let kbsCache = {};
  try {
    kbsCache = await fetchKbsAll(dateParts.ymd);
  } catch (err) {
    console.error('[Updater] KBS 일괄 수집 오류:', err.message);
  }

  const results = await Promise.all(
    catalog.map(async (channel) => {
      try {
        let programs = [];
        switch (channel.fetcherType) {
          case 'kbs':
            programs = kbsCache[channel.fetcherParam] || [];
            break;
          case 'mbc':
            programs = await fetchMbc(channel.fetcherParam, dateParts.ymd);
            break;
          case 'sbs':
            programs = await fetchSbs(channel.fetcherParam, dateParts);
            break;
          case 'ebs':
            programs = await fetchEbs(dateParts.ymd);
            break;
          case 'cbs':
            programs = await fetchCbs(channel.fetcherParam, dateParts.ymd);
            break;
          case 'tbs':
            programs = await fetchTbs();
            break;
          case 'febc':
            programs = await fetchFebc();
            break;
          case 'cpbc':
            programs = await fetchCpbc(dateParts.ymd);
            break;
          case 'bbs':
            programs = await fetchBbs(dateParts.ymdHyphen);
            break;
          case 'wbs':
            programs = await fetchWbs();
            break;
          case 'gugak':
            programs = await fetchGugak();
            break;
          case 'kfn':
            programs = await fetchKfn(dateParts.ymd);
            break;
          case 'afn':
            programs = await fetchAfnEagle(dateParts.dayOfWeek);
            break;
          case 'radiko':
            programs = await fetchRadiko(channel.fetcherParam, dateParts.ymd);
            break;
          default:
            programs = [];
        }

        if (!programs.length) {
          throw new Error('수집된 편성 항목이 0개입니다.');
        }

        return {
          ...channel,
          status: 'ok',
          updatedAt: new Date().toISOString(),
          scheduleDate: dateParts.ymdHyphen,
          programCount: programs.length,
          programs
        };
      } catch (err) {
        const prev = previousMap.get(channel.id);
        return {
          ...channel,
          status: prev?.programs?.length ? 'cached' : 'error',
          errorMessage: err.message,
          updatedAt: prev?.updatedAt || new Date().toISOString(),
          scheduleDate: prev?.scheduleDate || dateParts.ymdHyphen,
          programCount: prev?.programs?.length || 0,
          programs: prev?.programs || []
        };
      }
    })
  );

  const okCount = results.filter((r) => r.status === 'ok').length;
  const payload = {
    updatedAt: new Date().toISOString(),
    scheduleDate: dateParts.ymdHyphen,
    updateIntervalHours: 24,
    totalChannels: results.length,
    successChannels: okCount,
    channels: results
  };

  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

/**
 * 현재 KST 시각을 기준으로 각 채널의 '지금 방송 중(ON AIR)' 및 '다음 프로그램(NEXT)' 정보를 부착합니다.
 */
function enrichWithOnAirStatus(payload, now = new Date()) {
  const { ymdHyphen, hours, minutes, seconds, nowMinutes } = getKstDateParts(now);
  const currentTimeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const channels = (payload.channels || []).map((ch) => {
    const programs = ch.programs || [];
    let currentProgram = null;
    let nextProgram = null;

    for (let i = 0; i < programs.length; i++) {
      const p = programs[i];
      if (nowMinutes >= p.startMinutes && nowMinutes < p.endMinutes) {
        const total = Math.max(1, p.endMinutes - p.startMinutes);
        const elapsed = nowMinutes - p.startMinutes;
        const progressPercent = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
        currentProgram = {
          ...p,
          progressPercent,
          remainingMinutes: p.endMinutes - nowMinutes
        };
        nextProgram = programs[i + 1] || programs[0] || null;
        break;
      }
    }

    if (!currentProgram && programs.length > 0) {
      const upcomingIdx = programs.findIndex((p) => p.startMinutes > nowMinutes);
      if (upcomingIdx >= 0) {
        nextProgram = programs[upcomingIdx];
      } else {
        nextProgram = programs[0];
      }
    }

    return {
      ...ch,
      currentProgram,
      nextProgram
    };
  });

  return {
    ...payload,
    kstNow: {
      date: ymdHyphen,
      time: currentTimeStr,
      nowMinutes
    },
    channels
  };
}

module.exports = {
  DATA_FILE,
  getKstDateParts,
  loadExistingData,
  updateAllSchedules,
  enrichWithOnAirStatus
};
