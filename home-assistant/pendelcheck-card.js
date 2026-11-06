// Pendelcheck – Home Assistant Lovelace Card
// Portierung von pendelcheck.html als Custom Card.
// Nutzung: type: custom:pendelcheck-card
// Optionen (alle optional):
//   title, arrive_by ("07:40"), return_from ("16:40"),
//   refresh_minutes (Standard 10, 0 = aus), auto_check (true),
//   routes: [{ id, from, to }]   (Hinfahrt; Rückfahrt = umgedreht)
//   api ("https://v6.db.transport.rest")

const PC_DEFAULT_ROUTES = [
  { id: 'wustermark', from: 'Wustermark, Bahnhof', to: 'Berlin Jungfernheide' },
  { id: 'nauen', from: 'Nauen, Bahnhof', to: 'Berlin Jungfernheide' },
  { id: 'brandenburg', from: 'Brandenburg (Havel) Hbf', to: 'Berlin Charlottenburg' }
];
const PC_KEY_OUT = 'pendelcheck_history_v1';
const PC_KEY_RET = 'pendelcheck_history_return_v1';
const PC_KEY_STATIONS = 'pendelcheck_stations_v1';
const PC_DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function pcLoad(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; }
}
function pcSave(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
}
function pcEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pcTime(iso) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
}
function pcParseHM(s, fb) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : fb;
}
function pcNext(hh, mm) {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}
function pcDelayClass(min) {
  if (min <= 3) return 'ok';
  if (min <= 10) return 'mid';
  return 'bad';
}
function pcShort(name) { return String(name).split(',')[0]; }

