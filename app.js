const HOME=[127.1188,37.3827];
const page=document.body.dataset.page;
const dataset=RADIO_DATA[page];
const km=c=>d3.geoDistance(HOME,c)*6371.0088;
const format=c=>page==='domestic'?km(c).toFixed(1):Math.round(km(c)).toLocaleString();
const svg=d3.select('#map').attr('viewBox','0 0 1100 800');
const projection=page==='domestic'?d3.geoMercator().center([126.98,37.4]).scale(63000).translate([710,415]):d3.geoMercator().center([136,39]).scale(2300).translate([550,390]);
const path=d3.geoPath(projection);
const clip=svg.append('defs').append('clipPath').attr('id','map-clip');clip.append('rect').attr('width',1100).attr('height',800);
const geoLayer=svg.append('g').attr('clip-path','url(#map-clip)');
geoLayer.selectAll('path').data(MAP_DATA.features).join('path').attr('d',path).attr('class','land');
if(page==='domestic')geoLayer.selectAll('path.district').data(DISTRICTS.features).join('path').attr('d',path).attr('class',d=>d.properties.name==='성남시분당구'?'district bundang':'district');
const label=(c,name,dx=0,dy=0,cls='place')=>{const p=projection(c);return svg.append('text').attr('x',p[0]+dx).attr('y',p[1]+dy).attr('class',cls).text(name)};
(page==='domestic'?[['서울',[127.03,37.62]],['시흥',[126.76,37.36]],['안양',[126.92,37.38]],['수원',[127.01,37.27]],['성남',[127.2,37.46]]]:[['대한민국',[127.5,35.5]],['일본',[137,37]],['홋카이도',[142,44.5]],['동해',[132,40]]]).forEach(([n,c])=>label(c,n));
const tip=document.getElementById('map-tooltip');
for(const site of dataset.sites){
 const p=projection(site.coord),h=projection(HOME);
 svg.append('path').datum({type:'LineString',coordinates:[HOME,site.coord]}).attr('d',path).attr('class','route '+site.band);
 const mid=projection(d3.geoInterpolate(HOME,site.coord)(.5));
 const text=svg.append('text').attr('x',mid[0]).attr('y',mid[1]).attr('text-anchor','middle').attr('class','distance').text(`${format(site.coord)} km`);
 const angle=Math.atan2(p[1]-h[1],p[0]-h[0])*180/Math.PI;
 text.attr('transform',`rotate(${angle>90||angle< -90?angle+180:angle},${mid[0]},${mid[1]})`).attr('dy',-5);
 const group=svg.append('g').attr('class','station '+site.band).attr('tabindex',0).attr('role','img').attr('aria-label',`${site.name}, ${site.channels.map(c=>c[0]+' '+c[1]).join(', ')}, 북위 ${site.coord[1]}, 동경 ${site.coord[0]}`);
 group.append('title').text(`${site.name}\n북위 ${site.coord[1].toFixed(5)}° · 동경 ${site.coord[0].toFixed(5)}°`);
 group.append('circle').attr('cx',p[0]).attr('cy',p[1]).attr('r',7);
 group.append('circle').attr('cx',p[0]).attr('cy',p[1]).attr('r',20).attr('fill','transparent').attr('stroke','none');
 const [x,y]=site.label,width=site.width||280,height=site.channels.length*19+43;
 group.append('path').attr('class','leader').attr('d',`M${p[0]},${p[1]}L${Math.max(x,Math.min(x+width,p[0]))},${Math.max(y,Math.min(y+height,p[1]))}`);
 group.append('rect').attr('x',x).attr('y',y).attr('width',width).attr('height',height).attr('class','station-label');
 group.append('text').attr('x',x+12).attr('y',y+22).attr('class','station-name').text(site.name);
 site.channels.forEach((c,i)=>group.append('text').attr('x',x+12).attr('y',y+44+i*19).attr('class','channel').text(`${c[0]} · ${c[1]}`));
 const show=()=>{tip.textContent=`${site.name} · 북위 ${site.coord[1].toFixed(5)}° / 동경 ${site.coord[0].toFixed(5)}°`;};
 group.on('mouseenter',show).on('focus',show).on('click',show).on('mouseleave',()=>{tip.textContent='송신소에 마우스를 올리거나 선택하면 위경도가 표시됩니다.';});
}
const hp=projection(HOME);svg.append('circle').attr('cx',hp[0]).attr('cy',hp[1]).attr('r',8).attr('class','home');label(HOME,'성남시 분당구',12,25,'home-label');
const body=document.getElementById('station-rows');
for(const site of dataset.sites){
 const tr=document.createElement('tr');
 const heading=document.createElement('th');heading.scope='row';heading.textContent=site.name;tr.appendChild(heading);
 const channels=document.createElement('td'),list=document.createElement('ul');list.className='channel-list';
 for(const [name,frequency] of site.channels){
  const item=document.createElement('li'),freq=document.createElement('span');
  freq.className='channel-frequency';freq.textContent=frequency;
  item.append(document.createTextNode(name+' · '),freq);list.appendChild(item);
 }
 channels.appendChild(list);tr.appendChild(channels);
 for(const value of [site.region,`${site.coord[1].toFixed(5)}, ${site.coord[0].toFixed(5)}`,`${format(site.coord)} km`]){
  const td=document.createElement('td');td.textContent=value;tr.appendChild(td);
 }
 body.appendChild(tr);
}
const channelCount=dataset.sites.reduce((total,site)=>total+site.channels.length,0);
document.getElementById('count').textContent=`${channelCount}개 방송 · ${dataset.sites.length}개 송신소`;
document.getElementById('sources').innerHTML=dataset.sources.map(([name,url])=>`<li><a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a></li>`).join('');
