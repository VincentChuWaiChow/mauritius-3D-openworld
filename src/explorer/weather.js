import {Vector3} from 'three';
import {project} from './geo.js';

export const sites = [
  ['Grand Baie',57.58,-20.01], ['Port Louis',57.50,-20.16],
  ['Flic en Flac',57.36,-20.28], ['Curepipe',57.52,-20.32],
  ['Belle Mare',57.78,-20.19], ['Mahébourg',57.70,-20.41],
  ['Le Morne',57.33,-20.45]
].map(([name,lon,lat]) => ({name,lon,lat,...project([lon,lat])}));

const period = 15 * 60_000;
const maxAge = 60 * 60_000;
const fields = ['temperature_2m','precipitation','cloud_cover','wind_speed_10m','wind_direction_10m'];
export function weatherURL() {
  const query = new URLSearchParams({
    latitude:sites.map(s=>s.lat).join(','), longitude:sites.map(s=>s.lon).join(','),
    current:fields.join(','), timeformat:'unixtime', wind_speed_unit:'kmh'
  });
  return 'https://api.open-meteo.com/v1/forecast?' + query;
}
export function validateWeather(rows,now) {
  if (!Array.isArray(rows) || rows.length !== sites.length) throw Error('Incomplete regional weather response');
  return rows.flatMap((row,i) => {
    const c = row?.current;
    if (!c || ![...fields,'time','interval'].every(k=>Number.isFinite(c[k]))) return [];
    const age = now - c.time*1000;
    if (age > maxAge || age < -5*60_000 || c.interval<=0 || c.precipitation<0 ||
        c.cloud_cover<0 || c.cloud_cover>100 || c.wind_speed_10m<0 ||
        c.wind_direction_10m<0 || c.wind_direction_10m>360) return [];
    return [{...sites[i],...c}];
  });
}

const clock = new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',hour:'2-digit',minute:'2-digit'});
const frac = n=>n-Math.floor(n);
const noise = n=>frac(Math.sin(n*91.7+23)*43871);
export function mountWeather({toggle,status,canvas}) {
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let samples=[],nextRead=0,pending=null,lastDraw=-Infinity,clockSeconds=0,message='';
  const position = new Vector3();
  function report(value) { if(status.textContent!==value)status.textContent=value; }
  function clear() { if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height); }
  toggle.onchange = () => {
    canvas.hidden=!toggle.checked;
    if(!toggle.checked){if(pending){pending.abort();nextRead=0;}pending=null;clear();report('');}
    lastDraw=-Infinity;
  };
  async function refresh(now) {
    const request = new AbortController();
    pending=request;nextRead=now+period;message='Updating regional weather…';
    const timer=setTimeout(()=>request.abort(),10_000);
    try {
      const response=await fetch(weatherURL(),{signal:request.signal});
      if(!response.ok)throw Error('HTTP '+response.status);
      const values=validateWeather(await response.json(),Date.now());
      if(pending!==request)return;
      samples=values;message=values.length?'':'No recent model data.';
    } catch {
      if(pending===request)message='Weather refresh unavailable.';
    } finally {
      clearTimeout(timer);
      if(pending===request)pending=null;
    }
  }
  return function draw({time,camera,target,wide,ground}) {
    if(!toggle.checked || document.hidden || time-lastDraw<80)return;
    if(!reduced.matches)clockSeconds+=Math.min(.15,(time-lastDraw)/1000);
    lastDraw=time;
    const now=Date.now();
    if(!pending && now>=nextRead)void refresh(now);
    samples=samples.filter(s=>now-s.time*1000<=maxAge);
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(canvas.width!==width || canvas.height!==height){canvas.width=width;canvas.height=height;}
    clear();
    if(!samples.length){report(message || 'No recent model data.');return;}
    const closest = samples.reduce((a,b)=>Math.hypot(a.x-target.x,a.z-target.z)<Math.hypot(b.x-target.x,b.z-target.z)?a:b);
    const age=Math.max(0,Math.floor((now-closest.time*1000)/60_000));
    report([message,closest.name+' model · '+closest.temperature_2m+' °C · '+closest.cloud_cover+'% cloud · '+closest.precipitation+' mm / '+Math.round(closest.interval/60)+' min · wind '+closest.wind_speed_10m+' km/h · '+clock.format(closest.time*1000)+' MUT ('+age+' min ago)'].filter(Boolean).join(' '));
    if(!ctx)return;
    const regions=wide?samples:[closest];
    for(const sample of regions){
      let x=width/2,y=height/2;
      if(wide){
        position.set(sample.x,ground(sample)+2,sample.z).project(camera);
        if(Math.abs(position.x)>1.15 || Math.abs(position.y)>1.15 || Math.abs(position.z)>1)continue;
        x=(position.x+1)*width/2;y=(1-position.y)*height/2;
      }
      const radius=wide?Math.max(18,Math.min(width,height)*.065):Math.max(width,height)*.75;
      const angle=sample.wind_direction_10m*Math.PI/180;
      // Wind bearings describe where air comes from. World X points east and Z south.
      const dx=-Math.sin(angle),dz=Math.cos(angle);
      const right=camera.matrixWorld.elements;
      const windX=dx*right[0]+dz*right[2],windY=-(dx*right[4]+dz*right[6]);
      const drift=clockSeconds*sample.wind_speed_10m*.0005;
      ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
      for(let i=0;i<8 && sample.cloud_cover>0;i++){
        const cx=x+(frac(noise(i)+drift*windX)-.5)*radius*1.8;
        const cy=y+(frac(noise(i+8)+drift*windY)-.5)*radius;
        const size=radius*.60;
        const gradient=ctx.createRadialGradient(cx,cy,0,cx,cy,size);
        gradient.addColorStop(0,'rgba(135,151,164,'+(sample.cloud_cover/100*(wide?.62:.23))+')');
        gradient.addColorStop(1,'rgba(135,151,164,0)');
        ctx.fillStyle=gradient;ctx.fillRect(cx-size,cy-size,2*size,2*size);
      }
      const rate=sample.precipitation*3600/sample.interval;
      const count=Math.min(wide?28:180,Math.ceil(rate*(wide?7:35)));
      ctx.strokeStyle='rgba(76,151,196,0.8)';ctx.beginPath();
      for(let i=0;i<count;i++){
        const px=x+(frac(noise(i+22)+drift*windX)-.5)*radius*2;
        const py=y+(frac(noise(i+47)+clockSeconds*.7)-.5)*radius*2;
        ctx.moveTo(px,py);ctx.lineTo(px+windX*Math.min(sample.wind_speed_10m*.12,9),py+(wide?4:10));
      }
      ctx.stroke();ctx.restore();
    }
  };
}
