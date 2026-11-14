const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HOME_COORD = [127.1188, 37.3827]; // 성남시 분당구청 부근 [경도, 위도]
const EARTH_RADIUS_KM = 6371.0088;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function calcDistanceKm([lon1, lat1], [lon2, lat2]) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function loadRootStationsJs() {
  const stationsPath = path.resolve(__dirname, '../../page/stations.js');
  const code = fs.readFileSync(stationsPath, 'utf8');
  const sandbox = {};
  vm.runInNewContext(`${code}\nthis.RADIO_DATA = RADIO_DATA;`, sandbox);
  return sandbox.RADIO_DATA;
}

/**
 * stations.js의 방송국 이름과 주파수를 고유 채널 ID로 매핑합니다.
 * 국내 20개 고유 채널(22개 주파수) + 해외 4개 고유 채널(5개 주파수) = 총 24개 고유 채널 (27개 송신 주파수)
 */
const CHANNEL_DEFS = [
  // === 국내 방송 (20개 고유 채널, 22개 주파수) ===
  {
    id: 'kbs-1radio',
    name: 'KBS 제1라디오',
    broadcaster: 'KBS',
    scope: 'domestic',
    category: '뉴스·시사·교양',
    matchNames: ['KBS 제1라디오'],
    sourceName: 'KBS 공식 편성표 API',
    sourceUrl: 'https://schedule.kbs.co.kr/',
    fetcherType: 'kbs',
    fetcherParam: '21'
  },
  {
    id: 'kbs-happyfm',
    name: 'KBS HappyFM',
    broadcaster: 'KBS',
    scope: 'domestic',
    category: '대중음악·오락 (제2라디오)',
    matchNames: ['KBS HappyFM'],
    sourceName: 'KBS 공식 편성표 API',
    sourceUrl: 'https://schedule.kbs.co.kr/',
    fetcherType: 'kbs',
    fetcherParam: '22'
  },
  {
    id: 'kbs-3radio',
    name: 'KBS 제3라디오',
    broadcaster: 'KBS',
    scope: 'domestic',
    category: '사랑의 소리방송',
    matchNames: ['KBS 제3라디오'],
    sourceName: 'KBS 공식 편성표 API',
    sourceUrl: 'https://schedule.kbs.co.kr/',
    fetcherType: 'kbs',
    fetcherParam: '23'
  },
  {
    id: 'kbs-classicfm',
    name: 'KBS ClassicFM',
    broadcaster: 'KBS',
    scope: 'domestic',
    category: '클래식·전통음악 (제1FM)',
    matchNames: ['KBS ClassicFM'],
    sourceName: 'KBS 공식 편성표 API',
    sourceUrl: 'https://schedule.kbs.co.kr/',
    fetcherType: 'kbs',
    fetcherParam: '24'
  },
  {
    id: 'kbs-coolfm',
    name: 'KBS CoolFM',
    broadcaster: 'KBS',
    scope: 'domestic',
    category: '대중음악·예능 (제2FM)',
    matchNames: ['KBS CoolFM'],
    sourceName: 'KBS 공식 편성표 API',
    sourceUrl: 'https://schedule.kbs.co.kr/',
    fetcherType: 'kbs',
    fetcherParam: '25'
  },
  {
    id: 'mbc-sfm',
    name: 'MBC 표준FM',
    broadcaster: 'MBC',
    scope: 'domestic',
    category: '뉴스·시사·종합',
    matchNames: ['MBC 표준FM'],
    sourceName: 'MBC 공식 라디오 편성표 API',
    sourceUrl: 'https://schedule.imbc.com/Schedule/Radio?type=FM',
    fetcherType: 'mbc',
    fetcherParam: 'FM'
  },
  {
    id: 'mbc-fm4u',
    name: 'MBC FM4U',
    broadcaster: 'MBC',
    scope: 'domestic',
    category: '대중음악·예능',
    matchNames: ['MBC FM4U'],
    sourceName: 'MBC 공식 라디오 편성표 API',
    sourceUrl: 'https://schedule.imbc.com/Schedule/Radio?type=FM4U',
    fetcherType: 'mbc',
    fetcherParam: 'FM4U'
  },
  {
    id: 'sbs-lovefm',
    name: 'SBS 러브FM',
    broadcaster: 'SBS',
    scope: 'domestic',
    category: '시사·종합·음악',
    matchNames: ['SBS 러브FM'],
    sourceName: 'SBS 공식 라디오 편성표 API',
    sourceUrl: 'https://www.sbs.co.kr/schedule/index.html?type=ra&channel=Love',
    fetcherType: 'sbs',
    fetcherParam: 'Love'
  },
  {
    id: 'sbs-powerfm',
    name: 'SBS 파워FM',
    broadcaster: 'SBS',
    scope: 'domestic',
    category: '대중음악·예능',
    matchNames: ['SBS 파워FM'],
    sourceName: 'SBS 공식 라디오 편성표 API',
    sourceUrl: 'https://www.sbs.co.kr/schedule/index.html?type=ra&channel=Power',
    fetcherType: 'sbs',
    fetcherParam: 'Power'
  },
  {
    id: 'ebs-fm',
    name: 'EBS FM',
    broadcaster: 'EBS',
    scope: 'domestic',
    category: '교육·어학·교양·음악',
    matchNames: ['EBS FM'],
    sourceName: 'EBS 공식 라디오 편성표',
    sourceUrl: 'https://www.ebs.co.kr/schedule?channelCd=RADIO',
    fetcherType: 'ebs',
    fetcherParam: 'RADIO'
  },
  {
    id: 'cbs-sfm',
    name: 'CBS 표준FM',
    broadcaster: 'CBS',
    scope: 'domestic',
    category: '시사·교양·기독교',
    matchNames: ['CBS 표준FM'],
    sourceName: 'CBS 표준FM 공식 편성표',
    sourceUrl: 'https://www.cbs.co.kr/schedule?type=fm',
    fetcherType: 'cbs',
    fetcherParam: 'fm'
  },
  {
    id: 'cbs-musicfm',
    name: 'CBS 음악FM',
    broadcaster: 'CBS',
    scope: 'domestic',
    category: '팝·가요·클래식 음악',
    matchNames: ['CBS 음악FM'],
    sourceName: 'CBS 음악FM 공식 편성표',
    sourceUrl: 'https://www.cbs.co.kr/schedule?type=musicFm',
    fetcherType: 'cbs',
    fetcherParam: 'musicFm'
  },
  {
    id: 'tbs-fm',
    name: 'TBS FM',
    broadcaster: 'TBS',
    scope: 'domestic',
    category: '수도권 교통·생활·음악',
    matchNames: ['TBS FM'],
    sourceName: 'TBS FM 공식 편성표',
    sourceUrl: 'http://tbs.seoul.kr/fm/schedule.do',
    fetcherType: 'tbs',
    fetcherParam: 'FM'
  },
  {
    id: 'febc-fm',
    name: 'FEBC 극동방송',
    broadcaster: 'FEBC',
    scope: 'domestic',
    category: '기독교 복음·찬양',
    matchNames: ['FEBC 극동방송'],
    sourceName: '서울극동방송 공식 편성표',
    sourceUrl: 'https://seoul.febc.net/radio/schedule',
    fetcherType: 'febc',
    fetcherParam: 'seoul'
  },
  {
    id: 'cpbc-fm',
    name: 'CPBC 평화방송',
    broadcaster: 'CPBC',
    scope: 'domestic',
    category: '가톨릭·시사·음악',
    matchNames: ['CPBC 평화방송'],
    sourceName: 'CPBC 가톨릭평화방송 공식 API',
    sourceUrl: 'https://www.cpbc.co.kr/schedule.html?channel=radio',
    fetcherType: 'cpbc',
    fetcherParam: '01'
  },
  {
    id: 'bbs-fm',
    name: 'BBS 불교방송',
    broadcaster: 'BBS',
    scope: 'domestic',
    category: '불교·교양·음악',
    matchNames: ['BBS 불교방송'],
    sourceName: 'BBS 불교방송 공식 편성표',
    sourceUrl: 'https://www.bbs.or.kr/HOME2/?ACT=SCHEDULE&SchGubun=RADIO',
    fetcherType: 'bbs',
    fetcherParam: 'RADIO'
  },
  {
    id: 'wbs-fm',
    name: 'WBS 원음방송',
    broadcaster: 'WBS',
    scope: 'domestic',
    category: '원불교·교양·음악',
    matchNames: ['WBS 원음방송'],
    sourceName: 'WBS 원음방송 공식 편성표',
    sourceUrl: 'https://wbsi.kr/schedule_radio.php',
    fetcherType: 'wbs',
    fetcherParam: 'radio'
  },
  {
    id: 'gugak-fm',
    name: '국악방송',
    broadcaster: '국악방송',
    scope: 'domestic',
    category: '전통음악·국악·문화',
    matchNames: ['국악방송'],
    sourceName: '국악방송 공식 라디오 편성표',
    sourceUrl: 'https://www.igbf.kr/gugak_web/?sub_num=786',
    fetcherType: 'gugak',
    fetcherParam: '786'
  },
  {
    id: 'kfn-fm',
    name: 'KFN 라디오',
    broadcaster: '국방홍보원',
    scope: 'domestic',
    category: '국방·안보·음악 (국방FM)',
    matchNames: ['KFN 라디오'],
    sourceName: '국방FM 공식 편성표 API',
    sourceUrl: 'https://www.dema.mil.kr/web/radio/timetable.do',
    fetcherType: 'kfn',
    fetcherParam: 'R'
  },
  {
    id: 'afn-eagle',
    name: 'AFN The Eagle',
    broadcaster: 'AFN Korea',
    scope: 'domestic',
    category: '주한미군 영어 방송 (FM)',
    matchNames: ['AFN The Eagle'],
    sourceName: 'AFN Pacific / Humphreys The Eagle 편성',
    sourceUrl: 'https://www.afnpacific.net/',
    fetcherType: 'afn',
    fetcherParam: 'eagle'
  },

  // === 해외 방송 (4개 고유 채널, 5개 주파수) ===
  {
    id: 'nikkei-1',
    name: '라디오 닛케이 제1',
    broadcaster: 'Radio NIKKEI',
    scope: 'overseas',
    category: '일본 경제·시황·경마·문화 (단파)',
    matchNames: ['닛케이 제1'],
    sourceName: '라디오 닛케이 / Radiko 공식 XML 편성표 (RN1)',
    sourceUrl: 'https://www.radionikkei.jp/timetable/',
    fetcherType: 'radiko',
    fetcherParam: 'RN1'
  },
  {
    id: 'nikkei-2',
    name: '라디오 닛케이 제2',
    broadcaster: 'Radio NIKKEI',
    scope: 'overseas',
    category: '일본 음악(RaNi Music)·경마 (단파)',
    matchNames: ['닛케이 제2'],
    sourceName: '라디오 닛케이 / Radiko 공식 XML 편성표 (RN2)',
    sourceUrl: 'https://www.radionikkei.jp/timetable/',
    fetcherType: 'radiko',
    fetcherParam: 'RN2'
  },
  {
    id: 'nhk-osaka-r1',
    name: 'NHK 제1 JOBK (오사카)',
    broadcaster: 'NHK',
    scope: 'overseas',
    category: '일본 NHK 라디오 제1방송 · 간사이 광역 (중파)',
    matchNames: ['NHK 제1 JOBK'],
    sourceName: 'NHK 라디오 / Radiko 공식 XML 편성표 (JOBK)',
    sourceUrl: 'https://www.nhk.or.jp/radio/',
    fetcherType: 'radiko',
    fetcherParam: 'JOBK'
  },
  {
    id: 'nhk-fukuoka-r1',
    name: 'NHK 제1 JOLK (후쿠오카)',
    broadcaster: 'NHK',
    scope: 'overseas',
    category: '일본 NHK 라디오 제1방송 · 규슈 광역 (중파)',
    matchNames: ['NHK 제1 JOLK'],
    sourceName: 'NHK 라디오 / Radiko 공식 XML 편성표 (JOLK)',
    sourceUrl: 'https://www.nhk.or.jp/radio/',
    fetcherType: 'radiko',
    fetcherParam: 'JOLK'
  }
];

