// PULSE puppy silhouettes. All SVG markup is trusted and static.
const keys = new Set(['stand', 'walk', 'bike', 'run', 'sprint']);
const ground = '<path d="M8 74 H112" class="ground"/>';
const leg = (name, x, y) => `<g class="leg ${name}"><rect class="dog-fill" x="${x}" y="${y}" width="11" height="21" rx="5.5"/></g>`;
const puppy = (key) => `
  <g class="puppy ${key}">
    <g class="dog-bounce">
      <g class="tail"><path class="dog-fill" d="M34 43 Q19 40 21 26 Q27 33 34 30 Q39 35 38 42Z"/></g>
      ${leg('back-far', 34, 50)}
      ${leg('front-far', 73, 50)}
      <ellipse class="dog-fill body" cx="58" cy="46" rx="31" ry="20"/>
      <g class="head">
        <circle class="dog-fill" cx="85" cy="30" r="21"/>
        <g class="ear"><path class="dog-fill" d="M73 19 Q63 15 64 31 Q65 44 74 39 Q79 32 77 23Z"/><path class="ear-line" d="M74 21 Q69 28 72 35"/></g>
        <ellipse class="dog-fill" cx="99" cy="37" rx="12" ry="10"/>
        <circle class="dog-eye" cx="91" cy="27" r="2.5"/>
        <ellipse class="dog-eye" cx="108" cy="34" rx="3" ry="2.3"/>
        ${key === 'bike' || key === 'run' || key === 'sprint' ? '<path class="dog-tongue" d="M100 44 Q104 53 108 44Z"/>' : ''}
      </g>
      ${leg('back-near', 44, 51)}
      ${leg('front-near', 82, 49)}
    </g>
    ${key === 'sprint' ? '<g class="speed-lines"><path d="M13 30 H25 M12 40 H23 M15 50 H27"/></g>' : ''}
  </g>${ground}`;
const markup = Object.fromEntries([...keys].map(k => [k, puppy(k)]));
const pending = new WeakMap();

// key: 'stand' | 'walk' | 'bike' | 'run' | 'sprint' | ''
export function renderDog(svgEl, key) {
  if (!svgEl) return;
  const next = keys.has(key) ? key : '';
  const previous = pending.get(svgEl);
  if (previous?.key === next || (!previous && svgEl.dataset.dogKey === next)) return;
  if (previous) clearTimeout(previous.timer);
  svgEl.classList.remove('dog-fade-out');
  const commit = () => {
    svgEl.innerHTML = next ? markup[next] : '';
    svgEl.dataset.dogKey = next;
    svgEl.classList.remove('dog-fade-out');
    pending.delete(svgEl);
  };
  if (!svgEl.innerHTML) { commit(); return; }
  svgEl.classList.add('dog-fade-out');
  const timer = setTimeout(commit, 90);
  pending.set(svgEl, { key: next, timer });
}
