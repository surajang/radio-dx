const { updateAllSchedules, enrichWithOnAirStatus } = require('./src/fetcher');

async function main() {
  console.log('[Radio DX Updater] 국내·해외 24개 채널(27개 주파수) 편성표 수집을 시작합니다...');
  const start = Date.now();
  const payload = await updateAllSchedules();
  const enriched = enrichWithOnAirStatus(payload);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(
    `[Radio DX Updater] 완료 (${elapsed}초) · 기준일: ${enriched.scheduleDate} · 성공: ${enriched.successChannels}/${enriched.totalChannels} 채널`
  );
  console.log('--------------------------------------------------------------------------------');
  for (const ch of enriched.channels) {
    const freqs = ch.transmissions.map((t) => `${t.frequency}(${t.siteName})`).join(', ');
    const onAir = ch.currentProgram
      ? `${ch.currentProgram.startTime}~${ch.currentProgram.endTime} ${ch.currentProgram.title}`
      : '현재 편성 없음';
    console.log(
      `[${ch.status.toUpperCase().padEnd(6)}] ${ch.name.padEnd(18)} | ${String(ch.programCount).padStart(2)}개 프로그램 | ON AIR: ${onAir} | ${freqs}`
    );
  }
}

main().catch((err) => {
  console.error('[Radio DX Updater] 치명적 오류:', err);
  process.exit(1);
});