function buildStationCatalog() {
  const radioData = loadRootStationsJs();

  // stations.js의 송신소·주파수 매핑
  const allTransmissions = [];
  for (const scope of ['domestic', 'overseas']) {
    const group = radioData[scope];
    if (!group || !Array.isArray(group.sites)) continue;
    for (const site of group.sites) {
      const distKm = calcDistanceKm(HOME_COORD, site.coord);
      const formattedDist =
        scope === 'domestic' ? Number(distKm.toFixed(1)) : Math.round(distKm);
      for (const [chName, freqStr] of site.channels) {
        allTransmissions.push({
          scope,
          channelName: chName,
          frequency: freqStr,
          freqValue: parseFloat(freqStr),
          band: site.band,
          siteName: site.name,
          region: site.region,
          coord: site.coord,
          distanceKm: formattedDist
        });
      }
    }
  }

  return CHANNEL_DEFS.map((def) => {
    const transmissions = allTransmissions.filter((t) =>
      def.matchNames.includes(t.channelName) && t.scope === def.scope
    );
    const bands = [...new Set(transmissions.map((t) => t.band))];
    const primaryBand = bands[0] || 'FM';
    return {
      ...def,
      primaryBand,
      bands,
      transmissions
    };
  });
}

module.exports = {
  HOME_COORD,
  CHANNEL_DEFS,
  buildStationCatalog
};
