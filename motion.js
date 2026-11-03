// Motion scores (data/motion/, tools/browser/motion.py): the game's animation data, played here as
// coloured, labelled shapes. Every box is a part of the scene sized and moved by the score's own numbers; its colour
// stands for the texture piece it would show. No game picture is used or needed.
(function () {
  "use strict";
  var H;   // helpers from app.js: esc, crumbs, load
  var EASE_GROUP = { posX: "move", posY: "move", sizeX: "size", sizeY: "size", scaleX: "scale", scaleY: "scale",
    rotZ: "turn", alpha: "fade", red: "tint", green: "tint", blue: "tint",
    image_uvs_0: "uvs", image_uvs_1: "uvs", image_uvs_2: "uvs", image_uvs_3: "uvs", linkAnim: "link" };
  var GROUP_COLOR = { move: "#2f7fd3", size: "#7a5bd3", scale: "#2fa3a3", turn: "#d39a2f", fade: "#8a8a8a",
    tint: "#d34f7f", uvs: "#5fa33a", link: "#555" };
  var EVENT_COLOR = { sound: "#2fa3a3", setVisible: "#8a8a8a", playTag: "#2f7fd3", play: "#2f7fd3", next: "#d34f2f",
    setAction: "#7a5bd3", resumeParticle: "#d39a2f", suspendParticle: "#a3742f" };

  function scoreFile(path) {
    var rel = String(path).replace(/^\/Content\/lang\//, "").replace(/^\//, "");
    return /\.json$/.test(rel) ? rel : rel + ".json";
  }
  function scoreable(path) { return /\.(json|sajson)$/.test(path || ""); }
  function link(path) { return "#/motion/" + scoreFile(path).split("/").map(encodeURIComponent).join("/"); }

  // ------------------------------------------------------------ curves (as the game's renderer reads them)
  function bezier(p0, p1, p2, p3, t) { var u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; }
  function segValue(s, f) {
    var p = s.p;
    if (s.k === "curve" && p.length >= 8) {   // the value eases; time runs evenly from f0 to f1
      var span = p[6] - p[0], t = span > 0 ? Math.min(1, Math.max(0, (f - p[0]) / span)) : 1;
      return bezier(p[1], p[3], p[5], p[7], t);
    }
    var f0 = p[0], v0 = p[1], f1 = p[p.length - 2], v1 = p[p.length - 1];
    if (s.k === "hold") return f < f1 ? v0 : v1;
    if (f1 === f0) return v1;
    return v0 + (v1 - v0) * (f - f0) / (f1 - f0);
  }
  function animated(segs, f, base) {
    if (!segs || f === undefined) return base;
    var cur = null;
    for (var i = 0; i < segs.length; i++) { if (segs[i].p[0] <= f) cur = segs[i]; else break; }
    if (!cur) return base;
    var end = cur.p[cur.p.length - 2];
    return f >= end ? cur.p[cur.p.length - 1] : segValue(cur, f);
  }
  function mul(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function local(s) {
    var r = s.rot * Math.PI / 180, c = Math.cos(r), n = Math.sin(r);
    return [c * s.sx, n * s.sx, -n * s.sy, c * s.sy, s.x, s.y];
  }
  function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

  // colour for a texture piece: the same piece is always the same colour
  function hue(key) { var h = 0; key = String(key || ""); for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0; return h % 360; }
  function hsl(h, s, l) {
    s /= 100; l /= 100;
    var k = function (n) { return (n + h / 30) % 12; }, a = s * Math.min(l, 1 - l);
    var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
    return [f(0), f(8), f(4)];
  }
  function rgba(c, a) { return "rgba(" + c.map(function (v) { return Math.round(Math.max(0, Math.min(1, v)) * 255); }).join(",") + "," + a + ")"; }
  function ink() { return getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#222"; }
  function baseName(p) { return String(p || "").replace(/^.*\//, ""); }

  // ------------------------------------------------------------ the scene engine
  function Scene(sc) {
    var self = this;
    this.sc = sc;
    this.fps = sc.fps || 60;
    this.tags = {};
    (sc.tags || []).forEach(function (t) { if (!("raw" in t)) self.tags[t.name] = t; });
    this.events = (sc.events || []).map(function (e, i) { return { e: e, i: i }; })
      .sort(function (a, b) { return (a.e.at - b.e.at) || (a.i - b.i); }).map(function (x) { return x.e; });
    this.root = { name: "(scene)", kids: [], depth: -1, isRoot: true };
    this.nodes = sc.parts.map(function (p, i) {
      var tr = {};
      Object.keys(p.tracks || {}).forEach(function (k) {
        tr[k] = p.tracks[k].map(function (s) {
          var extra = s.length && typeof s[s.length - 1] === "object" && !Array.isArray(s[s.length - 1]);
          return { k: s[0], p: s.slice(1, extra ? s.length - 1 : s.length) };
        }).sort(function (a, b) { return a.p[0] - b.p[0]; });
      });
      var at = p.at || [0, 0], size = p.size || [0, 0];
      return { i: i, p: p, name: p.name, type: p.type, tracks: tr, kids: [],
        x: at[0], y: at[1], w: size[0], h: size[1], anchor: p.pivot || [0, 0],
        sx: (p.scale || [1, 1])[0], sy: (p.scale || [1, 1])[1], rot: (p.turn || [0, 0, 0])[2] || 0,
        alpha: p.opacity === undefined ? 1 : p.opacity, color: p.tint || [1, 1, 1], shown: p.shown !== false,
        template: !!p.template, z: ((p.settings || {}).property || {}).zorder || 0,
        blend: p.blend, texture: p.texture || null, settings: p.settings || {} };
    });
    this.nodes.forEach(function (n) {
      var par = n.p.parent >= 0 ? self.nodes[n.p.parent] : self.root;
      n.parent = par; par.kids.push(n);
      n.depth = par.depth + 1;
    });
    this.nodes.forEach(function (n) {
      if (n.kids.some(function (c) { return c.z; })) n.kids = n.kids.map(function (c, i) { return [c, i]; })
        .sort(function (a, b) { return (a[0].z - b[0].z) || (a[1] - b[1]); }).map(function (x) { return x[0]; });
    });
  }
  Scene.prototype.reset = function (tagName) {
    var all = this.showHidden;
    // the top parts are switched on by the game's own code when the scene is put on screen
    this.nodes.forEach(function (n) { n.visible = all || n.shown || n.p.parent < 0; n.clock = null; n.fxOn = true; n.flipMove = (n.settings.sprite || {}).action; n.flipT = 0; });
    this.root.clock = null;
    this.clocks = [];
    this.tick = 0;
    this.fired = [];
    var t = this.tags[tagName];
    this.tag = t || null;
    if (t) this.start(this.root, tagName, t, 0);
  };
  Scene.prototype.start = function (node, name, t, depth) {
    var self = this;
    this.clocks = this.clocks.filter(function (k) {
      var inside = k.node === node || within(k.node, node);
      if (inside) k.node.clock = null;
      return !inside;
    });
    var k = { node: node, tag: name, from: t.from, to: t.to, loop: !!t.loop, frame: t.from, prev: t.from - 0.001, done: false };
    node.clock = k;
    this.clocks.push(k);
    if (depth < 8) this.run(k, undefined, depth + 1);
  };
  function within(n, scope) { for (var p = n.parent; p; p = p.parent) if (p === scope) return true; return false; }
  Scene.prototype.run = function (k, upTo, depth) {
    var to = upTo === undefined ? k.frame : upTo;
    for (var i = 0; i < this.events.length; i++) {
      var e = this.events[i];
      if (e.at > to) break;
      if (e.at > k.prev && e.at >= k.from && e.at <= k.to) this.event(k.node, e, depth || 0);
    }
    k.prev = to;
  };
  function bfs(scope, name) {
    var q = [scope];
    while (q.length) {
      var n = q.shift();
      if (n.name === name && n !== scope) return n;
      for (var i = 0; i < n.kids.length; i++) q.push(n.kids[i]);
    }
    return scope.name === name ? scope : null;
  }
  function findPath(scope, path) {
    var names = String(path).split(/ +/), n = scope;
    for (var i = 0; i < names.length && n; i++) n = bfs(n, names[i]);
    return n;
  }
  Scene.prototype.target = function (owner, e) {
    if (!e.node || e.layer) return null;
    var top = e.topNode && !/\$\(/.test(e.topNode) ? findPath(this.root, e.topNode) : null;
    if (top) return findPath(top, e.node);
    return findPath(owner, e.node) || findPath(this.root, e.node);
  };
  Scene.prototype.event = function (owner, e, depth) {
    var t = this.target(owner, e);
    this.fired.push({ tick: this.tick, e: e, ok: !e.node || !!t });
    switch (e.do) {
      case "setVisible": if (t) t.visible = this.showHidden || e.visible === true || e.visible === "true"; break;
      case "playTag": case "play":
        if (t && this.tags[e.tag]) this.start(t, e.tag, this.tags[e.tag], depth);
        break;
      case "setAction": if (t) { t.flipMove = e.action; t.flipT = 0; } break;
      case "resumeParticle": case "suspendParticle":
        if (t) each(t, function (d) { d.fxOn = e.do === "resumeParticle"; });
        break;
    }
  };
  function each(n, fn) { fn(n); n.kids.forEach(function (c) { each(c, fn); }); }
  Scene.prototype.step = function () {   // one tick: 1/60 s
    this.tick++;
    var ks = this.clocks.slice(), rate = this.fps / 60;
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i];
      if (k.done || this.clocks.indexOf(k) < 0) continue;
      k.prev = k.frame;
      k.frame += rate;
      if (k.frame >= k.to) {
        if (k.loop && k.to > k.from) { this.run(k, k.to); k.frame = k.from + (k.frame - k.to) % (k.to - k.from); k.prev = k.from - 0.001; }
        else { k.frame = k.to; k.done = true; }
      }
      this.run(k);
    }
    this.nodes.forEach(function (n) { n.flipT++; });
  };
  Scene.prototype.seek = function (tick) {
    if (tick < this.tick || !this.tag) this.reset(this.tag ? this.tag.name : null);
    while (this.tick < tick) this.step();
  };
  Scene.prototype.frameOf = function (n) {
    for (var p = n; p; p = p.parent) if (p.clock) return p.clock.frame;
    return undefined;
  };
  Scene.prototype.state = function (n) {
    var f = this.frameOf(n), a = n.tracks;
    return { x: animated(a.posX, f, n.x), y: animated(a.posY, f, n.y), w: animated(a.sizeX, f, n.w), h: animated(a.sizeY, f, n.h),
      sx: animated(a.scaleX, f, n.sx), sy: animated(a.scaleY, f, n.sy), rot: animated(a.rotZ, f, n.rot),
      alpha: animated(a.alpha, f, n.alpha),
      tint: [animated(a.red, f, n.color[0]), animated(a.green, f, n.color[1]), animated(a.blue, f, n.color[2])] };
  };
  // every drawable part this tick: [node, world matrix, alpha, state]
  Scene.prototype.walk = function (fn, opts) {
    var self = this;
    (function go(n, m, alpha) {
      if (!n.isRoot && (!n.visible || (n.template && n !== opts.from))) return;   // the attached part is the copy the client makes
      var w = m, a = alpha, s = null;
      if (!n.isRoot) {
        s = self.state(n);
        a = alpha * (s.alpha === undefined ? 1 : s.alpha);
        w = mul(m, local(s));
        if (a > 0.003 || opts.all) fn(n, w, a, s);
      }
      n.kids.forEach(function (c) { go(c, w, a); });
    })(opts.from || this.root, opts.m || [1, 0, 0, 1, 0, 0], 1);
  };
  Scene.prototype.find = function (name) { return bfs(this.root, name); };
  // a part's transform from the scene's top, at rest
  Scene.prototype.worldAtRest = function (n) {
    var chain = [];
    for (var p = n; p && !p.isRoot; p = p.parent) chain.unshift(p);
    var m = [1, 0, 0, 1, 0, 0], self = this;
    chain.forEach(function (c) { m = mul(m, local(self.state(c))); });
    return m;
  };
  function rectOf(n, s, sheets) {
    var w = s.w, h = s.h;
    if ((!w || !h) && n.texture && sheets) {
      var pc = sheets.piece(n.texture.sheet, n.texture.piece);
      if (pc) { w = w || pc.size[0]; h = h || pc.size[1]; }
    }
    return [-n.anchor[0] * w, -n.anchor[1] * h, w, h];
  }

  // texture-sheet layouts and flipbooks, loaded as parts need them (scores too: no pictures)
  function Library() { this.sheets = {}; this.books = {}; }
  Library.prototype.get = function (store, path, fn) {
    var self = this;
    if (!path) return null;
    if (!(path in store)) {
      store[path] = null;
      H.load("motion/" + scoreFile(path)).then(function (sc) {
        store[path] = sc;
        if (sc.kind === "sheet") { sc.byName = {}; sc.pieces.forEach(function (p) { sc.byName[p.name] = p; }); }
        if (fn) fn();
      }).catch(function () { store[path] = false; });
    }
    return store[path] || null;
  };
  Library.prototype.piece = function (sheet, name) {
    var sc = this.get(this.sheets, sheet && sheet.replace(/\.png$/, ".json"), this.onload);
    return sc && sc.byName ? sc.byName[name] : null;
  };
  Library.prototype.book = function (file) { return this.get(this.books, file, this.onload); };

  // ------------------------------------------------------------ drawing
  function Stage(canvas) {
    this.c = canvas; this.ctx = canvas.getContext("2d");
    this.view = { k: 1, x: 0, y: 0 };
    this.opts = { labels: true, pivots: false };
  }
  Stage.prototype.size = function () {
    var r = this.c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    var w = Math.max(200, Math.round(r.width)), h = Math.round(r.height || w * 0.75);
    if (this.c.width !== Math.round(w * dpr)) { this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr); }
    this.dpr = dpr; this.w = w; this.h = h;
  };
  Stage.prototype.fit = function (box) {
    this.size();
    if (!box) { this.view = { k: 1, x: this.w / 2, y: this.h / 2 }; return; }
    var bw = Math.max(16, box[2] - box[0]), bh = Math.max(16, box[3] - box[1]);
    var k = Math.min(this.w / bw, this.h / bh) * 0.86;
    this.view = { k: k, x: this.w / 2 - k * (box[0] + box[2]) / 2, y: this.h / 2 - k * (box[1] + box[3]) / 2 };
  };
  Stage.prototype.clear = function () {
    var ctx = this.ctx, d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, this.w, this.h);
    // a faint grid every 32 units around the origin
    var v = this.view, step = 32 * v.k;
    ctx.strokeStyle = "rgba(128,128,128,.12)"; ctx.lineWidth = 1;
    if (step > 6) {
      ctx.beginPath();
      for (var x = v.x % step; x < this.w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, this.h); }
      for (var y = v.y % step; y < this.h; y += step) { ctx.moveTo(0, y); ctx.lineTo(this.w, y); }
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(128,128,128,.35)";
    ctx.beginPath(); ctx.moveTo(v.x - 8, v.y); ctx.lineTo(v.x + 8, v.y); ctx.moveTo(v.x, v.y - 8); ctx.lineTo(v.x, v.y + 8); ctx.stroke();
  };
  Stage.prototype.matrix = function (w) {
    var v = this.view, d = this.dpr;
    this.ctx.setTransform(d * v.k * w[0], d * v.k * w[1], d * v.k * w[2], d * v.k * w[3], d * (v.k * w[4] + v.x), d * (v.k * w[5] + v.y));
  };
  Stage.prototype.screen = function (w, x, y) { var p = apply(w, x, y); return [p[0] * this.view.k + this.view.x, p[1] * this.view.k + this.view.y]; };
  Stage.prototype.box = function (n, w, a, s, r, key, kind) {
    var ctx = this.ctx, col = hsl(hue(key), 62, 55), t = s.tint;
    var fill = [col[0] * t[0], col[1] * t[1], col[2] * t[2]];
    this.matrix(w);
    ctx.globalCompositeOperation = n.blend === "add" ? "lighter" : "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = rgba(fill, Math.min(1, a) * (kind === "flip" ? 0.4 : 0.3));
    ctx.fillRect(r[0], r[1], r[2], r[3]);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // outline in screen space so it stays one pixel wide at any zoom
    var c = [this.screen(w, r[0], r[1]), this.screen(w, r[0] + r[2], r[1]), this.screen(w, r[0] + r[2], r[1] + r[3]), this.screen(w, r[0], r[1] + r[3])];
    ctx.strokeStyle = rgba(hsl(hue(key), 70, 42), Math.min(1, 0.25 + a));
    ctx.lineWidth = 1;
    if (n.blend === "add") ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (var i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = "source-over";
    if (this.opts.labels) {
      var wpx = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]), hpx = Math.hypot(c[3][0] - c[0][0], c[3][1] - c[0][1]);
      if (wpx > 34 && hpx > 12) {
        var mid = this.screen(w, r[0] + r[2] / 2, r[1] + r[3] / 2);
        var label = String(key).replace(/\.png$/, "");
        ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = ink(); ctx.globalAlpha = Math.min(1, 0.55 + a);
        var max = Math.max(4, Math.floor(wpx / 6.2));
        ctx.fillText(label.length > max ? label.slice(0, max - 1) + "…" : label, mid[0], mid[1]);
        ctx.globalAlpha = 1;
      }
    }
  };
  Stage.prototype.marker = function (w, kind, a, on, label, tick) {
    var ctx = this.ctx, p = this.screen(w, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = Math.min(1, 0.3 + a);
    if (kind === "pivot") {
      ctx.strokeStyle = "rgba(128,128,128,.7)";
      ctx.beginPath(); ctx.moveTo(p[0] - 3, p[1]); ctx.lineTo(p[0] + 3, p[1]); ctx.moveTo(p[0], p[1] - 3); ctx.lineTo(p[0], p[1] + 3); ctx.stroke();
    } else {   // a particle emitter: a ring with sparks drifting out while it runs
      ctx.strokeStyle = on ? "#d39a2f" : "rgba(160,140,100,.5)";
      ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2); ctx.stroke();
      if (on) {
        ctx.fillStyle = "#d39a2f";
        for (var i = 0; i < 6; i++) {
          var ph = ((tick * 0.02 + i / 6) % 1), ang = i * 1.047 + tick * 0.01;
          ctx.globalAlpha = 1 - ph;
          ctx.beginPath(); ctx.arc(p[0] + Math.cos(ang) * (6 + ph * 18), p[1] + Math.sin(ang) * (6 + ph * 18), 1.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (this.opts.labels && label) {
        ctx.globalAlpha = 0.85; ctx.fillStyle = "#a3742f"; ctx.font = "10px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(label, p[0] + 9, p[1]);
      }
    }
    ctx.globalAlpha = 1;
  };
  function drawScene(stage, scene, lib, opts) {
    if (!opts || !opts.keep) stage.clear();
    scene.walk(function (n, w, a, s) {
      if (n.type === "image" || n.type === "window" || n.type === "mask") {
        var key = n.texture ? (n.texture.piece || baseName(n.texture.picture)) : n.name;
        if (n.type === "mask") key = "mask " + n.name;
        stage.box(n, w, a, s, rectOf(n, s, lib), key, "image");
      } else if (n.type === "sprite") {
        var book = lib.book(n.flipFile || (n.settings.sprite || {}).file);
        var drew = false;
        if (book) {
          var mv = book.moves.filter(function (m) { return m.name === n.flipMove; })[0] ||
            book.moves.filter(function (m) { return m.name === "idle" || m.name === "wait"; })[0] || book.moves[0];
          var fr = mv && flipFrame(mv, n.flipT);
          (fr ? fr.pieces : []).forEach(function (pc) {
            var piece = lib.piece(pc.picture && "/Content/" + pc.picture.replace(/^\.\//, ""), pc.piece);
            if (!piece) return;
            var full = piece.full || { w: piece.size[0], h: piece.size[1] }, trim = piece.trim || { x: 0, y: 0, w: piece.size[0], h: piece.size[1] };
            var off = pc.offset || [0, 0];
            stage.box(n, w, a, s, [-n.anchor[0] * full.w + trim.x + off[0], -n.anchor[1] * full.h + trim.y + off[1], trim.w, trim.h], pc.piece, "flip");
            drew = true;
          });
        }
        if (!drew) stage.box(n, w, a, s, [-8, -8, 16, 16], "flipbook " + n.name, "flip");
      } else if (n.type === "collision") {
        var r = rectOf(n, s), ctx = stage.ctx;
        stage.matrix(w); ctx.globalAlpha = 1; ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "rgba(196,61,47,.75)"; ctx.lineWidth = 1 / (stage.view.k * Math.max(Math.abs(s.sx) || 1, 0.01));
        ctx.strokeRect(r[0], r[1], r[2], r[3]); ctx.setLineDash([]);
      } else if (n.type === "particle" || n.type === "emitter") {
        stage.marker(w, "fx", a, n.fxOn, baseName((n.settings.particle || {}).file) || n.name, scene.tick);
      } else if (stage.opts.pivots) {
        stage.marker(w, "pivot", a);
      }
    }, opts || {});
  }
  function flipFrame(mv, t) {
    var len = mv.derived ? mv.derived.length : 0;
    if (!mv.frames.length) return null;
    if (len > 0) t = mv.loop ? t % len : Math.min(t, len - 1);
    for (var i = 0; i < mv.frames.length; i++) { t -= mv.frames[i].hold || 1; if (t < 0) return mv.frames[i]; }
    return mv.frames[mv.frames.length - 1];
  }
  // the region the tag's visible parts cover: a box many times the usual part's size (a full-screen flash) doesn't count
  function extent(scene, lib, ticks) {
    var boxes = [];
    scene.reset(scene.tag ? scene.tag.name : null);
    var stepEvery = Math.max(1, Math.floor(ticks / 60));
    for (var t = 0; t <= ticks; t += stepEvery) {
      scene.seek(t);
      scene.walk(function (n, w, a, s) {
        if (["image", "sprite", "collision", "window"].indexOf(n.type) < 0) return;
        var r = n.type === "sprite" ? [-16, -16, 32, 32] : rectOf(n, s, lib);
        if (!r[2] || !r[3]) return;
        var pts = [apply(w, r[0], r[1]), apply(w, r[0] + r[2], r[1]), apply(w, r[0], r[1] + r[3]), apply(w, r[0] + r[2], r[1] + r[3])];
        var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
        var bx = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
        bx.area = (bx[2] - bx[0]) * (bx[3] - bx[1]);
        boxes.push(bx);
      }, {});
    }
    if (!boxes.length) return null;
    var areas = boxes.map(function (b) { return b.area; }).sort(function (x, y) { return x - y; });
    var cap = Math.max(areas[Math.floor(areas.length / 2)] * 12, 64 * 64);
    var kept = boxes.filter(function (b) { return b.area <= cap; });
    if (!kept.length) kept = boxes;
    return kept.reduce(function (u, b) { return [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])]; },
      [Infinity, Infinity, -Infinity, -Infinity]);
  }

  // ------------------------------------------------------------ the player page for a scene
  function scenePage(app, sc, file) {
    var esc = H.esc, scene = new Scene(sc), lib = new Library();
    var tags = (sc.tags || []).filter(function (t) { return !("raw" in t); });
    var pick = ["idle", "wait", "play", "standby"].filter(function (n) { return scene.tags[n]; })[0] || (tags[0] || {}).name;
    var counts = {};
    scene.events.forEach(function (e) { counts[e.do || e.do_raw] = (counts[e.do || e.do_raw] || 0) + 1; });
    app.innerHTML = H.crumbs([["#/motion", "Motion library"], [null, baseName(sc.source)]]) +
      "<h1>" + esc(baseName(sc.source)) + '</h1><p class="muted mono">' + esc(sc.source) + "</p>" +
      '<p class="muted">A scene of ' + sc.derived.parts + " parts (" + sc.derived.animated_parts + " animated, " + sc.derived.keyframes +
      " keyframe segments), " + tags.length + " tags and " + scene.events.length + " timeline events, at " + scene.fps + " frames a second. " +
      "Each box is one part, drawn where the score puts it; its colour stands for the texture piece it shows. Dashed boxes add their light; red dashes are hit areas; amber rings are particle emitters.</p>" +
      '<div class="player"><div class="stagebox"><canvas id="mstage"></canvas></div>' +
      '<div class="controls"><select id="mtag">' + tags.map(function (t) {
        return '<option value="' + esc(t.name) + '"' + (t.name === pick ? " selected" : "") + ">" + esc(t.name) + " (" + t.from + "–" + t.to + (t.loop ? ", loops" : "") + ")</option>";
      }).join("") + '</select> <button id="mplay">❚❚</button> <select id="mspeed"><option value="1">1×</option><option value="0.5">½×</option><option value="0.25">¼×</option><option value="0.1">0.1×</option></select>' +
      ' <label><input type="checkbox" id="mlabels" checked> labels</label> <label><input type="checkbox" id="mpivots"> pivots</label>' +
      ' <label title="Parts the timeline keeps switched off (other forms, status effects) shown too"><input type="checkbox" id="mhidden"> hidden parts</label>' +
      ' <span id="mframe" class="mono muted"></span></div>' +
      '<input type="range" id="mscrub" min="0" value="0" step="1">' +
      '<div class="evbar" id="mevents"></div></div>' +
      '<h2>Dope sheet</h2><p class="muted small">Each row is a part with keyframes in this tag; each bar a keyframe segment, coloured by what it changes: ' +
      Object.keys(GROUP_COLOR).map(function (g) { return '<span class="swatch" style="background:' + GROUP_COLOR[g] + '"></span>' + g; }).join(" ") + "</p>" +
      '<div class="dope" id="mdope"></div>' +
      '<h2>Timeline events in this tag</h2><div id="mevlist"></div>' +
      (sc.derived.sounds && sc.derived.sounds.length ? '<h2>Sound effects</h2><p class="muted small">The sound files this scene’s timeline plays, by name (no sound is kept here).</p>' +
        '<div class="scroll"><table><tr><th>Sound</th><th>File</th><th>Frames</th></tr>' + sc.derived.sounds.map(function (x) {
          return '<tr><td class="mono">' + esc(x.id) + '</td><td class="mono small">' + esc(x.file) + '</td><td class="small">' + esc(x.at.join(", ")) + "</td></tr>";
        }).join("") + "</table></div>" : "") +
      '<details class="complete"><summary>All ' + sc.parts.length + " parts</summary>" + partsTable(sc) + "</details>" +
      '<details class="complete"><summary>Tags and events (whole file)</summary><p class="small">' +
      Object.keys(counts).map(function (k) { return esc(k) + " ×" + counts[k]; }).join(" · ") + "</p></details>" +
      '<p class="prov">Score: <a href="data/motion/' + esc(file) + '">' + esc(file) + "</a> (" + esc(sc.score) +
      '). <a href="#/motion">About the format</a>. Linked files: ' + (sc.derived.linked.concat(sc.derived.sheets || []).map(function (p) {
        return '<a class="mono" href="' + link(p) + '">' + esc(baseName(p)) + "</a>";
      }).concat(sc.derived.textures.filter(function (p) { return /\.png$/.test(p); }).map(function (p) {
        return '<span class="mono">' + esc(baseName(p)) + "</span> (picture used whole)";
      })).join(", ") || "none") + "</p>";

    var stage = new Stage(document.getElementById("mstage"));
    var scrub = document.getElementById("mscrub"), frameEl = document.getElementById("mframe");
    var playing = true, speed = 1, acc = 0, ticks = 0, last = 0, alive = true;
    lib.onload = function () { if (!playing) draw(); };
    function ticksOf(t) { return t ? Math.max(1, Math.round((t.to - t.from) * 60 / scene.fps)) : 60; }
    function choose(name) {
      scene.reset(name);
      ticks = ticksOf(scene.tag);
      scrub.max = ticks;
      stage.fit(extent(scene, lib, ticks));
      scene.reset(name);
      dope(); evbar(); evlist();
      draw();
    }
    function draw() {
      drawScene(stage, scene, lib);
      var k = scene.root.clock, pos = k && scene.tag ? (k.frame - scene.tag.from) / Math.max(1, scene.tag.to - scene.tag.from) : 0;
      scrub.value = Math.round(pos * ticks);
      frameEl.textContent = k ? "frame " + Math.floor(k.frame) + " · " + (pos * ticks / 60).toFixed(2) + " s of " + (ticks / 60).toFixed(2) : "";
      var head = document.getElementById("mhead");
      if (head && scene.tag) head.style.left = (100 * Math.min(1, pos)) + "%";
      var eh = document.getElementById("mevhead");
      if (eh && scene.tag) eh.style.left = (100 * Math.min(1, pos)) + "%";
    }
    function loop(ts) {
      if (!alive || !document.getElementById("mstage")) return;
      if (playing && last) {
        acc += (ts - last) / (1000 / 60) * speed;
        var n = Math.floor(acc);
        if (n > 0) {
          acc -= n;
          for (var i = 0; i < Math.min(n, 4); i++) {
            if (scene.tick >= ticks && !(scene.tag && scene.tag.loop)) scene.reset(scene.tag ? scene.tag.name : null);
            else scene.step();
          }
          draw();
        }
      }
      last = ts;
      requestAnimationFrame(loop);
    }
    function dope() {
      var t = scene.tag, el = document.getElementById("mdope");
      if (!t) { el.innerHTML = ""; return; }
      var span = Math.max(1, t.to - t.from), rows = [];
      scene.nodes.forEach(function (n) {
        var bars = [];
        Object.keys(n.tracks).forEach(function (prop) {
          n.tracks[prop].forEach(function (s) {
            var f0 = s.p[0], f1 = s.p[s.p.length - 2];
            if (f1 < t.from || f0 > t.to) return;
            var a = Math.max(f0, t.from), b = Math.min(f1, t.to);
            bars.push('<i title="' + H.esc(prop + " " + s.k + " " + f0 + "→" + f1) + '" style="left:' + (100 * (a - t.from) / span) + "%;width:" +
              Math.max(0.4, 100 * (b - a) / span) + "%;background:" + GROUP_COLOR[EASE_GROUP[prop] || "link"] + '"></i>');
          });
        });
        if (bars.length) rows.push('<div class="drow"><span class="dname" style="padding-left:' + (Math.min(n.depth, 8) * 8) + 'px" title="' + H.esc(n.name) + '">' + H.esc(n.name) +
          '</span><span class="dbars">' + bars.join("") + "</span></div>");
      });
      el.innerHTML = rows.length ? '<div class="dwrap"><div class="dhead" id="mhead"></div>' + rows.slice(0, 120).join("") + "</div>" +
        (rows.length > 120 ? '<p class="prov">First 120 of ' + rows.length + " rows.</p>" : "") : '<p class="muted">No part moves in this tag; its events alone run it.</p>';
    }
    function tagEvents() {
      var t = scene.tag;
      return t ? scene.events.filter(function (e) { return e.at >= t.from && e.at <= t.to; }) : [];
    }
    function evbar() {
      var t = scene.tag, el = document.getElementById("mevents");
      if (!t) { el.innerHTML = ""; return; }
      var span = Math.max(1, t.to - t.from);
      el.innerHTML = '<div class="evhead" id="mevhead"></div>' + tagEvents().map(function (e) {
        var d = e.do || e.do_raw;
        return '<i title="' + H.esc("frame " + e.at + ": " + d + " " + (e.node || e.id || e.tag || "")) + '" style="left:' + (100 * (e.at - t.from) / span) +
          "%;background:" + (EVENT_COLOR[d] || "#555") + '" data-at="' + e.at + '"></i>';
      }).join("");
      el.querySelectorAll("i[data-at]").forEach(function (m) {
        m.onclick = function () { setPlaying(false); scene.seek(Math.round((+m.dataset.at - t.from) * 60 / scene.fps)); draw(); };
      });
    }
    function evlist() {
      var ev = tagEvents(), el = document.getElementById("mevlist");
      el.innerHTML = ev.length ? '<div class="scroll"><table><tr><th class="num">Frame</th><th>Event</th><th>Part</th><th>Details</th></tr>' + ev.slice(0, 400).map(function (e) {
        var d = e.do || e.do_raw, rest = Object.keys(e).filter(function (k) { return ["at", "do", "do_raw", "node"].indexOf(k) < 0; })
          .map(function (k) { return H.esc(k) + "=" + H.esc(JSON.stringify(e[k])); }).join(" ");
        return '<tr><td class="num">' + H.esc(e.at) + '</td><td><span class="swatch" style="background:' + (EVENT_COLOR[d] || "#555") + '"></span>' + H.esc(d) +
          '</td><td class="mono">' + H.esc(e.node || "") + '</td><td class="mono small">' + rest + "</td></tr>";
      }).join("") + "</table></div>" : '<p class="muted">None.</p>';
    }
    function setPlaying(p) { playing = p; document.getElementById("mplay").textContent = p ? "❚❚" : "▶"; last = 0; }
    document.getElementById("mtag").onchange = function (ev) { choose(ev.target.value); };
    document.getElementById("mplay").onclick = function () { setPlaying(!playing); };
    document.getElementById("mspeed").onchange = function (ev) { speed = +ev.target.value; };
    document.getElementById("mlabels").onchange = function (ev) { stage.opts.labels = ev.target.checked; draw(); };
    document.getElementById("mpivots").onchange = function (ev) { stage.opts.pivots = ev.target.checked; draw(); };
    document.getElementById("mhidden").onchange = function (ev) { scene.showHidden = ev.target.checked; var t = scene.tick; scene.reset(scene.tag && scene.tag.name); scene.seek(t); draw(); };
    scrub.oninput = function () { setPlaying(false); scene.seek(+scrub.value); draw(); };
    window.addEventListener("hashchange", function stop() { alive = false; window.removeEventListener("hashchange", stop); });
    window.addEventListener("resize", function () { if (alive) { var t = scene.tick; stage.fit(extent(scene, lib, ticks)); scene.seek(0); scene.seek(t); draw(); } });
    choose(pick);
    requestAnimationFrame(loop);
  }
  function fmt(v) { return Array.isArray(v) ? "[" + v.map(function (x) { return typeof x === "number" ? +x.toFixed(3) : x; }).join(", ") + "]" : typeof v === "number" ? +v.toFixed(3) : v; }
  function partsTable(sc) {
    var esc = H.esc;
    return '<div class="scroll"><table class="parts"><tr><th class="num">#</th><th>Part</th><th>Type</th><th>Rest values</th><th>Texture piece</th><th>Tracks</th><th>Settings</th></tr>' +
      sc.parts.map(function (p, i) {
        var rest = ["at", "size", "pivot", "scale", "turn", "opacity", "tint", "shown", "blend"].filter(function (k) { return k in p; })
          .map(function (k) { return k + " " + esc(fmt(p[k])); }).join(" · ");
        var depth = 0; for (var q = p; q.parent >= 0; q = sc.parts[q.parent]) depth++;
        return '<tr><td class="num">' + i + '</td><td class="mono" style="padding-left:' + (6 + Math.min(depth, 10) * 10) + 'px">' + esc(p.name) + (p.template ? ' <span class="muted">(template)</span>' : "") +
          "</td><td>" + esc(p.type) + '</td><td class="small mono">' + rest + '</td><td class="mono small">' + esc(p.texture ? (p.texture.piece || baseName(p.texture.picture)) : "") +
          '</td><td class="small">' + Object.keys(p.tracks || {}).map(function (k) { return esc(k) + " " + p.tracks[k].length; }).join(", ") +
          '</td><td class="small">' + Object.keys(p.settings || {}).length + "</td></tr>";
      }).join("") + "</table></div>";
  }

  // ------------------------------------------------------------ flipbooks and sheets
  function flipbookPage(app, sc, file) {
    var esc = H.esc, lib = new Library();
    app.innerHTML = H.crumbs([["#/motion", "Motion library"], [null, baseName(sc.source)]]) +
      "<h1>" + esc(baseName(sc.source)) + '</h1><p class="muted mono">' + esc(sc.source) + "</p>" +
      '<p class="muted">A flipbook: ' + sc.moves.length + " frame-by-frame loop" + (sc.moves.length === 1 ? "" : "s") + ". Each frame shows texture pieces (boxes, sized from the sheet's layout) for some ticks.</p>" +
      '<div class="player"><div class="stagebox"><canvas id="mstage"></canvas></div><div class="controls"><select id="mmove">' +
      sc.moves.map(function (m) { return '<option value="' + esc(m.name) + '">' + esc(m.name) + " (" + m.frames.length + " frames, " + m.derived.length + " ticks" + (m.loop ? ", loops" : "") + ")</option>"; }).join("") +
      '</select> <span id="mframe" class="mono muted"></span></div></div><div id="mframes"></div>' +
      '<p class="prov">Score: <a href="data/motion/' + esc(file) + '">' + esc(file) + "</a>. Pictures: " +
      ((sc.pictures || {}).file || []).map(function (p) { var j = "/Content/" + String(p).replace(/^\.\//, "").replace(/\.png$/, ".json"); return '<a class="mono" href="' + link(j) + '">' + esc(baseName(j)) + " layout</a>"; }).join(", ") + "</p>";
    var stage = new Stage(document.getElementById("mstage")), move = sc.moves[0], t = 0, alive = true;
    var node = { anchor: [0.5, 0.5], blend: null };
    function pieces(fr) {
      return (fr ? fr.pieces : []).map(function (pc) {
        var piece = lib.piece(pc.picture && "/Content/" + pc.picture.replace(/^\.\//, ""), pc.piece);
        if (!piece) return null;
        var full = piece.full || { w: piece.size[0], h: piece.size[1] }, trim = piece.trim || { x: 0, y: 0, w: piece.size[0], h: piece.size[1] }, off = pc.offset || [0, 0];
        return { key: pc.piece, r: [-0.5 * full.w + trim.x + off[0], -0.5 * full.h + trim.y + off[1], trim.w, trim.h] };
      }).filter(Boolean);
    }
    function fitMove() {
      var b = null;
      move.frames.forEach(function (fr) { pieces(fr).forEach(function (p) {
        var r = p.r; b = b ? [Math.min(b[0], r[0]), Math.min(b[1], r[1]), Math.max(b[2], r[0] + r[2]), Math.max(b[3], r[1] + r[3])] : [r[0], r[1], r[0] + r[2], r[1] + r[3]];
      }); });
      stage.fit(b);
    }
    lib.onload = function () { fitMove(); strip(); };
    function strip() {
      document.getElementById("mframes").innerHTML = '<div class="chips">' + move.frames.map(function (fr, i) {
        return '<span class="chip">' + i + ": " + fr.pieces.map(function (p) { return esc(String(p.piece).replace(/\.png$/, "")); }).join(" + ") + " · " + esc(fr.hold) + "t</span>";
      }).join("") + "</div>";
    }
    document.getElementById("mmove").onchange = function (ev) { move = sc.moves.filter(function (m) { return m.name === ev.target.value; })[0]; t = 0; fitMove(); strip(); };
    window.addEventListener("hashchange", function stop() { alive = false; window.removeEventListener("hashchange", stop); });
    var last = 0;
    function loop(ts) {
      if (!alive || !document.getElementById("mstage")) return;
      if (!last || ts - last > 1000 / 60) {
        last = ts; t++;
        stage.clear();
        var fr = flipFrame(move, t);
        pieces(fr).forEach(function (p) { stage.box(node, [1, 0, 0, 1, 0, 0], 1, { tint: [1, 1, 1] }, p.r, p.key, "flip"); });
        document.getElementById("mframe").textContent = "frame " + Math.max(0, move.frames.indexOf(fr)) + " of " + move.frames.length;
      }
      requestAnimationFrame(loop);
    }
    fitMove(); strip();
    requestAnimationFrame(loop);
  }
  function sheetPage(app, sc, file) {
    var esc = H.esc;
    var W = 0, Hh = 0;
    sc.pieces.forEach(function (p) { var w = p.turned ? p.size[1] : p.size[0], h = p.turned ? p.size[0] : p.size[1]; W = Math.max(W, p.at[0] + w); Hh = Math.max(Hh, p.at[1] + h); });
    app.innerHTML = H.crumbs([["#/motion", "Motion library"], [null, baseName(sc.source)]]) +
      "<h1>" + esc(baseName(sc.source)) + '</h1><p class="muted mono">' + esc(sc.source) + "</p>" +
      '<p class="muted">A texture-sheet layout: where ' + sc.pieces.length + " named pieces sit in a " + W + "×" + Hh +
      " picture (the picture itself is not here). Pieces packed on their side have dashed edges.</p>" +
      '<div class="stagebox sheet"><canvas id="mstage"></canvas></div>' +
      '<div class="scroll"><table><tr><th>Piece</th><th class="num">x, y</th><th class="num">Size</th><th>Turned</th><th class="num">Trim (in its full size)</th></tr>' +
      sc.pieces.map(function (p) {
        return '<tr><td class="mono">' + esc(p.name) + '</td><td class="num">' + p.at.join(", ") + '</td><td class="num">' + p.size.join("×") + "</td><td>" + (p.turned ? "yes" : "") +
          '</td><td class="num">' + (p.trim ? esc(p.trim.x + ", " + p.trim.y + " " + p.trim.w + "×" + p.trim.h + " of " + (p.full || {}).w + "×" + (p.full || {}).h) : "") + "</td></tr>";
      }).join("") + "</table></div>" +
      '<p class="prov">Score: <a href="data/motion/' + esc(file) + '">' + esc(file) + "</a>.</p>";
    var c = document.getElementById("mstage"), stage = new Stage(c);
    stage.fit([0, 0, W || 1, Hh || 1]);
    stage.clear();
    sc.pieces.forEach(function (p) {
      var w = p.turned ? p.size[1] : p.size[0], h = p.turned ? p.size[0] : p.size[1];
      stage.box({ blend: p.turned ? "add" : null }, [1, 0, 0, 1, p.at[0], p.at[1]], 1, { tint: [1, 1, 1] }, [0, 0, w, h], p.name, "image");
    });
  }

  // ------------------------------------------------------------ the library
  function libraryPage(app) {
    var esc = H.esc;
    H.load("motion/index.json").then(function (ix) {
      var by = {};
      ix.scores.forEach(function (s) { by[s.kind] = (by[s.kind] || 0) + 1; });
      app.innerHTML = H.crumbs([[null, "Motion library"]]) + "<h1>Motion library</h1>" +
        '<p class="muted">Every animation file the archive’s battles use that we hold, as a motion score: our own documented, picture-free ' +
        "rewrite of the file. Each one plays here as coloured boxes moving exactly as the game moves its pictures.</p>" +
        '<p class="prov">' + (by.scene || 0) + " scenes · " + (by.flipbook || 0) + " flipbooks · " + (by.sheet || 0) + " sheet layouts · " +
        ix.linked_not_held.length + ' files they link to not held yet (<a href="#/wishlist">wish-list</a>).</p>' +
        formatHtml(ix.format) +
        '<p><input id="mfilter" type="search" placeholder="Filter by path, e.g. boss/204032 or 30031" style="width:100%;max-width:420px"></p><div id="mlist"></div>';
      var listEl = document.getElementById("mlist");
      function show(q) {
        q = (q || "").toLowerCase();
        var hits = ix.scores.filter(function (s) { return !q || s.source.toLowerCase().indexOf(q) >= 0; });
        listEl.innerHTML = '<div class="scroll"><table><tr><th>File</th><th>Kind</th><th class="num">Parts</th><th class="num">Keyframes</th><th>Tags / loops</th></tr>' +
          hits.slice(0, 400).map(function (s) {
            return '<tr><td class="mono"><a href="' + link(s.source) + '">' + esc(s.source.replace(/^\/Content\/lang\//, "")) + "</a></td><td>" + esc(s.kind) +
              '</td><td class="num">' + (s.parts || s.pieces || "") + '</td><td class="num">' + (s.keyframes || "") + '</td><td class="small">' +
              esc((s.tags || s.moves || []).slice(0, 8).join(", ") + ((s.tags || s.moves || []).length > 8 ? " …" : "")) + "</td></tr>";
          }).join("") + "</table></div>" + (hits.length > 400 ? '<p class="prov">First 400 of ' + hits.length + "; filter to narrow.</p>" : "");
      }
      document.getElementById("mfilter").oninput = function (ev) { show(ev.target.value); };
      show("");
    });
  }
  function formatHtml(name) {
    return '<details class="complete"><summary>The format (' + H.esc(name) + ")</summary><div class=\"fmt\">" +
      "<p>A score is JSON with <code>score</code>, <code>kind</code> and <code>source</code> (the game path it was made from). Values the score adds for readers sit under <code>derived</code>; everything else is the file’s own data.</p>" +
      "<p><b>scene</b>: <code>fps</code>; <code>stage</code> {w, h}; <code>tags</code> [{name, from, to, loop}] (frame ranges that can be played); " +
      "<code>events</code> [{at, do, …}] (what happens on a frame: <i>setVisible</i> a part, <i>playTag</i> a tag on a part, <i>sound</i>, <i>next</i> and other cues the game listens for); " +
      "<code>parts</code>, a flat list in tree order, each with <code>parent</code> (index, −1 for the top), <code>name</code>, <code>type</code> (null, image, sprite, particle, emitter, collision, …), " +
      "rest values <code>at</code> [x, y] from the parent’s origin (y down), <code>size</code> [w, h], <code>pivot</code> [0–1, 0–1], <code>scale</code>, <code>turn</code> [x, y, z] degrees, <code>opacity</code>, <code>tint</code> [r, g, b] 0–1, <code>shown</code>, <code>blend</code>; " +
      "<code>texture</code> {picture, sheet, piece, uvs} (which piece of which sheet it shows); <code>settings</code> (everything else a part has: particle emitter physics, linked files, draw order); " +
      "and <code>tracks</code>: per property (posX, posY, sizeX, sizeY, scaleX, scaleY, rotZ, alpha, red, green, blue, image_uvs_0–3) a list of segments " +
      "<code>[\"linear\", f0, v0, f1, v1]</code>, <code>[\"hold\", f0, v0, f1, v1]</code> or <code>[\"curve\", f0, v0, c1f, c1v, c2f, c2v, f1, v1]</code> (the value eases along a cubic Bézier through v0, c1v, c2v, v1 while time runs evenly from f0 to f1). " +
      "A property follows the last segment that has started: before the first, its rest value; past a segment’s end, that segment’s end value. " +
      "A part’s frame is its nearest playing ancestor’s: a tag played on a part runs its own clock for its subtree.</p>" +
      "<p><b>flipbook</b>: <code>moves</code> [{name, loop, frames [{hold (ticks), pieces [{picture, piece, offset}]}]}].</p>" +
      "<p><b>sheet</b>: <code>pieces</code> [{name, at, size, turned (packed on its side), trimmed, trim {x, y, w, h}, full {w, h}}]: where each piece sits in its picture.</p>" +
      "<p>Nothing in the game’s file is dropped or rounded, so a score holds all of it.</p></div></details>";
  }

  // ------------------------------------------------------------ an encounter on its battle field
  // Placement follows the client. Each enemy group's slot (the exporter's port of fixEnemyPosId) is a part of the
  // battle field scene, enemy_pos_nul_<slot>. The group's main scene (a boss's <id>_1 scene, or the shared enemy
  // template enemy_common_<slot's first digit>) hangs its character_group_nul there; each enemy then copies the
  // character_nul of its own scene into the main scene's character_group_pos_nul_<child_pos_id>. A plain enemy's
  // flipbook goes in the template's sprite_enemy_base, moved by its offset.
  function idleTag(scene) {
    var names = Object.keys(scene.tags);
    return ["idle", "bg01_idle", "wait"].filter(function (n) { return scene.tags[n]; })[0] ||
      names.filter(function (n) { return /idle/.test(n); })[0] || null;
  }
  function restartIfDone(sc) {
    if (sc.tag && !sc.tag.loop && sc.tick > (sc.tag.to - sc.tag.from) * 60 / sc.fps) sc.reset(sc.tag.name);
  }
  // transform of node relative to top's parent (top's own transform included), at the scene's current frame
  Scene.prototype.relative = function (top, node) {
    var chain = [];
    for (var q = node; q && q !== top.parent; q = q.parent) chain.unshift(q);
    var m = [1, 0, 0, 1, 0, 0], self = this;
    chain.forEach(function (c) { m = mul(m, local(self.state(c))); });
    return m;
  };
  function stageEncounter(holder, b, ri, helpers) {
    H = helpers;
    var round = b.rounds[ri], lib = new Library(), mains = [], actors = [], bgScene = null, field = null, alive = true;
    holder.innerHTML = '<div class="player stageview"><div class="stagebox"><canvas></canvas></div>' +
      '<div class="controls"><span class="muted small">Boxes stand for the pictures; each scene plays its idle loop. ' +
      'Party slots are placeholders.</span> <label><input type="checkbox" class="slabels" checked> labels</label></div></div>';
    var stage = new Stage(holder.querySelector("canvas"));
    holder.querySelector(".slabels").onchange = function (ev) { stage.opts.labels = ev.target.checked; };
    var files = {}, need = [];
    function want(path) { if (path && !(path in files)) { files[path] = null; need.push(path); } }
    var bg = ((b.stage || {}).background || []).filter(function (x) { return x.held; })[0];
    var fieldPath = (b.stage || {}).field || "/Content/lang/ab/battle/battle_field.json";
    want(fieldPath);
    if (bg) want(bg.path);
    var groups = round.groups.filter(function (g) { return g.slot; }).map(function (g) {
      var main = null, kids = [];
      g.enemies.forEach(function (e) {
        var own = e.sprite.filter(function (x) { return x.held; })[0];
        if (!own) return;
        if (g.is_boss) {
          if (!main) main = own.path.replace(/_\d+\.json$/, "_1.json");
          kids.push({ path: own.path, cp: e.child_pos_id || "1", name: e.name });
        } else {
          main = main || "/Content/lang/ab/character/enemy/enemy_common_" + g.slot.charAt(0) + ".json";
          kids.push({ path: main, flip: own.path, cp: "1", name: e.name,
            offset: [+(e.placement.offset_x || 0), +(e.placement.offset_y || 0)] });
        }
      });
      if (main) { want(main); kids.forEach(function (k) { want(k.path); }); }
      return { slot: g.slot, main: main, kids: kids };
    }).filter(function (g) { return g.main; });
    Promise.all(need.map(function (path) {
      return H.load("motion/" + scoreFile(path)).then(function (sc) { files[path] = sc; }, function () {});
    })).then(function () {
      if (!files[fieldPath]) { holder.innerHTML = '<p class="muted">The battle field scene isn\u2019t held, so this encounter can\u2019t be staged.</p>'; return; }
      field = new Scene(files[fieldPath]);
      field.reset(null);
      if (bg && files[bg.path]) bgScene = new Scene(files[bg.path]);
      groups.forEach(function (g) {
        if (!files[g.main]) return;
        var main = new Scene(files[g.main]), slot = field.find("enemy_pos_nul_" + g.slot), top = main.find("character_group_nul");
        if (!slot || !top) return;
        main.reset(idleTag(main));
        mains.push(main);
        g.kids.forEach(function (k) {
          if (!files[k.path]) return;
          var sc = new Scene(files[k.path]), pos = main.find("character_group_pos_nul_" + k.cp) || main.find("character_group_pos_nul_1");
          var ch = sc.find("character_nul");
          if (!pos || !ch) return;
          if (k.flip) sc.nodes.forEach(function (n) {
            if (n.name === "sprite_enemy_base") { n.flipFile = k.flip; n.x = k.offset[0]; n.y = k.offset[1]; }
            if (n.name === "sprite_enemy_add") n.shown = false;
          });
          sc.reset(idleTag(sc));
          actors.push({ scene: sc, top: ch, main: main, mainTop: top, pos: pos, slot: slot, name: k.name });
        });
      });
      var bgPos = field.find("bg_pos_nul"), bgM = bgPos ? field.worldAtRest(bgPos) : [1, 0, 0, 1, 0, 0];
      var party = [1, 2, 3, 4, 5, 6].map(function (i) { return field.find("player_pos_nul_0" + i); }).filter(Boolean);
      // frame the field: the background's own extent and every slot in use
      var box = null;
      if (bgScene) {
        bgScene.reset(idleTag(bgScene));
        var e = extent(bgScene, lib, 120);
        if (e) { var c0 = apply(bgM, e[0], e[1]), c1 = apply(bgM, e[2], e[3]); box = [c0[0], c0[1], c1[0], c1[1]]; }
        bgScene.reset(idleTag(bgScene));
      }
      actors.map(function (a) { return a.slot; }).concat(party).forEach(function (n) {
        var q = apply(field.worldAtRest(n), 0, 0), r = [q[0] - 60, q[1] - 90, q[0] + 60, q[1] + 25];
        box = box ? [Math.min(box[0], r[0]), Math.min(box[1], r[1]), Math.max(box[2], r[2]), Math.max(box[3], r[3])] : r;
      });
      stage.fit(box);
      var last = 0;
      function frame(ts) {
        if (!alive || !holder.isConnected) return;
        if (!last || ts - last >= 1000 / 60) {
          last = ts;
          stage.clear();
          if (bgScene) { restartIfDone(bgScene); bgScene.step(); drawScene(stage, bgScene, lib, { keep: true, m: bgM }); }
          party.forEach(function (q, i) {
            stage.box({ blend: "add" }, field.worldAtRest(q), 0.5, { tint: [1, 1, 1] }, [-16, -40, 32, 40], "party " + (i + 1), "image");
          });
          mains.forEach(function (m) { restartIfDone(m); m.step(); });
          actors.forEach(function (a) {
            restartIfDone(a.scene);
            a.scene.step();
            var m = mul(field.worldAtRest(a.slot), a.main.relative(a.mainTop, a.pos));
            drawScene(stage, a.scene, lib, { keep: true, from: a.top, m: m });
          });
        }
        requestAnimationFrame(frame);
      }
      window.addEventListener("hashchange", function stop() { alive = false; window.removeEventListener("hashchange", stop); });
      requestAnimationFrame(frame);
    });
  }
  // ------------------------------------------------------------ a dungeon's map
  // The client's _locatePlatformViews: the platforms climb from the exit; a plain battle alternates between x 220 and
  // x 90, 70 higher each; a boss battle sits at x 160, 90 higher, with 65 more after it; 30 more after the exit and 25
  // after a boss. Bridges alternate left and right, steep beside a boss, shallow otherwise.
  function dungeonMap(holder, d, helpers) {
    H = helpers;
    var esc = H.esc, plats = [{ exit: true, name: "Exit" }].concat(d.battles.map(function (b, i) {
      return { name: b.name || ("Battle " + (i + 1)), boss: !!b.boss, stamina: b.stamina, id: b.id, uncaptured: !!b.uncaptured };
    }));
    var x = 0, y = 0, n = 0;
    plats.forEach(function (pf, g) {
      var prev = plats[g - 1], shallow = !((prev && prev.boss) || pf.boss);
      if (pf.boss) { x = 160; y -= 90; }
      else { x = pf.exit ? 278 : [220, 90][n % 2]; y -= 70; if (prev && prev.boss) y -= 25; if (prev && prev.exit) y -= 30; }
      if (!pf.exit) pf.bridge = { side: n % 2 === 0 ? "left" : "right", shallow: shallow };
      n++;
      if (!shallow) y -= 65;
      pf.x = x; pf.y = y;
    });
    var bottom = Math.max.apply(null, plats.map(function (q) { return q.y; })) + 40;
    var top = y - 70, h = bottom - top, W = 320;
    var scale = Math.max(1, Math.min(1.5, (holder.clientWidth || 480) / W));
    var c = document.createElement("canvas"), dpr = window.devicePixelRatio || 1;
    c.width = W * scale * dpr; c.height = h * scale * dpr; c.style.width = W * scale + "px"; c.style.height = h * scale + "px";
    c.className = "dmap";
    var ctx = c.getContext("2d");
    ctx.scale(dpr * scale, dpr * scale);
    ctx.translate(0, -top);
    // bridges: from each platform to the one below it (dashed: the steep kind, beside a boss)
    plats.forEach(function (pf, g) {
      var below = plats[g - 1];
      if (!below) return;
      ctx.beginPath(); ctx.moveTo(below.x, below.y); ctx.lineTo(pf.x, pf.y);
      ctx.setLineDash(pf.bridge && !pf.bridge.shallow ? [6, 4] : []);
      ctx.strokeStyle = "rgba(160,140,100,.8)"; ctx.lineWidth = pf.bridge && !pf.bridge.shallow ? 3 : 5; ctx.stroke();
    });
    ctx.setLineDash([]); ctx.lineWidth = 1.5;
    var bgc = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#fff";
    plats.forEach(function (pf) {
      var w = pf.boss ? 110 : pf.exit ? 64 : 80, hh = pf.boss ? 40 : 28;
      var col = pf.boss ? "rgba(196,61,47," : pf.exit ? "rgba(128,128,128," : "rgba(47,91,211,";
      ctx.beginPath(); ctx.ellipse(pf.x, pf.y, w / 2, hh / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = bgc; ctx.fill();
      ctx.fillStyle = col + ".28)"; ctx.fill(); ctx.strokeStyle = col + ".9)";
      ctx.setLineDash(pf.uncaptured ? [5, 4] : []); ctx.stroke(); ctx.setLineDash([]);
    });
    // names and stamina as page text over the drawing: names wrap instead of being cut, and link to the battle
    var wrap = document.createElement("div");
    wrap.className = "dmapwrap";
    wrap.style.width = W * scale + "px";
    wrap.appendChild(c);
    plats.forEach(function (pf) {
      var px = pf.x * scale, py = (pf.y - top) * scale;
      if (pf.stamina || pf.exit) {
        var badge = document.createElement("span");
        badge.className = "dstam" + (pf.exit ? " dexit" : "");
        badge.textContent = pf.exit ? "Exit" : pf.stamina;
        if (!pf.exit) badge.title = "stamina " + pf.stamina;
        badge.style.left = px + "px"; badge.style.top = py + "px";
        wrap.appendChild(badge);
      }
      if (pf.exit) return;
      var label = document.createElement(pf.id ? "a" : "span");
      label.className = "dlabel" + (pf.boss ? " dboss" : "");
      if (pf.id) label.href = "#/battle/" + pf.id;
      label.textContent = pf.name;
      if (pf.boss) {             // centred above its platform
        label.style.left = (pf.x - 140) * scale + "px"; label.style.width = 280 * scale + "px";
        label.style.top = (pf.y - top - 24) * scale + "px"; label.style.transform = "translateY(-100%)"; label.style.textAlign = "center";
      } else if (pf.x < 160) {   // a left platform: its name to the right
        label.style.left = (pf.x + 46) * scale + "px"; label.style.width = (W - pf.x - 50) * scale + "px";
        label.style.top = py + "px"; label.style.transform = "translateY(-50%)";
      } else {                   // a right platform: its name to the left
        label.style.left = 4 + "px"; label.style.width = (pf.x - 50) * scale - 4 + "px";
        label.style.top = py + "px"; label.style.transform = "translateY(-50%)"; label.style.textAlign = "right";
      }
      wrap.appendChild(label);
    });
    var m = d.map || {};
    holder.innerHTML = "";
    holder.appendChild(wrap);
    holder.insertAdjacentHTML("beforeend", '<p class="prov">Platforms placed by the game\u2019s own rule (exit at the bottom, climbing up); ' +
      "each badge is the battle\u2019s stamina cost; a dashed platform is a battle whose layout hasn\u2019t been captured. " +
      "Platform style " + esc(m.platform_style || "") + ' (<a class="mono" href="' + link(m.platform_scene || "") + '">' + esc(baseName(m.platform_scene || "")) + "</a>)" +
      (m.background ? ' · background picture <span class="mono">' + esc(m.background) + "</span>" : "") + "</p>");
  }

  function soundList(list) {
    return (list || []).map(function (x) {
      return '<span class="chip mono" title="' + H.esc(x.file) + (x.at ? " \u00b7 frames " + x.at.join(", ") : "") + '">\u266a ' + H.esc(baseName(x.file)) + "</span>";
    }).join("");
  }

  window.Motion = {
    stage: stageEncounter, map: dungeonMap, scoreFile: scoreFile,
    sounds: function (list, helpers) { if (!H) H = helpers; return soundList(list); },
    link: link, scoreable: scoreable,
    page: function (app, helpers, rest) {
      H = helpers;
      if (!rest) return libraryPage(app);
      H.load("motion/" + rest).then(function (sc) {
        if (sc.kind === "scene") scenePage(app, sc, rest);
        else if (sc.kind === "flipbook") flipbookPage(app, sc, rest);
        else sheetPage(app, sc, rest);
      }).catch(function () {
        app.innerHTML = H.crumbs([["#/motion", "Motion library"], [null, rest]]) + "<h1>Not held</h1><p class=\"muted\">No score for <span class=\"mono\">" + H.esc(rest) +
          "</span>: the archive doesn’t hold that file yet.</p>";
      });
    }
  };
})();
