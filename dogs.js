// PULSE athletic dog. Static SVG fragments only (no user-supplied markup).
const keys = new Set(['stand','walk','bike','run','sprint']);
const leg=(name,d)=>`<g class="limb ${name}"><path class="fur" d="${d}"/></g>`;
const common=(key)=>`<g class="dog ${key}"><g class="motion">
<g class="tail"><path class="fur" d="M30 40 Q18 35 15 23 Q14 19 18 20 Q22 31 35 33 L38 40Z"/></g>
${leg('rear-away','M35 49 Q31 55 33 62 L30 68 Q33 70 39 69 L43 61 L47 51Z')}
${leg('fore-away','M75 46 L79 57 L78 67 Q81 70 87 69 L87 65 L85 55 L83 46Z')}
<path class="fur torso" d="M28 39 Q33 30 50 30 Q67 29 78 34 Q84 28 88 32 L92 43 Q85 50 77 52 Q62 59 44 55 Q29 53 27 45Z"/>
<g class="neck"><path class="fur" d="M72 35 Q77 24 85 22 L96 28 L94 44 Q84 48 78 50Z"/></g>
<g class="head"><path class="fur" d="M80 25 Q83 15 94 16 Q104 16 107 24 L108 30 Q114 31 115 37 Q115 42 108 44 L97 44 Q91 47 85 41 Q80 35 80 25Z"/>
<g class="ear"><path class="fur" d="M85 19 Q76 15 78 27 Q79 35 86 36 Q91 31 90 25Z"/><path class="ear-seam" d="M85 22 Q83 27 85 32"/></g>
<path class="eye" d="M100 25 a2 2 0 1 0 0 4 a2 2 0 1 0 0 -4"/><path class="nose" d="M110 32 Q115 32 114 36 Q111 39 108 35Z"/>
<path class="mouth" d="M104 40 Q108 43 111 40"/>
${['bike','run','sprint'].includes(key)?'<path class="tongue" d="M105 42 Q107 49 110 48 Q112 47 110 42Z"/>':''}
</g>
${leg('rear-near','M36 49 Q40 49 44 53 L41 61 L40 66 Q44 68 45 69 L32 69 Q30 67 32 63Z')}
${leg('fore-near','M76 47 Q81 47 85 50 L83 60 L85 67 Q89 68 90 70 L78 70 Q75 68 76 65 L75 56Z')}
</g>${key==='sprint'?'<g class="speed"><path d="M9 31 H22 M7 41 H19 M10 51 H23"/></g>':''}</g><path class="ground" d="M8 74 H112"/>`;
const scenes=Object.fromEntries([...keys].map(k=>[k,common(k)]));
const transitions=new WeakMap();
export function renderDog(svgEl,key){
 if(!svgEl)return;
 const next=keys.has(key)?key:'';
 const active=transitions.get(svgEl);
 if(active?.key===next||(!active&&svgEl.dataset.dogKey===next))return;
 if(active)clearTimeout(active.timer);
 svgEl.classList.remove('dog-switch');
 const update=()=>{svgEl.innerHTML=scenes[next]||'';svgEl.dataset.dogKey=next;svgEl.classList.remove('dog-switch');transitions.delete(svgEl)};
 if(!svgEl.innerHTML){update();return}
 svgEl.classList.add('dog-switch');
 const timer=setTimeout(update,90);
 transitions.set(svgEl,{key:next,timer});
}
