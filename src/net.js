// Two-player link, three transports behind one interface:
//  - 'room': Claude's live room, for signed-in viewers of the published artifact.
//  - 'peer': browser-to-browser (WebRTC via PeerJS) on any ordinary web host. No
//    account needed; the room is the code in the URL hash, shared as an invite link.
//  - 'local': BroadcastChannel between tabs, only with ?bc, for offline testing.
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const ID_PREFIX = 'haidiao-boat-';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = reject;
    document.head.appendChild(el);
  });
}
export class Net {
  constructor() {
    this.kind = null; // 'room' | 'local' | null
    this.peers = [];
    this.listeners = [];
    this.connected = false;
  }

  onPeers(fn) { this.listeners.push(fn); fn(this.peers, this); }
  notify() { for (const fn of this.listeners) fn(this.peers, this); }

  async init() {
    let room = null;
    try { if (window.claude?.use) room = await window.claude.use('room'); } catch { room = null; }
    if (room) {
      this.kind = 'room';
      this.room = room;
      const dead = () => { this.kind = null; this.peers = []; this.notify(); };
      room.onPeers((change) => {
        this.peers = change.peers.map((p) => ({ id: p.peer, me: p.isMe && p.sameTab, presence: p.presence || {} }));
        this.notify();
      }, dead);
      room.onConnection((c) => { this.connected = c; this.notify(); }, dead);
      return;
    }
    // Inside Claude's page frame nothing may connect out, so there is no link without the room.
    const framed = !!window.claude || location.hostname.endsWith('claudeusercontent.com');
    if (!framed && !location.search.includes('bc')) {
      await this.initPeer();
      this.notify();
      return;
    }
    if (!framed && 'BroadcastChannel' in window) {
      this.kind = 'local';
      this.connected = true;
      this.id = Math.random().toString(36).slice(2, 10);
      this.mine = {};
      this.map = new Map();
      this.ch = new BroadcastChannel('haidiao-room');
      this.ch.onmessage = (e) => {
        const m = e.data;
        if (!m || m.id === this.id) return;
        if (m.bye) this.map.delete(m.id);
        else this.map.set(m.id, { presence: m.p || {}, seen: performance.now() });
        this.refresh();
      };
      setInterval(() => {
        const now = performance.now();
        for (const [id, v] of this.map) if (now - v.seen > 3000) this.map.delete(id);
        this.ch.postMessage({ id: this.id, p: this.mine });
        this.refresh();
      }, 1000);
      window.addEventListener('pagehide', () => this.ch.postMessage({ id: this.id, bye: true }));
      this.refresh();
    }
    this.notify();
  }

  refresh() {
    this.peers = [{ id: this.id, me: true, presence: this.mine }, ...[...this.map].map(([id, v]) => ({ id, me: false, presence: v.presence }))];
    this.notify();
  }

  // ---- Peer-to-peer ----
  async initPeer() {
    try { await loadScript(PEERJS_URL); } catch { return; }
    if (!window.Peer) return;
    this.kind = 'peer';
    this.mine = {};
    this.gen = 0;
    const m = location.hash.match(/^#([a-z0-9]{4,10})$/);
    this.code = m ? m[1] : Math.random().toString(36).slice(2, 7);
    if (!m) { try { history.replaceState(null, '', '#' + this.code); } catch { location.hash = this.code; } }
    this.inviteUrl = location.href;
    this.setPeers(null);
    this.tryGuest(0);
  }

  setPeers(remote) {
    this.peers = [{ id: this.role === 'host' ? 'a-host' : 'b-guest', me: true, presence: this.mine }];
    if (remote) this.peers.push({ id: this.role === 'host' ? 'b-guest' : 'a-host', me: false, presence: remote });
    this.notify();
  }

  dropPeer() {
    this.gen += 1;
    this.conn = null;
    this.connected = false;
    if (this.peer) { try { this.peer.destroy(); } catch { /* already gone */ } }
    this.peer = null;
  }

  // First try to join whoever already holds this code; if nobody does, hold it ourselves.
  tryGuest(n) {
    this.dropPeer();
    const gen = this.gen;
    this.role = 'guest';
    const peer = (this.peer = new window.Peer());
    const fallback = setTimeout(() => { if (gen === this.gen && !this.connected) this.tryHost(n); }, 7000);
    peer.on('open', () => {
      if (gen !== this.gen) return;
      this.wire(peer.connect(ID_PREFIX + this.code, { serialization: 'json' }), gen);
    });
    peer.on('error', (e) => {
      if (gen !== this.gen) return;
      clearTimeout(fallback);
      if (e.type === 'peer-unavailable') this.tryHost(n);
      else setTimeout(() => { if (gen === this.gen) this.tryGuest(n + 1); }, 3000);
    });
  }

  tryHost(n) {
    this.dropPeer();
    const gen = this.gen;
    this.role = 'host';
    const peer = (this.peer = new window.Peer(ID_PREFIX + this.code));
    peer.on('open', () => { if (gen === this.gen) this.setPeers(null); });
    peer.on('connection', (conn) => {
      if (gen !== this.gen) return;
      if (this.conn && this.conn.open) { conn.close(); return; }
      this.wire(conn, gen);
    });
    peer.on('disconnected', () => { if (gen === this.gen && !peer.destroyed) peer.reconnect(); });
    peer.on('error', (e) => {
      if (gen !== this.gen) return;
      if (e.type === 'unavailable-id') setTimeout(() => { if (gen === this.gen) this.tryGuest(n + 1); }, 700 + Math.random() * 600);
    });
  }

  wire(conn, gen) {
    conn.on('open', () => {
      if (gen !== this.gen) return;
      this.conn = conn;
      this.connected = true;
      this.lastData = performance.now();
      this.setPeers({});
    });
    conn.on('data', (d) => {
      if (gen !== this.gen || !d || typeof d !== 'object' || Array.isArray(d)) return;
      this.lastData = performance.now();
      const other = this.peers[1];
      if (!other) { this.setPeers(d); return; }
      const changed = other.presence.c !== d.c;
      other.presence = d;
      if (changed) this.notify();
    });
    const gone = () => {
      if (gen !== this.gen || this.conn !== conn) return;
      this.conn = null;
      this.connected = false;
      this.setPeers(null);
      if (this.role === 'guest') this.tryGuest(0);
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  // Absolute state, sent whole every time.
  setPresence(obj) {
    if (this.kind === 'peer') {
      this.mine = obj;
      if (this.peers[0]) this.peers[0].presence = obj;
      if (this.conn && this.conn.open) { try { this.conn.send(obj); } catch { /* dropped; next one follows */ } }
      return;
    }
    if (this.kind === 'room') this.room.presence(obj).catch(() => {});
    else if (this.kind === 'local') { this.mine = obj; this.ch.postMessage({ id: this.id, p: obj }); }
  }

  others() {
    // A closed tab can take a while to register as a dropped connection; silence is quicker.
    if (this.kind === 'peer' && performance.now() - (this.lastData || 0) > 4000) return [];
    return this.peers.filter((p) => !p.me);
  }
}
