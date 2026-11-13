const BANDS={AM:{min:531,max:1701,step:1,unit:'kHz',digits:0,initial:666,near:20,wide:100},SW:{min:2.3,max:26.1,step:.001,unit:'MHz',digits:3,initial:6.055,near:.1,wide:1},FM:{min:76,max:108,step:.1,unit:'MHz',digits:1,initial:89.1,near:.5,wide:2}};
const entries=Object.entries(RADIO_DATA).flatMap(([scope,data])=>data.sites.flatMap(site=>site.channels.map(([name,frequency])=>({scope,site,name,frequency,value:parseFloat(frequency)}))));
const get=id=>document.getElementById(id);
let band='AM';const saved={};
const display=(value,config)=>value.toFixed(config.digits)+' '+config.unit;
function render(){
 const config=BANDS[band],value=get('frequency').valueAsNumber;
 const valid=Number.isFinite(value)&&value>=config.min&&value<=config.max;
 get('frequency').setAttribute('aria-invalid',String(!valid));
 get('input-error').textContent=valid?'':`${config.min} ~ ${config.max} ${config.unit} 범위의 숫자를 입력하세요.`;
 get('results').replaceChildren();
 if(!valid){get('summary').textContent='주파수를 확인하세요.';return;}
 saved[band]=value;get('dial').value=value;get('readout').textContent=display(value,config);
 const width=get('window').value,limit=width==='all'?Infinity:config[width];
 const results=entries.filter(e=>e.site.band===band&&(get('scope').value==='all'||e.scope===get('scope').value)).map(e=>({...e,delta:e.value-value})).filter(e=>Math.abs(e.delta)<=limit+1e-8).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta)||a.value-b.value);
 get('summary').textContent=`${display(value,config)} · ${width==='all'?'대역 전체':'± '+display(limit,config)} · ${results.length}개 방송 · 주파수 차이순`;
 if(!results.length){const p=document.createElement('p');p.className='note';p.textContent='이 범위에 등록된 방송이 없습니다. 검색 폭을 넓히거나 대역 전체를 선택하세요.';get('results').append(p);return;}
 for(const entry of results){
  const card=document.createElement('article');card.className='frequency-card';
  const title=document.createElement('h3');title.textContent=entry.name;
  const frequency=document.createElement('strong');frequency.textContent=entry.frequency;
  const difference=document.createElement('span');difference.className='frequency-difference';
  difference.textContent=Math.abs(entry.delta)<1e-8?'주파수 일치':`${entry.delta>0?'+':'−'}${display(Math.abs(entry.delta),config)}`;
  const detail=document.createElement('p');detail.textContent=`${entry.scope==='domestic'?'국내':'해외'} · ${entry.site.name} · ${entry.site.region}`;
  const link=document.createElement('a');link.href=entry.scope==='domestic'?'index.html':'overseas.html';link.textContent='송신소 지도와 목록 보기';
  card.append(title,frequency,difference,detail,link);get('results').append(card);
 }
}
function setBand(value){
 band=value;const config=BANDS[band];
 for(const id of ['frequency','dial']){const input=get(id);input.min=config.min;input.max=config.max;input.step=config.step;input.value=saved[band]??config.initial;}
 get('unit').textContent=config.unit;
 get('minimum').textContent=display(config.min,config);get('maximum').textContent=display(config.max,config);
 get('frequency-help').textContent=`입력 범위 ${config.min} ~ ${config.max} ${config.unit} · 슬라이더 간격 ${config.step} ${config.unit}`;
 render();
}
get('bands').addEventListener('change',event=>setBand(event.target.value));
get('frequency').addEventListener('input',render);
get('dial').addEventListener('input',()=>{get('frequency').value=get('dial').value;render();});
for(const id of ['scope','window'])get(id).addEventListener('change',render);
setBand(band);
