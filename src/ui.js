import { RARITY } from './fish.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// Flat side-on drawing of a species, for the catch card and the journal.
export function fishSvg(sp) {
  if (sp.id === 'boot') {
    return `<svg viewBox="0 0 200 90" aria-hidden="true"><path d="M70 12h42v40c22 2 40 8 46 22v6H70z" fill="${hex(sp.color)}"/><rect x="66" y="78" width="96" height="8" rx="3" fill="${hex(sp.belly)}"/></svg>`;
  }
  const ry = Math.min(36, 14 + sp.h * 46);
  const tail = 18 * sp.tail;
  const body = hex(sp.color), belly = hex(sp.belly);
  const wing = sp.wings ? `<path d="M118 50 l-34 26 l40 -8z" fill="#e58a3c"/>` : '';
  return `<svg viewBox="0 0 200 90" aria-hidden="true">
    <path d="M52 45 L${22} ${45 - tail} L34 45 L22 ${45 + tail} Z" fill="${body}"/>
    <path d="M92 ${45 - ry + 3} L112 ${45 - ry - 14 * (sp.dorsal / 0.12)} L132 ${45 - ry + 4} Z" fill="${body}"/>
    <ellipse cx="108" cy="45" rx="62" ry="${ry}" fill="${body}"/>
    <path d="M50 49 A62 ${ry} 0 0 0 166 49 Z" fill="${belly}" opacity="0.92"/>
    ${wing}
    <circle cx="150" cy="${45 - ry * 0.25}" r="4.5" fill="#fff"/><circle cx="151" cy="${45 - ry * 0.25}" r="2.4" fill="#111"/>
  </svg>`;
}

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), menu: $('menu'), prompt: $('prompt'), power: $('power'), fight: $('fight'),
      bite: $('bite'), catchCard: $('catch'), toasts: $('toasts'), journal: $('journal'), grid: $('journal-grid'),
    };
    this.powerFill = this.el.power.querySelector('.fill');
    this.marker = this.el.fight.querySelector('.marker');
    this.reelFill = $('reel-track').querySelector('.fill');
    this.last = {};
  }

  showHud(on) {
    this.el.hud.hidden = !on;
    this.el.menu.hidden = on;
  }

  setScores(sc, best) {
    $('me-n').textContent = sc.me.n;
    $('me-pts').textContent = sc.me.pts;
    $('mate-n').textContent = sc.mate.n;
    $('mate-pts').textContent = sc.mate.pts;
    $('best').textContent = best;
  }

  setMateLabel(text) {
    document.getElementById('mate-label').textContent = text;
  }

  setMeLabel(text) {
    document.getElementById('me-label').textContent = text;
  }

  // Menu line about the live link, and which characters are already taken.
  setNetStatus(text, taken = []) {
    document.getElementById('net-status').textContent = text;
    document.querySelectorAll('[data-pick]').forEach((b) => { b.disabled = taken.includes(b.dataset.pick); });
  }

  setPrompt(text, urgent = false) {
    if (this.last.prompt !== text) { this.el.prompt.textContent = text; this.last.prompt = text; }
    if (this.last.urgent !== urgent) { this.el.prompt.classList.toggle('urgent', urgent); this.last.urgent = urgent; }
  }

  setPower(p) {
    const on = p !== null;
    if (this.el.power.hidden === on) this.el.power.hidden = !on;
    if (on) this.powerFill.style.width = (p * 100).toFixed(1) + '%';
  }

  setFight(f) {
    const on = f !== null;
    if (this.el.fight.hidden === on) this.el.fight.hidden = !on;
    if (!on) return;
    this.marker.style.left = Math.min(100, (f.T / 1.12) * 100).toFixed(1) + '%';
    this.reelFill.style.width = (Math.max(0, Math.min(1, f.progress)) * 100).toFixed(1) + '%';
    this.el.fight.classList.toggle('danger', f.danger);
  }

  setBiteMark(x, y) {
    const on = x !== null && x !== undefined;
    if (this.el.bite.hidden === on) this.el.bite.hidden = !on;
    if (on) { this.el.bite.style.left = x + 'px'; this.el.bite.style.top = y + 'px'; }
  }

  showCatch(sp, size, pts, { isNew, record }) {
    const r = RARITY[sp.rarity];
    const flag = isNew ? '<span class="flag">新鱼种</span>' : record ? '<span class="flag">新纪录</span>' : '';
    this.el.catchCard.innerHTML = `
      <span class="rarity" style="background:${r.color}">${r.label}</span>
      ${fishSvg(sp)}
      <h2>${sp.name}</h2>
      <div class="size"><b>${size}</b> 厘米</div>
      <p class="note">${sp.note}</p>
      <div class="row"><span class="pts">+${pts} 分</span>${flag}</div>`;
    this.el.catchCard.hidden = false;
  }

  hideCatch() {
    if (!this.el.catchCard.hidden) this.el.catchCard.hidden = true;
  }

  setTimer(text, urgent) {
    if (this.last.timer !== text) { document.getElementById('timer').textContent = text; this.last.timer = text; }
    if (this.last.timerUrgent !== urgent) { document.getElementById('timer').classList.toggle('urgent', urgent); this.last.timerUrgent = urgent; }
  }

  setPool(text) {
    if (this.last.pool !== text) { document.getElementById('pool').textContent = text; this.last.pool = text; }
  }

  // Shown while the partner's big fish is at the boat; green means the net will reach it.
  setNetButton(s) {
    const btn = document.getElementById('net-btn');
    const on = s !== null;
    if (btn.hidden === on) btn.hidden = !on;
    if (!on) return;
    const key = `${s.green}|${s.name}`;
    if (this.last.net === key) return;
    this.last.net = key;
    btn.classList.toggle('green', s.green);
    document.getElementById('net-word').textContent = s.green ? '下网！' : '等一下';
    document.getElementById('net-sub').textContent = `帮 ${s.name} 抄网 · F 键`;
  }

  showResults(r) {
    document.getElementById('res-pool').textContent = r.pool;
    document.getElementById('res-fish').textContent = r.poolFish ? `最大的一条：${r.poolFish}` : '';
    const table = document.getElementById('res-table');
    table.textContent = '';
    const row = (cells, tag) => {
      const tr = document.createElement('tr');
      cells.forEach((c, i) => {
        const el = document.createElement(tag);
        el.textContent = c;
        if (i === 1 || i === 2) el.className = 'num';
        tr.appendChild(el);
      });
      table.appendChild(tr);
    };
    row(['', '条数', '总分', '最大的鱼'], 'th');
    for (const x of r.rows) row([x.name, x.n, x.pts, x.big], 'td');
    document.getElementById('res-note').textContent = `你的历史最高总分：${r.best}`;
    document.getElementById('free-btn').hidden = !r.canFree;
    const dlg = document.getElementById('results');
    if (!dlg.open) dlg.showModal();
  }

  setResultsNote(text) {
    document.getElementById('res-note').textContent = text;
  }

  hideResults() {
    const dlg = document.getElementById('results');
    if (dlg.open) dlg.close();
  }

  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `toast glass ${kind}`;
    t.textContent = text;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 3100);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
  }

  openJournal(data) {
    this.el.grid.innerHTML = data.map(({ sp, entry, rarity }) => {
      const known = !!entry;
      return `<div class="card ${known ? '' : 'unknown'}">
        ${fishSvg(sp)}
        <span class="r" style="color:${rarity.color}">${rarity.label}</span>
        <strong>${known ? sp.name : '？？？'}</strong>
        <small>${known ? `钓到 ${entry.count} 条 · 最大 ${entry.max} 厘米` : '还没钓到过'}</small>
      </div>`;
    }).join('');
    if (!this.el.journal.open) this.el.journal.showModal();
  }
}
