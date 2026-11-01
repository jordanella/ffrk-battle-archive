// FFRK Battle Archive: a static browser over site/data/ (tools/browser/export.py).
// Drill-down: EVENT TYPE > CATEGORY > LOCATION > ENCOUNTER (its rounds and their monsters) > ENEMY INSTANCE.
(function () {
  "use strict";
  var app = document.getElementById("app");
  var cache = {};
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]; }); };
  function load(path) {
    if (!cache[path]) cache[path] = fetch("data/" + path).then(function (r) { if (!r.ok) throw new Error(path); return r.json(); });
    return cache[path];
  }
  function pref(k, v) {   // per-viewer conveniences (theme, Classic / Elite)
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
  }
  var themeBtn = document.getElementById("theme");
  if (pref("theme")) document.documentElement.dataset.theme = pref("theme");
  themeBtn.onclick = function () {
    var dark = document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    pref("theme", document.documentElement.dataset.theme);
  };

  function badge(kind, text) { return '<span class="badge ' + kind + '">' + esc(text || kind) + "</span>"; }
  function bar(held, files) {
    var pct = files ? Math.round(100 * held / files) : 100;
    return '<div class="bar" title="animation files held: ' + held + " / " + files + '"><i style="width:' + pct + '%"></i></div>';
  }
  function crumbs(list) {
    return '<div class="crumbs">' + [["#/", "Archive"]].concat(list).map(function (c) {
      return c[0] ? '<a href="' + c[0] + '">' + esc(c[1]) + "</a>" : esc(c[1]);
    }).join(" › ") + "</div>";
  }
  function tabs(holder) {
    holder.querySelectorAll(".tabs button").forEach(function (btn) {
      btn.onclick = function () {
        holder.querySelectorAll(".tabs button").forEach(function (x) { x.classList.toggle("on", x === btn); });
        holder.querySelectorAll("[data-p]").forEach(function (p) { p.hidden = p.dataset.p !== btn.dataset.t; });
        if (btn.onshow) btn.onshow();
        window.dispatchEvent(new Event("resize"));
      };
    });
  }
  function typeLink(t) { return "#/type/" + encodeURIComponent(t); }

  // the index, with lookups: battle id -> where it sits
  var where = null;
  function indexed() {
    return load("index.json").then(function (index) {
      if (!where) {
        where = {};
        index.events.forEach(function (e) {
          e.dungeons.forEach(function (d) { d.battles.forEach(function (b, i) {
            where[b.id] = { type: e.category === "Realm events" ? "Realms" : e.category, cat: ["#/event/" + e.id, e.name], loc: d.name, locHref: "#/event/" + e.id, name: b.enemies.join(", ") || ("Battle " + (i + 1)) };
          }); });
        });
        (index.realms || []).forEach(function (r) { r.dungeons.forEach(function (d) { d.battles.forEach(function (b) {
          where[b.id] = { type: "Realms", cat: ["#/realm/" + r.id, r.name], loc: d.name + " (" + d.difficulty + ")", locHref: "#/realm/" + r.id + "/" + d.classic_id, name: b.name };
        }); }); });
      }
      return index;
    });
  }

  // ----- EVENT TYPES
  function home(index) {
    var c = index.counts;
    var types = (index.types || []).map(function (t) {
      var n = t === "Realms" ? (index.realms || []).length + " realms" :
        index.events.filter(function (e) { return e.category === t; }).length + " events";
      return '<a class="card typecard" href="' + typeLink(t) + '"><b>' + esc(t) + '</b><span class="muted">' + n + "</span></a>";
    }).join("");
    app.innerHTML = "<h1>FFRK Battle Archive</h1>" +
      '<p class="muted">Final Fantasy Record Keeper\'s battles: where they happen, who is in them, what each enemy does and how its AI decides, ' +
      "from battles players captured and battles rebuilt from their detailed write-ups.</p>" +
      '<div class="stats">' + [["dungeons", c.dungeons], ["battles", c.battles], ["enemies", c.enemies], ["events", c.events]]
        .map(function (s) { return '<div class="stat"><b>' + s[1] + "</b><span>" + s[0] + "</span></div>"; }).join("") + "</div>" +
      '<div class="grid">' + types + "</div>" +
      '<p class="prov" style="margin-top:22px"><a href="#/motion">Motion library</a>: every animation the battles use, played as boxes from our picture-free motion scores. ' +
      '<a href="#/wishlist">Capture wish-list</a>: the battles, AI scripts and files still to be captured.</p>';
  }

  // ----- CATEGORIES of a type
  function typePage(index, type) {
    var cards;
    if (type === "Realms") {
      cards = (index.realms || []).map(function (r) {
        return '<a class="card typecard" href="#/realm/' + r.id + '"><b>' + esc(r.name) + '</b><span class="muted">' + r.locations.length + " locations" +
          (r.events.length ? " · " + r.events.length + " event" + (r.events.length > 1 ? "s" : "") : "") + "</span></a>";
      }).join("") + (index.events.some(function (e) { return e.realm_id === "other"; }) ?
        '<a class="card typecard" href="#/realm/other"><b>Other realms</b><span class="muted">Kingdom Hearts, World of the Gods, Dissidia, Tactics Advance</span></a>' : "");
    } else {
      cards = index.events.filter(function (e) { return e.category === type; }).map(function (e) {
        var files = 0, held = 0, battles = 0;
        e.dungeons.forEach(function (d) { d.battles.forEach(function (b) { battles++; files += b.animation.files; held += b.animation.held; }); });
        return '<a class="card typecard" href="#/event/' + e.id + '"><b>' + esc(e.name) + "</b> " + badge(e.kind) +
          '<span class="muted">' + e.dungeons.length + " locations · " + battles + " encounters</span>" + bar(held, files) + "</a>";
      }).join("");
    }
    app.innerHTML = crumbs([[null, type]]) + "<h1>" + esc(type) + '</h1><div class="grid">' + cards + "</div>";
  }

  // ----- LOCATIONS of a category
  function encounterList(battles) {
    return '<div class="encs">' + battles.map(function (b, i) {
      return '<a class="enc' + (b.uncaptured ? " uncaptured" : "") + '" href="#/battle/' + b.id + '"><b>' + esc(b.name || ("Battle " + (i + 1))) + "</b>" +
        (b.boss ? " " + badge("boss") : "") + (b.uncaptured ? " " + badge("capture", "needs capture") : "") +
        "<small>" + esc(b.enemies.join(", ")) + "</small></a>";
    }).join("") + "</div>";
  }
  function needCount(d) {
    var n = d ? d.battles.filter(function (b) { return b.uncaptured; }).length : 0;
    return n ? " " + badge("capture", n === d.battles.length ? "needs capture" : n + " of " + d.battles.length + " battles need capturing") : "";
  }
  function realmPage(index, id, focus) {
    var r = (index.realms || []).filter(function (x) { return x.id === id; })[0];
    var evs = index.events.filter(function (e) { return id === "other" ? e.realm_id === "other" : e.realm_id === id; });
    var diff = pref("difficulty") || "classic";
    var name = r ? r.name : "Other realms";
    function draw() {
      var locs = (r ? r.locations : []).map(function (l) {
        var d = l[diff] || l.classic || l.elite;
        return '<div class="card loc' + (focus === l.id ? " focus" : "") + '" id="loc-' + l.id + '"><div class="loc-head"><b>' + esc(l.name) + "</b>" +
          (d ? ' <span class="muted">Lv ' + esc(d.level) + " · stamina " + esc(d.stamina) + "</span>" : "") +
          (l[diff] ? "" : ' <span class="muted">(no ' + diff + " version)</span>") + needCount(d) + "</div>" +
          (d ? '<div class="prov">' + esc(d.layout) + ' <button class="stagebtn mapbtn" data-d="' + esc(d.id) + '">Map</button></div><div class="maphold"></div>' +
            encounterList(d.battles) : "") + "</div>";
      }).join("");
      var events = evs.map(function (e) { return '<a class="card typecard" href="#/event/' + e.id + '"><b>' + esc(e.name) + "</b> " + badge(e.kind) +
        '<span class="muted">' + e.dungeons.length + " locations</span></a>"; }).join("");
      app.innerHTML = crumbs([[typeLink("Realms"), "Realms"], [null, name]]) + "<h1>" + esc(name) + "</h1>" +
        (r ? '<div class="toggle"><button data-d="classic"' + (diff === "classic" ? ' class="on"' : "") + '>Classic</button><button data-d="elite"' +
          (diff === "elite" ? ' class="on"' : "") + ">Elite</button></div>" : "") +
        (locs ? "<h2>Story</h2>" + locs : "") + (events ? '<h2>Events</h2><div class="grid">' + events + "</div>" : "");
      app.querySelectorAll(".toggle button").forEach(function (b) { b.onclick = function () { diff = b.dataset.d; pref("difficulty", diff); draw(); }; });
      mapButtons((r ? r.locations : []).map(function (l) { return l[diff] || l.classic || l.elite; }));
      if (focus) { var el = document.getElementById("loc-" + focus); if (el) el.scrollIntoView({ block: "center" }); }
    }
    draw();
  }
  function eventPage(index, id) {
    var e = index.events.filter(function (x) { return x.id === id; })[0];
    if (!e) return notFound();
    var type = e.category === "Realm events" ? "Realms" : e.category;
    var trail = [[typeLink(type), type]];
    if (e.realm_id && e.realm_id !== "null") trail.push(["#/realm/" + e.realm_id, ((index.realms || []).filter(function (r) { return r.id === e.realm_id; })[0] || { name: "Other realms" }).name]);
    app.innerHTML = crumbs(trail.concat([[null, e.name]])) + "<h1>" + esc(e.name) + " " + badge(e.kind) + "</h1>" +
      e.dungeons.map(function (d) {
        return '<div class="card loc"><div class="loc-head"><b>' + esc(d.name) + '</b> <span class="muted">Lv ' + esc(d.level) + " · stamina " + esc(d.stamina) + "</span>" +
          ' <button class="stagebtn mapbtn" data-d="' + esc(d.id) + '">Map</button></div><div class="maphold"></div>' +
          encounterList(d.battles.map(function (b, i) { return { id: b.id, name: d.battles.length > 1 ? "Battle " + (i + 1) : b.enemies.join(", "), enemies: b.enemies }; })) + "</div>";
      }).join("");
    mapButtons(e.dungeons);
  }
  // a dungeon's map: its battles as the game lays out their platforms
  function mapButtons(dungeons) {
    var byId = {};
    dungeons.forEach(function (d) { if (d) byId[d.id] = d; });
    app.querySelectorAll(".mapbtn").forEach(function (btn) {
      btn.onclick = function () {
        var hold = btn.closest(".loc").querySelector(".maphold");
        if (hold.innerHTML) { hold.innerHTML = ""; btn.textContent = "Map"; return; }
        btn.textContent = "Hide map";
        window.Motion.map(hold, byId[btn.dataset.d], { esc: esc, crumbs: crumbs, load: load });
      };
    });
  }

  // ----- ENCOUNTER: its rounds and their monsters
  function encounterTrail(b) {
    var w = where[b.id] || {};
    var trail = [[typeLink(w.type || "Realms"), w.type || ""], w.cat || [null, ""], [w.locHref || null, w.loc || b.dungeon]];
    return trail;
  }
  function battlePage(id) {
    Promise.all([load("battles/" + id + ".json"), indexed()]).then(function (res) {
      var b = res[0], w = where[b.id] || {};
      var rounds = b.rounds.map(function (r, ri) {
        if (b.layout_known === false) return '<div class="round"><div class="round-head">Monsters in this dungeon</div>' +
          '<p class="muted small">Which battle and round each one appears in hasn\u2019t been captured.</p><div class="monsters">' +
          r.groups.map(function (g, gi) { return g.enemies.map(function (e, ei) {
            return '<a class="monster' + (g.is_boss ? " boss" : "") + '" href="#/battle/' + b.id + "/" + ri + "/" + gi + "/" + ei + '"><b>' + esc(e.name) + "</b>" +
              (g.is_boss ? " " + badge("boss") : "") + "</a>"; }).join(""); }).join("") + "</div></div>";
        return '<div class="round"><div class="round-head">' + (b.rounds.length > 1 ? "Round " + esc(r.round || ri + 1) : "Enemies") +
          (r.music ? ' <span class="chip mono" title="' + esc(r.music.file) + '">♫ ' + esc(r.music.file.replace(/^.*\//, "")) + "</span>" : "") +
          ' <button class="stagebtn" data-r="' + ri + '">▶ Stage</button></div><div class="stagehold" data-r="' + ri + '"></div><div class="monsters">' +
          r.groups.map(function (g, gi) {
            return g.enemies.map(function (e, ei) {
              return '<a class="monster' + (g.is_boss ? " boss" : "") + '" href="#/battle/' + b.id + "/" + ri + "/" + gi + "/" + ei + '"><b>' + esc(e.name) + "</b>" +
                (g.is_boss ? " " + badge("boss") : "") + '<small>Lv ' + esc((e.forms[0] || {}).lv) + " · HP " + esc((e.forms[0] || {}).hp) +
                (e.forms.length > 1 ? " · " + e.forms.length + " forms" : "") + "</small></a>";
            }).join("");
          }).join("") + "</div></div>";
      }).join("");
      app.innerHTML = crumbs(encounterTrail(b).concat([[null, w.name || b.battle_name || "Encounter"]])) +
        "<h1>" + esc(w.name || b.battle_name || b.enemies.join(", ")) + " " + badge(b.provenance.kind) +
        (b.layout_known === false ? " " + badge("capture", "needs capture") : "") + "</h1>" +
        '<p class="prov">' + esc(b.provenance.about) + (b.provenance.source ? " · source: " + esc(b.provenance.source) : "") + "</p>" +
        (b.layout_known === false ? '<div class="card"><b>Layout not captured yet</b><p class="small">The battle\u2019s name and place in the dungeon are real; ' +
          "its rounds and enemies are not known, so none are shown rather than guessed.</p>" +
          (b.pool_names && b.pool_names.length ? '<div class="chips">' + b.pool_names.map(function (n) { return '<span class="chip">' + esc(n) + "</span>"; }).join("") + "</div>" : "") +
          "</div>" : "") + rounds + (b.layout_known === false ? "" : stageInfo(b) +
        '<p class="prov">' + b.animation.held + " of " + b.animation.files + " animation files this encounter names are held." + bar(b.animation.held, b.animation.files) + "</p>");
      app.querySelectorAll(".stagebtn").forEach(function (btn) {
        btn.onclick = function () {
          var hold = app.querySelector('.stagehold[data-r="' + btn.dataset.r + '"]');
          if (hold.innerHTML) { hold.innerHTML = ""; btn.textContent = "▶ Stage"; return; }
          btn.textContent = "Hide stage";
          window.Motion.stage(hold, b, +btn.dataset.r, { esc: esc, crumbs: crumbs, load: load });
        };
      });
      var first = app.querySelector(".stagebtn");
      if (first && b.stage && b.layout_known !== false) first.onclick();
    }).catch(notFound);
  }
  function stageInfo(b) {
    var st = b.stage;
    if (!st) return "";
    var bg = (st.background || []).map(function (x) {
      return fileRow(x.path, x.held) + (x.sounds && x.sounds.length ? ' <span class="chips">' + window.Motion.sounds(x.sounds, { esc: esc }) + "</span>" : "");
    }).join("<br>");
    return '<div class="card"><b>Stage</b><div class="small">Background: ' + (bg || '<span class="muted">none named</span>') +
      (st.background_effects.length ? " · background effects " + esc(st.background_effects.join(", ")) : "") +
      "<br>Battle field: " + fileRow(st.field, st.field_held) +
      (st.victory_music ? '<br>Victory music: <span class="mono" title="' + esc(st.victory_music.file) + '">' + esc(st.victory_music.file) + "</span>" : "") +
      '</div><p class="prov">Music and sounds are listed by name and file path only.</p></div>';
  }

  // ----- ENEMY INSTANCE
  function resistChips(r) {
    var out = [];
    ["weak", "resist", "null", "absorb"].forEach(function (k) { (r[k] || []).forEach(function (x) { out.push('<span class="chip ' + k + '">' + k + " " + esc(x) + "</span>"); }); });
    (r.other || []).forEach(function (x) { out.push('<span class="chip">' + esc(x) + "</span>"); });
    var immune = r.immune || [];
    return (out.length ? '<div class="chips">' + out.join("") + "</div>" : "") +
      (immune.length ? '<div class="chips"><span class="chip immune">immune</span>' + immune.map(function (x) { return '<span class="chip">' + esc(x) + "</span>"; }).join("") + "</div>" : "");
  }
  function overview(e, g) {
    var forms = e.forms.length;
    var stat = "<tr><th>Form</th>" + ["Lv", "HP", "ATK", "DEF", "MAG", "RES", "MND", "SPD", "ACC", "EVA"].map(function (h) { return '<th class="num">' + h + "</th>"; }).join("") + "</tr>" +
      e.forms.map(function (f, i) { return "<tr><td>Form " + (i + 1) + "</td>" + ["lv", "hp", "atk", "def", "mag", "res", "mnd", "spd", "acc", "eva"].map(function (k) { return '<td class="num">' + esc(f[k]) + "</td>"; }).join("") + "</tr>"; }).join("");
    var fh = ""; for (var i = 1; i <= forms; i++) fh += '<th class="num">F' + i + "</th>";
    var moves = e.moves.map(function (m) {
      if (m.missing) return '<tr><td colspan="' + (3 + forms) + '" class="missing">move ' + esc(m.id) + " not in this battle's data</td></tr>";
      var w = ""; for (var i = 1; i <= forms; i++) { var v = m.weights[String(i)]; w += '<td class="num">' + (v === undefined ? "" : v === 0 ? "AI" : v) + "</td>"; }
      return "<tr><td><b>" + esc(m.name) + '</b><div class="mono muted">id ' + esc(m.id) + " · action " + esc(m.action) + "</div></td><td>" + esc(m.school) + "</td><td>" + esc(m.notation) + "</td>" + w + "</tr>";
    }).join("");
    var settings = g.ai_settings.length ? '<p class="prov">Battle AI settings: ' + g.ai_settings.map(function (s) { return '<span class="mono">' + esc(s.key) + " = " + esc(s.value) + "</span>"; }).join(" · ") + "</p>" : "";
    return resistChips(e.resistances) + '<div class="scroll"><table>' + stat + "</table></div>" +
      '<div class="scroll" style="margin-top:12px"><table><tr><th>Move</th><th>School</th><th>Effect</th>' + fh + "</tr>" + moves + "</table></div>" +
      '<p class="prov">Weights per form (F1…); "AI" marks a move its AI uses by its own rules.</p>' + settings + completeData(e);
  }
  function fileRow(path, held) {
    var name = held && window.Motion.scoreable(path) ? '<a class="mono" href="' + window.Motion.link(path) + '">' + esc(path) + "</a>" : '<span class="mono">' + esc(path) + "</span>";
    return name + ' <span class="' + (held ? "held" : "missing") + '">' + (held ? "held" : "needed") + "</span>";
  }
  function animation(e) {
    var forms = {}; (e.form_changes || []).forEach(function (f) { forms[f.tag] = 1; });
    var sprite = e.sprite.map(function (sp) {
      var c = sp.contents;
      return '<div class="card anim"><b>Sprite</b> <span class="muted mono">' + esc(sp.key) + "</span><div>" + fileRow(sp.path, sp.held) + "</div>" +
        (sp.sounds && sp.sounds.length ? '<div class="sub"><b>Sound effects its timeline plays</b><div class="chips">' + window.Motion.sounds(sp.sounds, { esc: esc }) + "</div></div>" : "") +
        '<div class="prov">placement: ' + Object.keys(e.placement || {}).map(function (k) { return esc(k) + " " + esc(e.placement[k]); }).join(" · ") + "</div>" +
        (c ? '<div class="sub"><b>Animations it contains</b><div class="chips">' + c.animations.map(function (a) {
              return '<span class="chip' + (forms[a] ? " immune" : "") + '">' + esc(a) + "</span>"; }).join("") + "</div></div>" +
             (c.parts.length ? '<div class="sub"><b>Textures and sub-animations</b>' + c.parts.map(function (x) { return "<div>" + fileRow(x.path, x.held) + "</div>"; }).join("") + "</div>" : "")
           : '<p class="muted">Its contents can be listed once the file is held.</p>') + "</div>";
    }).join("");
    var moves = e.moves.filter(function (m) { return !m.missing && m.detail; }).map(function (m) {
      var a = m.detail.animation, files = {};
      var sounds = {};
      (m.animation.files || []).forEach(function (f) { files[f.path.replace(/^.*\/ab\/ability\//, "")] = f.held; sounds[f.path.replace(/^.*\/ab\/ability\//, "")] = f.sounds || []; });
      var ph = a.phases.map(function (x) {
        var held = files[x.file];
        return '<div class="phase-box"><div class="cond">' + esc(x.phase) + "</div>" +
          (x.file ? '<div class="mono">' + (held && /\.json$/.test(x.file) ? '<a href="' + window.Motion.link("/Content/lang/ab/ability/" + x.file) + '">' + esc(x.file) + "</a>" : esc(x.file)) + "</div>" + (held === undefined ? "" : '<div class="' + (held ? "held" : "missing") + '">' + (held ? "held" : "needed") + "</div>") : '<div class="muted">no file</div>') +
          (sounds[x.file] && sounds[x.file].length ? '<div class="chips">' + window.Motion.sounds(sounds[x.file], { esc: esc }) + "</div>" : "") +
          '<div class="muted small">type ' + esc(x.type) + (x.sprites && x.sprites !== "0" ? " · " + esc(x.sprites) + " sprites" : "") + (x.particles ? " · particles " + esc(x.particles) : "") + "</div></div>";
      }).join('<div class="arrow">→</div>');
      return '<div class="card anim"><b>' + esc(m.name) + '</b> <span class="muted mono">animation ' + esc(a.id) + (a.motion ? " · motion " + esc(a.motion) : "") +
        (a.damage_tag ? " · " + esc(a.damage_tag) : "") + '</span><div class="flow">' + ph + "</div></div>";
    }).join("");
    var all = [];
    e.sprite.forEach(function (sp) { all.push(sp.held); ((sp.contents || {}).parts || []).forEach(function (x) { all.push(x.held); }); });
    e.moves.forEach(function (m) { (m.animation && m.animation.files || []).forEach(function (f) { all.push(f.held); }); });
    var held = all.filter(Boolean).length;
    return '<p><b>' + held + " of " + all.length + " files held</b></p>" + bar(held, all.length) + sprite + moves +
      '<p class="prov">"needed": a file no archive holds yet. Everything still needed is on the <a href="#/wishlist">capture wish-list</a>.</p>';
  }
  function completeData(e) {
    var rows = e.moves.filter(function (m) { return m.detail; }).map(function (m) {
      var d = m.detail;
      return '<details><summary><b>' + esc(m.name) + '</b> <span class="muted mono">' + esc(m.id) + " · " + esc(d.action_class || "action " + m.action) + "</span></summary>" +
        '<table class="kv">' + d.args.map(function (x) { return '<tr><td class="mono">' + esc(x.arg) + "</td><td>" + esc(x.name || "") + '</td><td class="mono">' + esc(x.value) + "</td></tr>"; }).join("") +
        Object.keys(d.fields).map(function (k) { return '<tr><td class="mono" colspan="2">' + esc(k) + '</td><td class="mono">' + esc(d.fields[k]) + "</td></tr>"; }).join("") + "</table></details>";
    }).join("");
    var attrs = (e.attributes.def || []).map(function (x) { return esc(x.attribute_id) + "×" + esc(x.factor); }).join(", ");
    return '<details class="complete"><summary>Complete data (for rebuilding the battle)</summary>' +
      '<table class="kv">' + Object.keys(e.other || {}).map(function (k) { return '<tr><td class="mono">' + esc(k) + '</td><td class="mono">' + esc(e.other[k]) + "</td></tr>"; }).join("") +
      '<tr><td class="mono">def_attributes</td><td class="mono">' + attrs + "</td></tr>" +
      (e.counters.length ? '<tr><td class="mono">counters</td><td class="mono">' + e.counters.map(function (c) { return esc(c.ability_id) + " (" + esc(c.weight) + ")"; }).join(", ") + "</td></tr>" : "") +
      "</table>" + rows + "</details>";
  }
  function wishlist() {
    Promise.all([load("wishlist.json"), indexed()]).then(function (res) {
      var w = res[0], layouts = w.layouts || [], ai = w.ai || [], files = w.files || [];
      var nBattles = layouts.reduce(function (n, d) { return n + d.battles.length; }, 0);
      var byRealm = {};
      layouts.forEach(function (d) { (byRealm[d.realm] = byRealm[d.realm] || []).push(d); });
      var realmsHtml = Object.keys(byRealm).map(function (realm) {
        var ds = byRealm[realm], n = ds.reduce(function (k, d) { return k + d.battles.length; }, 0);
        return "<details><summary><b>" + esc(realm) + '</b> <span class="muted">' + ds.length + " dungeons \u00b7 " + n + " battles</span></summary>" +
          '<div class="scroll"><table><tr><th>Dungeon</th><th>Battles not captured</th><th>Monsters known</th></tr>' + ds.map(function (d) {
            return '<tr><td><a href="#/realm/' + esc(d.realm_id) + "/" + esc(d.classic_id) + '">' + esc(d.dungeon) + "</a> <span class=\"muted\">" + esc(d.difficulty) + "</span></td><td>" +
              d.battles.map(function (b) { return '<a href="#/battle/' + esc(b.id) + '">' + esc(b.name) + "</a>" + (b.boss ? " " + badge("boss") : ""); }).join("<br>") +
              '</td><td class="small">' + esc(d.monsters.slice(0, 8).join(", ")) + (d.monsters.length > 8 ? " \u2026" : "") +
              ' <span class="muted">(' + esc(d.monsters_known) + ")</span></td></tr>";
          }).join("") + "</table></div></details>";
      }).join("");
      app.innerHTML = crumbs([[null, "Capture wish-list"]]) + "<h1>Capture wish-list</h1>" +
        '<p class="muted">What a capture would add to the archive. Playing a battle with a capture running records all of it at once: ' +
        "its rounds, its enemies with their stats and moves, and the files it names.</p>" +
        "<h2>Battles not captured yet</h2>" +
        '<p class="prov">' + nBattles + " battles in " + layouts.length + " story dungeons. Their names and places in each dungeon are known; " +
        "which enemies appear in which round is not, so the archive shows none rather than guess.</p>" + realmsHtml +
        "<h2>AI scripts</h2>" +
        (ai.length ? '<p class="prov">' + ai.length + " AI scripts that battles name but no archive holds.</p>" +
          '<div class="scroll"><table><tr><th>AI</th><th>Used by</th><th>Encounters</th></tr>' + ai.map(function (x) {
            return '<tr><td class="mono">' + esc(x.ai_id) + "</td><td>" + esc(x.enemies.join(", ")) + "</td><td>" +
              x.encounters.slice(0, 4).map(function (id) { return '<a href="#/battle/' + id + '">' + esc((where[id] || {}).name || id) + "</a>"; }).join(", ") + "</td></tr>";
          }).join("") + "</table></div>" : '<p class="muted">None outstanding.</p>') +
        "<h2>Game files</h2>" +
        (files.length ? '<p class="prov">' + files.length + " files the battles name that no archive holds yet. Paths are exactly what the game asks for.</p>" +
          '<div class="scroll"><table><tr><th>File</th><th>Kind</th><th class="num">Encounters</th><th class="num">Completes</th><th>Enemies</th></tr>' +
          files.slice(0, 600).map(function (f) {
            return '<tr><td class="mono">' + esc(f.path) + "</td><td>" + esc(f.kind) + '</td><td class="num">' +
              f.encounters.slice(0, 3).map(function (id) { return '<a href="#/battle/' + id + '">' + esc((where[id] || {}).name || id) + "</a>"; }).join(", ") +
              (f.encounter_count > 3 ? " +" + (f.encounter_count - 3) : "") + '</td><td class="num">' + (f.completes || "") + "</td><td>" + esc(f.enemies.slice(0, 4).join(", ")) + "</td></tr>";
          }).join("") + "</table></div>" : '<p class="muted">None outstanding: every animation, background and texture file the captured battles name is held.</p>');
    });
  }
  function enemyPage(id, ri, gi, ei) {
    Promise.all([load("battles/" + id + ".json"), indexed(), load("enemies.json")]).then(function (res) {
      var b = res[0], w = where[b.id] || {};
      var g = b.rounds[ri].groups[gi], e = g.enemies[ei];
      var ais = [];
      if (e.ai_id && !/^(0|1|2|3|None)$/.test(e.ai_id)) ais.push([e.ai_id, "Its AI"]);
      if (g.ai_id && !/^(0|None)$/.test(g.ai_id) && g.enemies.length > 1) ais.push([g.ai_id, "The AI of its group (" + g.enemies.map(function (x) { return x.name; }).join(", ") + ")"]);
      var seen = res[2][e.name] || [];
      app.innerHTML = crumbs(encounterTrail(b).concat([["#/battle/" + b.id, w.name || "Encounter"], [null, e.name]])) +
        "<h1>" + esc(e.name) + " " + (g.is_boss ? badge("boss") : "") + "</h1>" +
        '<p class="prov mono">enemy ' + esc(e.enemy_id) + (e.ai_id && e.ai_id !== "0" ? " · AI " + esc(e.ai_id) : "") + " · " + esc(b.provenance.kind) + "</p>" +
        '<div class="tabs"><button data-t="o" class="on">Overview</button><button data-t="ai">AI</button><button data-t="w">Write-up</button>' +
        '<button data-t="a">Animation</button><button data-t="s">Appears in (' + seen.length + ")</button></div>" +
        '<div data-p="o">' + overview(e, g) + "</div>" +
        '<div data-p="ai" hidden><div id="ai-holder"></div></div>' +
        '<div data-p="w" hidden><div class="writeup">' + (e.writeup_html || "") + '</div><p class="prov">In the notation the community\'s "Enemy Stats and AI" posts use; it converts back to the data.</p></div>' +
        '<div data-p="a" hidden>' + animation(e) + "</div>" +
        '<div data-p="s" hidden><div class="results">' + seen.map(function (bid) { var x = where[bid] || {}; return '<a href="#/battle/' + bid + '">' + esc((x.cat || [0, ""])[1]) + " › " + esc(x.loc) + " › " + esc(x.name) + "</a>"; }).join("") + "</div></div>";
      tabs(app);
      aiTab(ais, b, document.getElementById("ai-holder"));
      var fc = e.form_changes || [];
      if (fc.length) document.getElementById("ai-holder").insertAdjacentHTML("beforebegin",
        '<div class="card forms"><b>Form changes its AI asks for</b><table>' + fc.map(function (f) {
          var cls = f.status === "found" ? "held" : "missing";
          return '<tr><td class="mono">' + esc(f.tag) + "</td><td>" + esc(f.from) + '</td><td class="' + cls + '">' +
            (f.status === "found" ? "found in its sprite" : f.status === "files not held" ? "sprite not held yet: a capture would let this be checked" : "missing from its sprite files") + "</td></tr>";
        }).join("") + "</table></div>");
    }).catch(notFound);
  }

  // ----- AI
  function moveNamer(b) {
    var byTag = {}, byId = {};
    b.rounds.forEach(function (r) { r.groups.forEach(function (g) { g.enemies.forEach(function (e) { e.moves.forEach(function (m) {
      byId[m.id] = m.name; (m.tags || []).forEach(function (t) { byTag[t] = m.name; });
    }); }); }); });
    return function (x) { if (x == null) return "?"; var k = String(x); return byTag[k] || byId[k] || byId[k.replace(/^t/, "")] || k; };
  }
  function settingValue(b, key) {
    var v = null;
    b.rounds.forEach(function (r) { r.groups.forEach(function (g) { g.ai_settings.forEach(function (s) { if (s.key === key) v = s.value; }); }); });
    return v;
  }
  function templateChart(c, b) {
    var name = moveNamer(b);
    return '<div class="flow">' + c.phases.map(function (p, i) {
      var hp = p.hp != null ? p.hp : (p.hp_setting ? settingValue(b, p.hp_setting) : null);
      var cond = i === 0 ? "start of battle" : (hp != null ? "at " + hp + "% HP or below" : (p.hp_setting ? "AI setting " + p.hp_setting : "by its own rule"));
      return '<div class="phase"><div class="cond">' + esc(cond) + "</div><b>Form " + esc(p.form) + "</b>" +
        (p.on_enter.length ? '<div class="sub">On entering: ' + p.on_enter.map(function (x) { return esc(name(x)); }).join(", ") + "</div>" : "") +
        (p.forced.length ? '<div class="sub">Forced: ' + p.forced.map(function (f) { return esc(name(f.move)) + " on turn " + esc(f.turn) + (f.every ? ", then every " + esc(f.every) : ""); }).join("; ") + "</div>" : "") +
        '<div class="sub muted">otherwise its weighted moves</div>' + (p.stops ? '<div class="sub muted">stops here</div>' : "") + "</div>";
    }).join('<div class="arrow">→</div>') + "</div>" +
      (c.on_start.length ? '<p class="prov">At the start of battle: ' + c.on_start.map(function (x) { return esc(name(x)); }).join(", ") + "</p>" : "") +
      (c.on_death.length ? '<p class="prov">On death: ' + c.on_death.map(function (x) { return esc(name(x)); }).join(", ") + "</p>" : "") +
      '<p class="prov">The game’s ' + esc(c.template) + " template" + (c.custom_helpers.length ? ", with custom rules (" + c.custom_helpers.map(esc).join(", ") + ")" : "") + ".</p>";
  }
  function flowHtml(nodes) {
    if (!nodes || !nodes.length) return '<div class="fl-step muted">nothing</div>';
    return nodes.map(function (n) {
      var calls = (n.calls || []).map(function (c) { return ' <a class="fl-call" data-helper="' + esc(c) + '">→ ' + esc(c) + "</a>"; }).join("");
      if (n.t === "decision") return '<div class="fl-dec"><div class="fl-diamond">' + esc(n.text) + "?</div>" +
        '<div class="fl-branches"><div class="fl-branch"><div class="fl-label">yes</div>' + flowHtml(n.yes) + "</div>" +
        (n.no.length ? '<div class="fl-branch"><div class="fl-label">no</div>' + flowHtml(n.no) + "</div>" : "") + "</div></div>";
      if (n.t === "loop") return '<div class="fl-loop"><div class="fl-label">' + esc(n.text) + "</div>" + flowHtml(n.body) + "</div>";
      if (n.t === "switch") return '<div class="fl-dec"><div class="fl-diamond">depending on ' + esc(n.text) + '</div><div class="fl-branches">' +
        n.cases.map(function (c) { return '<div class="fl-branch"><div class="fl-label">' + esc(c.label) + "</div>" + flowHtml(c.body) + "</div>"; }).join("") + "</div></div>";
      if (n.t === "end") return '<div class="fl-end">' + esc(n.text) + calls + "</div>";
      return '<div class="fl-step">' + esc(n.text) + calls + "</div>";
    }).join('<div class="fl-link"></div>');
  }
  function hooksHtml(hooks) {
    return hooks.map(function (h) {
      return '<div class="fl-hook" data-hook="' + esc((h.hook || "").replace(/^Helper /, "")) + '"><b>' + esc(h.hook) + "</b>" +
        (h.flow ? '<div class="fl">' + flowHtml(h.flow) + "</div>" : "<pre>" + esc(h.logic) + "</pre>") +
        '<details><summary class="muted">as text</summary><pre>' + esc(h.logic) + "</pre></details></div>";
    }).join("");
  }
  function wireCalls(holder) {
    holder.querySelectorAll(".fl-call").forEach(function (a) {
      a.onclick = function () {
        var d = holder.querySelector("details.script-rules");
        if (d) d.open = true;
        var t = holder.querySelector('.fl-hook[data-hook="' + a.dataset.helper + '"]');
        if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); t.classList.add("flash"); setTimeout(function () { t.classList.remove("flash"); }, 1200); }
      };
    });
  }
  // a state machine, top to bottom: each level a wrapping row, arrows drawn where the boxes landed
  function stateChart(c, holder) {
    var byId = {}, depth = {}, q = [c.start || (c.states[0] || {}).id];
    c.states.forEach(function (s) { byId[s.id] = s; });
    depth[q[0]] = 0;
    while (q.length) { var id = q.shift(); if (!byId[id]) continue; byId[id].next.forEach(function (n) { if (depth[n] === undefined) { depth[n] = depth[id] + 1; q.push(n); } }); }
    var rows = {};
    c.states.forEach(function (s) { var d = depth[s.id] === undefined ? 0 : depth[s.id]; (rows[d] = rows[d] || []).push(s); });
    holder.innerHTML = '<div class="graph"><svg></svg>' + Object.keys(rows).sort(function (a, b) { return a - b; }).map(function (d) {
      return '<div class="g-row">' + rows[d].map(function (s) {
        return '<button class="node' + (s.id === c.start ? " start" : "") + '" data-s="' + esc(s.id) + '"><b>State ' + esc(s.id) + "</b><span>" +
          esc(s.behaviour || "state") + (s.form ? " · form " + esc(s.form) : "") + (s.hooks.length ? " · " + s.hooks.length + " rule" + (s.hooks.length > 1 ? "s" : "") : "") + "</span></button>";
      }).join("") + "</div>";
    }).join("") + '</div><div class="logic muted">Select a state to read what it does.</div>' +
      (c.script_hooks.length ? '<details class="prov script-rules"><summary>Rules for the whole script, and its helpers</summary>' + hooksHtml(c.script_hooks) + "</details>" : "");
    var graph = holder.querySelector(".graph"), svg = graph.querySelector("svg");
    function arrows() {
      if (!graph.offsetParent) return;
      var box = graph.getBoundingClientRect(), pos = {};
      graph.querySelectorAll(".node").forEach(function (n) { var r = n.getBoundingClientRect(); pos[n.dataset.s] = { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height }; });
      svg.setAttribute("width", box.width); svg.setAttribute("height", box.height);
      var paths = "";
      c.states.forEach(function (s) { s.next.forEach(function (n) {
        var a = pos[s.id], z = pos[n]; if (!a || !z) return;
        var x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = z.x + z.w / 2, y2 = z.y;
        if (y2 <= a.y) { x1 = a.x + a.w; y1 = a.y + a.h / 2; x2 = z.x + z.w; y2 = z.y + z.h / 2; var bend = Math.max(x1, x2) + 40;
          paths += '<path d="M' + x1 + "," + y1 + " C" + bend + "," + y1 + " " + bend + "," + y2 + " " + x2 + "," + y2 + '"/>'; }
        else paths += '<path d="M' + x1 + "," + y1 + " C" + x1 + "," + (y1 + 24) + " " + x2 + "," + (y2 - 24) + " " + x2 + "," + y2 + '"/>';
      }); });
      svg.innerHTML = '<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z"/></marker></defs>' + paths;
    }
    arrows();
    window.addEventListener("resize", arrows);
    holder.querySelectorAll(".node").forEach(function (btn) {
      btn.onclick = function () {
        holder.querySelectorAll(".node").forEach(function (x) { x.classList.toggle("on", x === btn); });
        var s = byId[btn.dataset.s];
        holder.querySelector(".logic").innerHTML = "<b>State " + esc(s.id) + "</b> " + esc(s.behaviour) +
          (s.next.length ? '<div class="muted">leads to: ' + s.next.map(function (n) { return "state " + esc(n); }).join(", ") + "</div>" : "") +
          (hooksHtml(s.hooks) || '<p class="muted">No rules of its own: it runs the behaviour above.</p>');
        wireCalls(holder);
      };
    });
    wireCalls(holder);
  }
  function aiTab(ais, b, holder) {
    if (!ais.length) { holder.innerHTML = '<p class="muted">This enemy uses the game’s generic AI: its weighted moves, nothing more.</p>'; return; }
    holder.innerHTML = ais.map(function (x, i) { return '<div class="card ai-card"><b>' + esc(x[1]) + '</b> <span class="mono muted">AI ' + esc(x[0]) + '</span><div class="ai-body" id="ai-' + i + '">Loading…</div></div>'; }).join("");
    ais.forEach(function (x, i) {
      var el = document.getElementById("ai-" + i);
      load("ai/" + x[0] + ".json").then(function (c) {
        if (c.kind === "template") { el.innerHTML = templateChart(c, b) + (c.script_hooks && c.script_hooks.length ?
          '<details class="prov script-rules"><summary>Its custom rules, and helpers</summary>' + hooksHtml(c.script_hooks) + "</details>" : ""); wireCalls(el); }
        else if (c.kind === "states") stateChart(c, el);
        else el.innerHTML = '<p class="muted">' + esc(c.note || "Not charted yet.") + "</p>";
      }).catch(function () { el.innerHTML = '<p class="missing">This AI script isn’t held yet: a capture of it would fill this chart.</p>'; });
    });
  }

  // ----- search
  function search(q) {
    Promise.all([indexed(), load("enemies.json")]).then(function (res) {
      var index = res[0], hits = [];
      q = q.toLowerCase();
      index.events.forEach(function (e) { if (e.name.toLowerCase().indexOf(q) >= 0) hits.push('<a href="#/event/' + e.id + '">' + esc(e.name) + ' <span class="muted">' + esc(e.category) + "</span></a>"); });
      (index.realms || []).forEach(function (r) { r.locations.forEach(function (l) { if (l.name.toLowerCase().indexOf(q) >= 0) hits.push('<a href="#/realm/' + r.id + "/" + l.id + '">' + esc(r.name) + " › " + esc(l.name) + ' <span class="muted">location</span></a>'); }); });
      Object.keys(res[1]).forEach(function (n) {
        if (n.toLowerCase().indexOf(q) < 0) return;
        res[1][n].slice(0, 6).forEach(function (bid) { var w = where[bid] || {}; hits.push('<a href="#/battle/' + bid + '">' + esc(n) + ' <span class="muted">in ' + esc((w.cat || [0, ""])[1]) + " › " + esc(w.loc) + " › " + esc(w.name) + "</span></a>"); });
      });
      app.innerHTML = "<h1>Search: " + esc(q) + '</h1><div class="results">' + (hits.slice(0, 300).join("") || '<p class="muted">Nothing found.</p>') + "</div>";
    });
  }

  function notFound() { app.innerHTML = '<h1>Not found</h1><p><a href="#/">Back to the archive</a></p>'; }
  function route() {
    var parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    window.scrollTo(0, 0);
    if (parts[0] === "wishlist") return wishlist();
    if (parts[0] === "motion") return window.Motion.page(app, { esc: esc, crumbs: crumbs, load: load }, parts.slice(1).join("/"));
    if (parts[0] === "battle" && parts.length >= 5) return enemyPage(parts[1], +parts[2], +parts[3], +parts[4]);
    if (parts[0] === "battle") return battlePage(parts[1]);
    indexed().then(function (index) {
      if (parts[0] === "type") typePage(index, parts[1]);
      else if (parts[0] === "realm") realmPage(index, parts[1], parts[2]);
      else if (parts[0] === "event") eventPage(index, parts[1]);
      else home(index);
    });
  }
  var timer;
  document.getElementById("search").addEventListener("input", function (ev) {
    clearTimeout(timer);
    var q = ev.target.value.trim();
    timer = setTimeout(function () { if (q.length >= 2) search(q); else route(); }, 200);
  });
  window.addEventListener("hashchange", route);
  route();
})();