class PendelcheckCard extends HTMLElement {
  setConfig(config) {
    this.config = Object.assign({
      title: 'Pendelcheck',
      arrive_by: '07:40',
      return_from: '16:40',
      refresh_minutes: 10,
      auto_check: true,
      api: 'https://v6.db.transport.rest',
      routes: PC_DEFAULT_ROUTES
    }, config || {});
    this.routesOut = this.config.routes;
    this.routesRet = this.routesOut.map(r => ({ id: r.id, from: r.to, to: r.from }));
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this._renderShell();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._started) {
      this._started = true;
      if (this.config.auto_check) this.runCheck();
    }
  }

  connectedCallback() {
    const mins = Number(this.config && this.config.refresh_minutes) || 0;
    if (mins > 0 && !this._timer) {
      this._timer = setInterval(() => { if (!document.hidden) this.runCheck(); }, mins * 60000);
    }
  }
  disconnectedCallback() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  getCardSize() { return 12; }
  getGridOptions() { return { columns: 'full', rows: 'auto' }; }
  static getStubConfig() { return {}; }

  _renderShell() {
    const c = this.config;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 16px; }
        .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
        h1 { font-size: 20px; font-weight: 600; margin: 0 0 2px; color: var(--primary-text-color); }
        .sub { font-size: 13px; color: var(--secondary-text-color); margin: 0; }
        .updated { font-size: 12px; color: var(--secondary-text-color); margin-top: 2px; }
        button { font: inherit; font-size: 14px; font-weight: 500; background: var(--primary-color); color: var(--text-primary-color, #fff);
          border: none; border-radius: 10px; padding: 8px 16px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
        button:disabled { opacity: .6; cursor: default; }
        .banner { display: none; font-size: 13px; padding: 10px 12px; border-radius: 10px; margin-bottom: 12px;
          background: rgba(var(--rgb-warning-color, 255,166,0), .15); color: var(--warning-color, #b4590e); }
        .banner.show { display: block; }
        .banner ul { margin: 6px 0 0; padding-left: 18px; font-size: 12.5px; }
        .stitle { font-size: 15px; font-weight: 600; margin: 16px 0 8px; display: flex; align-items: center; gap: 8px; color: var(--primary-text-color); }
        .pill { font-size: 12px; font-weight: 500; color: var(--secondary-text-color); background: var(--secondary-background-color); padding: 2px 9px; border-radius: 20px; }
        .cards { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
        .card { border: 1px solid var(--divider-color); border-radius: 12px; padding: 12px 14px; background: var(--card-background-color); }
        .card.best { border: 2px solid var(--success-color, #1d6e52); }
        .badge { display: inline-block; font-size: 12px; font-weight: 500; color: var(--success-color, #1d6e52);
          background: rgba(var(--rgb-success-color, 29,110,82), .15); padding: 2px 10px; border-radius: 20px; margin-bottom: 6px; }
        .rname { font-size: 14.5px; font-weight: 600; margin-bottom: 6px; color: var(--primary-text-color); }
        .row { display: flex; justify-content: space-between; font-size: 13px; padding: 3px 0; border-top: 1px solid var(--divider-color); }
        .row:first-of-type { border-top: none; }
        .k { color: var(--secondary-text-color); }
        .v { font-weight: 500; color: var(--primary-text-color); }
        .ok { color: var(--success-color, #1d6e52) !important; }
        .mid { color: var(--warning-color, #b4590e) !important; }
        .bad { color: var(--error-color, #a32d2d) !important; }
        .trains { margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--divider-color); }
        .ttitle { font-size: 12px; color: var(--secondary-text-color); margin-bottom: 4px; }
        .tr { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 3px 0; color: var(--primary-text-color); flex-wrap: wrap; }
        .tr .t { font-weight: 600; min-width: 42px; }
        .tr .a { min-width: 42px; }
        .tr .arrow, .tr .line { color: var(--secondary-text-color); font-size: 12px; }
        .tr .cx { color: var(--error-color, #a32d2d); font-size: 12px; text-decoration: line-through; }
        .hist { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
        .hc { border: 1px solid var(--divider-color); border-radius: 10px; padding: 8px 10px; }
        .hc .n { font-size: 12px; color: var(--secondary-text-color); }
        .hc .num { font-size: 16px; font-weight: 600; margin: 2px 0; color: var(--primary-text-color); }
        .hc .s { font-size: 12px; color: var(--secondary-text-color); }
        .htitle { font-size: 13px; color: var(--secondary-text-color); margin: 16px 0 6px; }
        .empty { font-size: 13px; color: var(--secondary-text-color); }
        .spin { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: s .7s linear infinite; }
        @keyframes s { to { transform: rotate(360deg); } }
      </style>
      <ha-card>
        <div class="head">
          <div>
            <h1 id="title"></h1>
            <p class="sub">Hinfahrt: Ankunft bis ${pcEsc(c.arrive_by)} Uhr · Rückfahrt: ab ${pcEsc(c.return_from)} Uhr</p>
            <div class="updated" id="updated"></div>
          </div>
          <button id="btn">Strecken prüfen</button>
        </div>
        <div class="banner" id="banner"><div id="btext"></div><ul id="blist"></ul></div>
        <div class="stitle">Hinfahrt <span class="pill">Ankunft bis ${pcEsc(c.arrive_by)}</span></div>
        <div class="cards" id="out"><div class="empty">Noch nicht geprüft.</div></div>
        <div class="stitle">Rückfahrt <span class="pill">Abfahrt ab ${pcEsc(c.return_from)}</span></div>
        <div class="cards" id="ret"><div class="empty">Noch nicht geprüft.</div></div>
        <div class="htitle">Verlauf Hinfahrt (gespeichert auf diesem Gerät)</div>
        <div class="hist" id="hout"></div>
        <div class="htitle">Verlauf Rückfahrt (gespeichert auf diesem Gerät)</div>
        <div class="hist" id="hret"></div>
      </ha-card>`;
    const $ = id => this.shadowRoot.getElementById(id);
    $('title').textContent = c.title + ' – ' + PC_DAYS[new Date().getDay()];
    $('btn').addEventListener('click', () => this.runCheck());
    this._renderHistory(this.routesOut, PC_KEY_OUT, 'hout');
    this._renderHistory(this.routesRet, PC_KEY_RET, 'hret');
  }

  async _fetchJSON(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(t); }
  }

  async _station(name, cache) {
    if (cache[name]) return cache[name];
    const data = await this._fetchJSON(this.config.api + '/locations?query=' + encodeURIComponent(name) + '&results=1&poi=false&addresses=false');
    if (!data.length) throw new Error('Keine Station gefunden für "' + name + '"');
    cache[name] = data[0].id;
    pcSave(PC_KEY_STATIONS, cache);
    return data[0].id;
  }

  async _checkRoute(route, cache, opts) {
    const fromId = await this._station(route.from, cache);
    const toId = await this._station(route.to, cache);
    let url = this.config.api + '/journeys?from=' + fromId + '&to=' + toId + '&results=3&stopovers=false';
    if (opts.departure) url += '&departure=' + encodeURIComponent(opts.departure);
    if (opts.arrival) url += '&arrival=' + encodeURIComponent(opts.arrival);
    const data = await this._fetchJSON(url);
    const journeys = data.journeys || [];
    if (!journeys.length) throw new Error('Keine Verbindungen gefunden');

    let best = null, worst = 0, anyCx = false;
    const trains = journeys.slice(0, 3).map(j => {
      const first = j.legs[0], last = j.legs[j.legs.length - 1];
      const cx = j.legs.some(l => l.cancelled);
      const pArr = last.plannedArrival ? new Date(last.plannedArrival) : null;
      const aArr = last.arrival ? new Date(last.arrival) : pArr;
      const d = (pArr && aArr) ? Math.round((aArr - pArr) / 60000) : 0;
      if (cx) anyCx = true;
      worst = Math.max(worst, d);
      if (best === null || d < best) best = d;
      return {
        dep: pcTime(first.departure || first.plannedDeparture),
        arr: pcTime(last.arrival || last.plannedArrival),
        delay: Math.max(0, d),
        cancelled: cx,
        transfers: j.legs.filter(l => !l.walking).length - 1,
        line: (first.line && first.line.name) ? first.line.name : (first.walking ? 'Fußweg' : '')
      };
    });
    let prob = 98 - worst * 3 - (anyCx ? 25 : 0);
    prob = Math.max(35, Math.min(99, Math.round(prob)));
    return { id: route.id, name: pcShort(route.from) + ' → ' + route.to, verspaetung: Math.max(0, best || 0), ausfall: anyCx, prob, trains, error: null };
  }

  async runCheck() {
    if (this._busy) return;
    this._busy = true;
    const $ = id => this.shadowRoot.getElementById(id);
    const btn = $('btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Prüfe…';
    $('banner').classList.remove('show');

    const cache = pcLoad(PC_KEY_STATIONS);
    const errors = [];
    const [rh, rm] = pcParseHM(this.config.return_from, [16, 40]);
    // Hinfahrt: wie im Original die nächsten Verbindungen; Rückfahrt ab Uhrzeit.
    const retDep = pcNext(rh, rm);

    const run = async (routes, opts, label, nameOf) => Promise.all(routes.map(r =>
      this._checkRoute(r, cache, opts).catch(e => {
        errors.push(label + ' ' + nameOf(r) + ': ' + (e.name === 'AbortError' ? 'Zeitüberschreitung' : e.message));
        return { id: r.id, name: pcShort(r.from) + ' → ' + r.to, error: true };
      })));

    const [out, ret] = await Promise.all([
      run(this.routesOut, {}, 'Hinfahrt', r => pcShort(r.from)),
      run(this.routesRet, { departure: retDep }, 'Rückfahrt', r => pcShort(r.to))
    ]);

    if (errors.length) {
      $('banner').classList.add('show');
      $('btext').textContent = errors.length + ' von ' + (out.length + ret.length) + ' Strecken konnten nicht live abgerufen werden:';
      $('blist').innerHTML = errors.map(e => '<li>' + pcEsc(e) + '</li>').join('');
    }

    this._renderCards(out, 'out');
    this._renderCards(ret, 'ret');
    this._record(out.filter(r => !r.error), PC_KEY_OUT);
    this._record(ret.filter(r => !r.error), PC_KEY_RET);
    this._renderHistory(this.routesOut, PC_KEY_OUT, 'hout');
    this._renderHistory(this.routesRet, PC_KEY_RET, 'hret');

    $('updated').textContent = 'Zuletzt geprüft: ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    btn.disabled = false;
    btn.textContent = 'Erneut prüfen';
    this._busy = false;
  }

  _renderCards(results, id) {
    const ok = results.filter(r => !r.error);
    const best = ok.length ? ok.reduce((a, b) => b.prob > a.prob ? b : a) : null;
    this.shadowRoot.getElementById(id).innerHTML = results.map(r => {
      if (r.error) {
        return '<div class="card"><div class="rname">' + pcEsc(r.name) + '</div><div class="empty">Keine Live-Daten verfügbar.</div></div>';
      }
      const isBest = best && r.id === best.id;
      const rows = (r.trains || []).map(t => {
        if (t.cancelled) return '<div class="tr"><span class="t">' + t.dep + '</span><span class="arrow">→</span><span class="cx">Zug fällt aus</span></div>';
        const tx = t.transfers > 0 ? (t.transfers + ' Umstieg' + (t.transfers > 1 ? 'e' : '')) : 'direkt';
        return '<div class="tr"><span class="t">' + t.dep + '</span><span class="arrow">→</span>' +
          '<span class="a ' + pcDelayClass(t.delay) + '">' + t.arr + '</span>' +
          '<span class="line">' + pcEsc([t.line, tx].filter(Boolean).join(' · ')) + (t.delay > 0 ? ' · +' + t.delay + ' Min' : '') + '</span></div>';
      }).join('');
      return '<div class="card' + (isBest ? ' best' : '') + '">' +
        (isBest ? '<div class="badge">Empfehlung</div>' : '') +
        '<div class="rname">' + pcEsc(r.name) + '</div>' +
        '<div class="row"><span class="k">Prognostizierte Zuverlässigkeit</span><span class="v">' + r.prob + ' %</span></div>' +
        '<div class="row"><span class="k">Erwartete Verspätung</span><span class="v ' + pcDelayClass(r.verspaetung) + '">' + r.verspaetung + ' Min</span></div>' +
        '<div class="row"><span class="k">Zugausfall</span><span class="v ' + (r.ausfall ? 'bad' : '') + '">' + (r.ausfall ? 'Ja' : 'Nein') + '</span></div>' +
        (rows ? '<div class="trains"><div class="ttitle">Nächste Verbindungen</div>' + rows + '</div>' : '') +
        '</div>';
    }).join('');
  }

  _record(results, key) {
    if (!results.length) return;
    const hist = pcLoad(key);
    results.forEach(r => {
      if (!hist[r.id]) hist[r.id] = [];
      hist[r.id].push({ date: new Date().toISOString(), verspaetung: r.verspaetung, ausfall: r.ausfall });
      if (hist[r.id].length > 60) hist[r.id] = hist[r.id].slice(-60);
    });
    pcSave(key, hist);
  }

  _renderHistory(routes, key, id) {
    const hist = pcLoad(key);
    this.shadowRoot.getElementById(id).innerHTML = routes.map(route => {
      const e = hist[route.id] || [];
      const label = pcEsc(pcShort(route.from));
      if (!e.length) return '<div class="hc"><div class="n">' + label + '</div><div class="s">noch keine Daten</div></div>';
      const avg = (e.reduce((s, x) => s + x.verspaetung, 0) / e.length).toFixed(1);
      const pct = Math.round(100 * e.filter(x => x.verspaetung <= 5 && !x.ausfall).length / e.length);
      return '<div class="hc"><div class="n">' + label + '</div><div class="num">' + pct + ' % pünktlich</div>' +
        '<div class="s">' + avg + ' Min ø Verspätung · ' + e.length + ' Prüfungen</div></div>';
    }).join('');
  }
}

if (!customElements.get('pendelcheck-card')) {
  customElements.define('pendelcheck-card', PendelcheckCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'pendelcheck-card', name: 'Pendelcheck', description: 'Pünktlichkeit der Pendelstrecken (DB)' });
}
