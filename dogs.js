// PULSE canine gait illustrations. (PULSE側で修正: アニメーションする部品と位置指定のgを分離、舌の座標を頭基準に) Coordinates/angles are intentionally fixed, not user-supplied.
const NS='http://www.w3.org/2000/svg';
const keys=['stand','walk','bike','run','sprint'];
const config={stand:{period:1.6,travel:0},walk:{period:1.2,travel:1},bike:{period:.7,travel:2},run:{period:.45,travel:3},sprint:{period:.35,travel:4}};
const path=(d,cls='dog-white')=>`<path class="${cls}" d="${d}"/>`;
// Self-contained vector artwork, with articulated limb pieces pivoting at anatomical joints.
const dogMarkup=(key)=>{
 const q=config[key];
 const speed=key==='sprint'?'dog-sprint':key==='run'?'dog-run':key==='bike'?'dog-trot':key==='walk'?'dog-walk':'dog-stand';
 const lines=key==='sprint'?`<g class="dog-speed">${path('M6 35 H23 M5 44 H18 M9 53 H25','dog-speed-stroke')}</g>`:'';
 const tongue=(key==='bike'||key==='run'||key==='sprint')?path('M18 5 Q23 6 22 11 Q20 14 17 11 Q16 8 17 6 Z','dog-tongue'):'';
 const leg=(name,x,y,front,far=false)=>{
  const upper=front? 'M-4 -2 Q0 -5 4 -1 L5 13 Q2 17 -2 15 Z':'M-5 -3 Q2 -6 7 -1 L5 14 Q1 17 -3 14 Z';
  const lower=front?'M-2 -2 Q2 -4 4 -1 L4 11 Q6 14 10 14 L10 17 L-1 17 Z':'M-2 -2 Q2 -4 4 0 L3 11 Q5 14 10 14 L10 17 L-1 17 Z';
  return `<g class="dog-leg ${front?'front':'hind'} ${far?'far':'near'} ${name}" transform="translate(${x} ${y})"><g class="dog-upper">${path(upper)}<g transform="translate(2 13)"><g class="dog-lower">${path(lower)}</g></g></g></g>`;
 };
 return `<g class="dog-gait ${speed}" data-gait="${key}" transform="translate(0 -3)">${lines}<g class="dog-core">
 <g transform="translate(31 38)"><g class="dog-tail">${path('M3 3 Q-7 4 -12 -5 Q-16 -12 -11 -17 Q-11 -8 -4 -7 Q3 -5 7 0 Z')}</g></g>
 ${leg('back-left',42,50,false,true)}${leg('front-left',81,48,true,true)}
 <g class="dog-torso">${path('M32 37 C39 29 52 31 64 32 C72 32 78 29 83 28 C87 32 90 38 91 45 C87 49 82 51 77 49 C66 45 58 48 49 48 C40 49 34 45 29 43 Z')}
 ${path('M73 34 Q79 25 82 22 L88 20 Q90 26 85 32 L84 41 Z')}
 </g>
 ${leg('back-right',42,49,false)}${leg('front-right',81,47,true)}
 <g class="dog-neck" transform="translate(82 31)">${path('M-4 11 Q-2 0 7 -6 L11 0 L8 14 Z')}
 <g transform="translate(6 -8)"><g class="dog-head">${path('M-5 -3 Q-2 -11 8 -12 Q16 -10 18 -4 L26 -1 Q29 1 28 5 Q23 9 17 6 L12 8 Q6 10 0 5 Z')}
 ${path('M17 2 Q22 2 24 4','dog-mouth')}${path('M24 -1 Q27 -1 28 2 L24 3 Z','dog-nose')}${path('M12 -5 Q15 -7 17 -5 Q15 -2 13 -3 Z','dog-eye')}
 <g transform="translate(3 -8)"><g class="dog-ear">${path('M-3 0 Q-9 1 -11 10 Q-12 15 -7 16 Q-1 11 2 2 Z')}${path('M-3 1 Q-6 6 -6 12','dog-ear-line')}</g></g>${tongue}</g></g></g>
 </g>${path('M8 80 H112','dog-ground')}</g>`;
};
const cache=Object.fromEntries(keys.map(k=>[k,dogMarkup(k)]));
const current=new WeakMap();
export function renderDog(svgEl,key){
 if(!(svgEl instanceof SVGElement))return;
 if(key!==''&&!keys.includes(key))key='';
 const prev=current.get(svgEl);
 if(prev?.key===key)return;
 if(prev?.timer)clearTimeout(prev.timer);
 current.set(svgEl,{key,timer:null});
 svgEl.classList.add('dog-svg');
 // Fade out old artwork, then mount fresh artwork and fade in. Existing same-key DOM is never touched.
 svgEl.classList.add('dog-fade-out');
 const mount=()=>{
  if(current.get(svgEl)?.key!==key)return;
  svgEl.innerHTML=key?cache[key]:'';
  svgEl.setAttribute('viewBox','0 0 120 80');
  svgEl.classList.remove('dog-fade-out');
 };
 if(!prev){mount();return;}
 const timer=setTimeout(mount,90);
 current.set(svgEl,{key,timer});
}
