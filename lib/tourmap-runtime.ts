// Ported verbatim (behaviourally) from the source index.html <script>, adapted to:
//  - read shows/details from props instead of embedded SHOWS/DETAILS constants,
//  - derive ds/month from the real `date`,
//  - gate the tourbook "scheda tecnica" behind auth (details === null => locked).
// initTourMap wires up the DOM inside `root` and returns a cleanup function.
import { EUROPE } from "./europe-geometry";
import { project, VW, FULL, ASPECT } from "./projection";
import {
  MONTHS_IT,
  STATUS_LABEL,
  dsFromDate,
  monthFromDate,
  shortDs as shortDate,
} from "./tour-derive";
import type { Show, TourbookDetail, Contact } from "./types";

type ViewDetail = Omit<TourbookDetail, "contacts"> & {
  rep: Contact[];
  venueContacts: Contact[];
  sound: Contact[];
};
type RuntimeShow = Show & { ds: number; m: number };

export type InitOptions = {
  shows: Show[];
  details: Record<number, TourbookDetail> | null;
  onUnlock: () => void;
};

export function initTourMap(root: HTMLElement, opts: InitOptions): () => void {
  const $ = (id: string) => root.querySelector<HTMLElement>("#" + id)!;

  const SHOWS: RuntimeShow[] = opts.shows.map((s) => ({
    ...s,
    ds: dsFromDate(s.date),
    m: monthFromDate(s.date),
  }));
  const locked = opts.details === null;

  const toView = (d: TourbookDetail): ViewDetail => ({
    ...d,
    rep: d.contacts?.rep || [],
    venueContacts: d.contacts?.venue || [],
    sound: d.contacts?.sound || [],
  });
  const DETAILS: Record<number, ViewDetail> = {};
  if (opts.details) {
    for (const [ds, d] of Object.entries(opts.details)) DETAILS[Number(ds)] = toView(d);
  }
  const det = (ds: number): ViewDetail | undefined => DETAILS[ds];

  // ---- element refs (single instance per page) ----
  const svg = $("map") as unknown as SVGSVGElement;
  const landG = $("landG");
  const routeEl = $("route") as unknown as SVGPolylineElement;
  const overlay = $("overlay");
  const card = $("card");
  const nextChip = $("nextChip");
  const nextCityEl = $("nextCity");
  const nextSubEl = $("nextSub");
  const app = root; // root IS the #app element (querySelector only finds descendants)

  const state = { month: "all", route: false, routeToNext: false };
  let sel: string | null = null;
  let cityEls: Record<string, HTMLElement> = {};

  const view = { cx: FULL.x + FULL.w / 2, cy: FULL.y + FULL.h / 2, w: FULL.w };
  const vbFrom = () => {
    const h = view.w / ASPECT;
    return { x: view.cx - view.w / 2, y: view.cy - h / 2, w: view.w, h };
  };

  const esc = (s: unknown) =>
    (s == null ? "" : String(s)).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
    );

  const cityPriority = (s: RuntimeShow[]) =>
    s.some((x) => x.status === "confirmed")
      ? "confirmed"
      : s.some((x) => x.status === "interest")
        ? "interest"
        : "tbd";
  const cityHasBook = (s: RuntimeShow[]) => s.some((x) => det(x.ds));
  const visibleShows = () =>
    state.month === "all" ? SHOWS : SHOWS.filter((s) => s.m === Number(state.month));

  const todayDs = (() => {
    const d = new Date();
    return (d.getMonth() + 1) * 100 + d.getDate();
  })();
  const isPast = (ds: number) => ds < todayDs;
  const nextShow = () => {
    const upcoming = SHOWS.filter((s) => s.ds >= todayDs).sort((a, b) => a.ds - b.ds);
    return upcoming[0] || null;
  };

  function drawLand() {
    landG.innerHTML = EUROPE.map((rings) =>
      rings
        .map((ring) => {
          const d =
            ring
              .map((c, i) => {
                const [x, y] = project(c[0], c[1]);
                return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
              })
              .join("") + "Z";
          return `<path class="land" d="${d}"/>`;
        })
        .join("")
    ).join("");
  }

  function renderStats() {
    const cities = new Set(SHOWS.map((s) => s.city)).size;
    const books = SHOWS.filter((s) => det(s.ds)).length;
    $("stats").innerHTML = `
      <span class="stat stat--live"><b>${SHOWS.length}</b> DATE</span>
      <span class="stat"><b>${cities}</b> CITTÀ</span>
      <span class="stat"><b>${books}</b> SCHEDE</span>
      <span class="stat">APR — NOV '26</span>`;
  }
  function renderChips() {
    const present = [...new Set(SHOWS.map((s) => s.m))].sort((a, b) => a - b);
    const opts2: [string, string][] = [
      ["all", "Tutti"],
      ...present.map((m) => [String(m), MONTHS_IT[m]] as [string, string]),
    ];
    const wrap = $("chips");
    wrap.innerHTML = opts2
      .map(
        ([v, l]) =>
          `<button class="chip-btn ${state.month === v ? "is-on" : ""}" data-month="${v}">${l}</button>`
      )
      .join("");
    wrap.querySelectorAll<HTMLElement>(".chip-btn").forEach(
      (b) =>
        (b.onclick = () => {
          state.month = b.dataset.month!;
          deselect();
          renderAll();
          fitVisible(true);
        })
    );
  }

  function renderManifest() {
    const shows = visibleShows().slice().sort((a, b) => a.ds - b.ds);
    const nxt = nextShow();
    let html = "",
      cur: number | null = null,
      i = 0;
    shows.forEach((s) => {
      if (s.m !== cur) {
        cur = s.m;
        const c = shows.filter((x) => x.m === cur).length;
        html += `<div class="mgroup">${MONTHS_IT[cur]}<span>${c}</span></div>`;
      }
      const venue = s.venue
        ? `<span class="row__venue">${esc(s.venue)}</span>`
        : `<span class="row__venue tbd">da confermare</span>`;
      const tb = det(s.ds) ? '<span class="row__tb">TB</span>' : "";
      const past = isPast(s.ds),
        isNext = nxt && s.ds === nxt.ds && s.city === nxt.city;
      const flag = isNext ? '<span class="row__flag">PROSSIMA</span>' : "";
      html += `<button class="row${past ? " is-past" : ""}${isNext ? " is-next" : ""}" data-city="${esc(
        s.city
      )}" style="animation-delay:${Math.min(i, 18) * 22}ms">
        ${flag}<span class="row__date">${shortDate(s.ds)}</span>
        <span class="row__body"><span class="row__city">${esc(s.city)}</span>${venue}</span>
        <span class="row__right">${tb}<span class="row__dot row__dot--${s.status}"></span></span></button>`;
      i++;
    });
    const box = $("manifest");
    box.innerHTML = html;
    box.querySelectorAll<HTMLElement>(".row").forEach(
      (r) =>
        (r.onclick = () => {
          selectCity(r.dataset.city!);
          if (window.matchMedia("(max-width:860px)").matches) setView("map");
        })
    );
  }

  function renderPins() {
    overlay.innerHTML = "";
    cityEls = {};
    const byCity: Record<string, RuntimeShow[]> = {};
    const nxt = nextShow();
    visibleShows().forEach((s) => {
      (byCity[s.city] ??= []).push(s);
    });
    Object.entries(byCity).forEach(([city, shows]) => {
      const s0 = shows[0];
      const [px, py] = project(s0.lng, s0.lat);
      const allPast = shows.every((s) => isPast(s.ds));
      const hasNext = nxt && shows.some((s) => s.ds === nxt.ds && s.city === nxt.city);
      const cls =
        "pin pin--" +
        cityPriority(shows) +
        (cityHasBook(shows) ? " pin--book" : "") +
        (allPast ? " is-past" : "") +
        (hasNext ? " is-next" : "");
      const el = document.createElement("button");
      el.className = cls;
      el.dataset.city = city;
      el.dataset.px = String(px);
      el.dataset.py = String(py);
      el.innerHTML =
        '<span class="pin__dot"></span>' +
        (shows.length > 1 ? `<span class="pin__count">${shows.length}</span>` : "");
      el.onclick = (e) => {
        e.stopPropagation();
        selectCity(city);
      };
      overlay.appendChild(el);
      cityEls[city] = el;
    });
    renderNextChip();
    positionPins();
  }
  function renderNextChip() {
    const nxt = nextShow();
    if (!nxt) {
      nextChip.style.display = "none";
      return;
    }
    nextChip.style.display = "flex";
    nextCityEl.textContent = nxt.city;
    nextSubEl.textContent = `${shortDate(nxt.ds)} · prossima tappa`;
    nextChip.classList.toggle("is-active", sel === nxt.city || state.routeToNext);
  }
  function positionPins() {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const vb = vbFrom();
    const s = Math.min(r.width / vb.w, r.height / vb.h);
    const offX = (r.width - vb.w * s) / 2,
      offY = (r.height - vb.h * s) / 2;
    for (const c in cityEls) {
      const el = cityEls[c];
      const px = +el.dataset.px!,
        py = +el.dataset.py!;
      const sx = offX + (px - vb.x) * s,
        sy = offY + (py - vb.y) * s;
      const inv = sx >= -24 && sx <= r.width + 24 && sy >= -24 && sy <= r.height + 24;
      el.style.display = inv ? "block" : "none";
      el.style.left = sx + "px";
      el.style.top = sy + "px";
    }
  }

  function renderRoute() {
    if (state.routeToNext) {
      const chain = SHOWS.slice().sort((a, b) => a.ds - b.ds);
      const nxt = nextShow();
      const nxtIdx = nxt ? chain.findIndex((s) => s.ds === nxt.ds && s.city === nxt.city) : -1;
      const prev = nxtIdx > 0 ? chain[nxtIdx - 1] : null;
      const pts = [prev, nxt].filter(Boolean) as RuntimeShow[];
      routeEl.setAttribute(
        "points",
        pts.length === 2
          ? pts
              .map((s) => {
                const [x, y] = project(s.lng, s.lat);
                return x.toFixed(1) + "," + y.toFixed(1);
              })
              .join(" ")
          : ""
      );
      return;
    }
    routeEl.setAttribute(
      "points",
      state.route
        ? visibleShows()
            .slice()
            .sort((a, b) => a.ds - b.ds)
            .map((s) => {
              const [x, y] = project(s.lng, s.lat);
              return x.toFixed(1) + "," + y.toFixed(1);
            })
            .join(" ")
        : ""
    );
  }

  function applyVB() {
    const vb = vbFrom();
    svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    positionPins();
  }
  function clampView() {
    const m = 170,
      h = view.w / ASPECT;
    const minX = FULL.x - m + view.w / 2,
      maxX = FULL.x + FULL.w + m - view.w / 2;
    view.cx = minX <= maxX ? Math.min(Math.max(view.cx, minX), maxX) : FULL.x + FULL.w / 2;
    const minY = FULL.y - m + h / 2,
      maxY = FULL.y + FULL.h + m - h / 2;
    view.cy = minY <= maxY ? Math.min(Math.max(view.cy, minY), maxY) : FULL.y + FULL.h / 2;
  }
  function zoomAt(f: number, ix: number, iy: number) {
    let nw = view.w / f;
    const minW = VW / 5,
      maxW = FULL.w * 1.5;
    nw = Math.min(Math.max(nw, minW), maxW);
    const r = nw / view.w;
    view.cx = ix + (view.cx - ix) * r;
    view.cy = iy + (view.cy - iy) * r;
    view.w = nw;
    clampView();
    applyVB();
  }
  function screenToInternal(cx: number, cy: number): [number, number] {
    const r = svg.getBoundingClientRect();
    const vb = vbFrom();
    const s = Math.min(r.width / vb.w, r.height / vb.h);
    const offX = (r.width - vb.w * s) / 2,
      offY = (r.height - vb.h * s) / 2;
    return [vb.x + (cx - r.left - offX) / s, vb.y + (cy - r.top - offY) / s];
  }
  function fitVisible(animate: boolean) {
    const pts = visibleShows().map((s) => project(s.lng, s.lat));
    if (!pts.length) {
      tweenOrSet(FULL.x + FULL.w / 2, FULL.y + FULL.h / 2, FULL.w, animate);
      return;
    }
    let minx = Math.min(...pts.map((p) => p[0])),
      maxx = Math.max(...pts.map((p) => p[0]));
    let miny = Math.min(...pts.map((p) => p[1])),
      maxy = Math.max(...pts.map((p) => p[1]));
    const px = (maxx - minx) * 0.16 + 70,
      py = (maxy - miny) * 0.16 + 70;
    minx -= px;
    maxx += px;
    miny -= py;
    maxy += py;
    let w = Math.max(maxx - minx, (maxy - miny) * ASPECT);
    w = Math.min(w, FULL.w * 1.25);
    tweenOrSet((minx + maxx) / 2, (miny + maxy) / 2, w, animate);
  }
  function focusOn(lng: number, lat: number) {
    const [px, py] = project(lng, lat);
    tweenOrSet(px, py, Math.min(view.w, FULL.w * 0.46), true);
  }
  let tweenId: number | null = null;
  function tweenOrSet(cx: number, cy: number, w: number, animate: boolean) {
    if (tweenId) cancelAnimationFrame(tweenId);
    const reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    if (!animate || reduce) {
      view.cx = cx;
      view.cy = cy;
      view.w = w;
      clampView();
      applyVB();
      return;
    }
    const s0 = { ...view },
      t0 = performance.now(),
      dur = 460,
      ease = (t: number) => 1 - Math.pow(1 - t, 3);
    (function step(now: number) {
      const t = Math.min((now - t0) / dur, 1),
        e = ease(t);
      view.cx = s0.cx + (cx - s0.cx) * e;
      view.cy = s0.cy + (cy - s0.cy) * e;
      view.w = s0.w + (w - s0.w) * e;
      clampView();
      applyVB();
      if (t < 1) tweenId = requestAnimationFrame(step);
      else tweenId = null;
    })(t0);
  }

  function highlight(city: string | null) {
    for (const c in cityEls) cityEls[c].classList.toggle("is-active", c === city);
    root.querySelectorAll<HTMLElement>(".row").forEach((r) =>
      r.classList.toggle("is-active", r.dataset.city === city)
    );
  }
  function contactRow(c: Contact, role: string) {
    const links: string[] = [];
    if (c.phone) links.push(`<a href="tel:${esc(c.tel || c.phone)}">${esc(c.phone)}</a>`);
    if (c.email) links.push(`<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`);
    const name = c.name ? esc(c.name) : "—";
    return `<div class="ct"><span class="ct__n">${name}${role ? `<span class="role">${role}</span>` : ""}</span><span class="ct__v">${links.join("")}</span></div>`;
  }
  function timelineHTML(t: ViewDetail["timings"]) {
    const items: [string, string | undefined, boolean?][] = [
      ["Load in", t.load],
      ["Soundcheck", t.sound],
      ["Doors", t.doors],
      ["Cena", t.dinner],
      ["On stage", t.stage, true],
    ];
    const chips = items
      .filter(([, v]) => v && String(v).trim())
      .map(
        ([k, v, stage]) =>
          `<div class="tp${stage ? " tp--stage" : ""}"><span class="tp__k">${k}</span><span class="tp__v">${esc(v)}</span></div>`
      )
      .join("");
    return chips
      ? `<div class="sec"><div class="sec__k">Timings</div><div class="timeline">${chips}</div></div>`
      : "";
  }
  function contactsBlock(d: ViewDetail) {
    const rows: string[] = [];
    (d.rep || []).forEach((c) => rows.push(contactRow(c, "referente")));
    const repTels = new Set((d.rep || []).map((c) => c.tel).filter(Boolean));
    (d.venueContacts || []).forEach((c) => {
      if (c.name && !(c.tel && repTels.has(c.tel))) rows.push(contactRow(c, "venue"));
    });
    (d.sound || []).forEach((c) => rows.push(contactRow(c, "fonico")));
    return rows.length ? `<div class="sec"><div class="sec__k">Contatti</div>${rows.join("")}</div>` : "";
  }
  function pickupBlock(d: ViewDetail) {
    const a = d.arriving || {},
      l = d.leaving || {};
    const parts: string[] = [];
    if (a.time && a.time.trim()) parts.push(`<div class="kv"><b>Arrivo</b> ${esc(a.time)}</div>`);
    (a.contacts || []).forEach((c) => parts.push(contactRow(c, "pickup")));
    if (l.time && l.time.trim()) parts.push(`<div class="kv"><b>Ripartenza</b> ${esc(l.time)}</div>`);
    (l.contacts || []).forEach((c) => parts.push(contactRow(c, "pickup")));
    return parts.length
      ? `<div class="sec"><div class="sec__k">Pickup / Transfer</div>${parts.join("")}</div>`
      : "";
  }
  function logisticsBlock(d: ViewDetail) {
    const tags: string[] = [];
    if (d.wifi && d.wifi.trim()) tags.push(`<span class="tag-i">Wi-Fi <b>${esc(d.wifi)}</b></span>`);
    if (d.parking && d.parking.length && d.parking.length < 28)
      tags.push(`<span class="tag-i">Parking <b>${esc(d.parking)}</b></span>`);
    if (d.payment && d.payment.trim())
      tags.push(`<span class="tag-i">Pagamento <b>${esc(d.payment)}</b></span>`);
    let extra = "";
    if (d.parking && d.parking.length >= 28)
      extra += `<div class="kv" style="margin-top:6px"><b>Parking</b> ${esc(d.parking)}</div>`;
    if (d.dressing && d.dressing.trim())
      extra += `<div class="kv" style="margin-top:4px"><b>Camerini</b> ${esc(d.dressing)}</div>`;
    if (!tags.length && !extra) return "";
    return `<div class="sec"><div class="sec__k">Logistica</div>${tags.length ? `<div class="tags">${tags.join("")}</div>` : ""}${extra}</div>`;
  }
  function stayBlock(d: ViewDetail) {
    const h = d.hotel || {};
    if (!h.name || !h.name.trim()) return "";
    let s = `<div class="kv"><b>${esc(h.name)}</b>`;
    if (h.address && h.address.trim()) s += `<br>${esc(h.address)}`;
    const meta = [h.distance, h.rooming].filter((x) => x && x.trim()).map(esc).join(" · ");
    if (meta) s += `<br><span style="color:var(--faint)">${meta}</span>`;
    s += "</div>";
    return `<div class="sec"><div class="sec__k">Alloggio</div>${s}</div>`;
  }
  function dinnerBlock(d: ViewDetail) {
    if (!d.dinner || !d.dinner.trim()) return "";
    return `<div class="sec"><div class="sec__k">Cena</div><div class="kv">${esc(d.dinner)}</div></div>`;
  }
  function eventHTML(s: RuntimeShow) {
    const d = det(s.ds);
    let h = `<div class="ev"><div class="ev__top"><span class="ev__date">${shortDate(s.ds)}</span><span class="chip chip--${s.status}">${STATUS_LABEL[s.status]}</span></div>`;
    h += s.venue
      ? `<div class="ev__fest">${esc(s.venue)}</div>`
      : `<div class="ev__fest" style="color:var(--faint)">Evento da confermare</div>`;
    if (locked) {
      // Public view: show the header only; the technical sheet is auth-gated.
      return h + "</div>";
    }
    if (d) {
      if (d.venue && d.venue.toLowerCase() !== (s.venue || "").toLowerCase())
        h += `<div class="ev__venue">${esc(d.venue)}</div>`;
      if (d.address && d.address.trim()) {
        const q = encodeURIComponent(d.address + " " + s.city);
        h += `<a class="ev__addr" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">${esc(d.address)} ↗</a>`;
      }
      h += timelineHTML(d.timings || {});
      h += contactsBlock(d);
      h += pickupBlock(d);
      h += dinnerBlock(d);
      h += stayBlock(d);
      h += logisticsBlock(d);
    } else {
      h += `<div class="ev__pending">Scheda tecnica in arrivo</div>`;
    }
    return h + "</div>";
  }
  function showCard(city: string) {
    const shows = SHOWS.filter((s) => s.city === city).slice().sort((a, b) => a.ds - b.ds);
    const s0 = shows[0];
    const geo = `${esc(s0.prov)} · ${s0.lat.toFixed(4)}, ${s0.lng.toFixed(4)}`;
    const gate = locked
      ? `<button class="unlock" data-unlock="1">🔒 Sblocca scheda tecnica</button><div class="unlock__hint">Contatti, hotel e orari — riservato allo staff</div>`
      : "";
    card.innerHTML = `<div class="card__hd"><div class="card__city">${esc(city)}</div><button class="card__close" aria-label="Chiudi">×</button></div>
      <div class="card__geo">${geo}</div>
      <div class="card__body">${shows.map(eventHTML).join("")}${gate}</div>`;
    card.classList.add("show");
    card.scrollTop = 0;
    (card.querySelector(".card__close") as HTMLElement).onclick = deselect;
    const unlockBtn = card.querySelector<HTMLElement>(".unlock");
    if (unlockBtn) unlockBtn.onclick = () => opts.onUnlock();
  }
  function selectCity(city: string) {
    sel = city;
    const s0 = SHOWS.find((s) => s.city === city);
    if (s0) focusOn(s0.lng, s0.lat);
    highlight(city);
    showCard(city);
  }
  function deselect() {
    sel = null;
    card.classList.remove("show");
    highlight(null);
  }

  function renderAll() {
    renderChips();
    renderManifest();
    renderPins();
    renderRoute();
    if (sel) highlight(sel);
  }

  // ---- interactions ----
  const routeToggle = $("routeToggle");
  const nextToggle = $("nextToggle");
  routeToggle.onclick = (e) => {
    state.route = !state.route;
    if (state.route) {
      state.routeToNext = false;
      nextToggle.classList.remove("is-on");
    }
    (e.currentTarget as HTMLElement).classList.toggle("is-on", state.route);
    renderRoute();
  };
  nextToggle.onclick = (e) => {
    state.routeToNext = !state.routeToNext;
    if (state.routeToNext) {
      state.route = false;
      routeToggle.classList.remove("is-on");
    }
    (e.currentTarget as HTMLElement).classList.toggle("is-on", state.routeToNext);
    renderRoute();
    if (state.routeToNext) {
      const nxt = nextShow();
      if (nxt) focusOn(nxt.lng, nxt.lat);
    }
  };
  $("zin").onclick = () => zoomAt(1.4, view.cx, view.cy);
  $("zout").onclick = () => zoomAt(1 / 1.4, view.cx, view.cy);
  $("zreset").onclick = () => {
    deselect();
    fitVisible(true);
  };
  nextChip.onclick = () => {
    const nxt = nextShow();
    if (nxt) selectCity(nxt.city);
  };
  root.querySelectorAll<HTMLElement>("#viewtoggle button").forEach(
    (b) => (b.onclick = () => setView(b.dataset.view!))
  );

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const [ix, iy] = screenToInternal(e.clientX, e.clientY);
    zoomAt(e.deltaY < 0 ? 1.14 : 1 / 1.14, ix, iy);
  };
  svg.addEventListener("wheel", onWheel, { passive: false });

  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number } | null = null,
    lastDist = 0,
    moved = 0;
  const onPointerDown = (e: PointerEvent) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY };
      moved = 0;
      svg.classList.add("grabbing");
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const p = [...pointers.values()];
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (lastDist) {
        const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
        const [ix, iy] = screenToInternal(mid.x, mid.y);
        zoomAt(d / lastDist, ix, iy);
      }
      lastDist = d;
      drag = null;
      return;
    }
    if (drag) {
      const r = svg.getBoundingClientRect();
      const vb = vbFrom();
      const s = Math.min(r.width / vb.w, r.height / vb.h);
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      moved += Math.abs(dx) + Math.abs(dy);
      view.cx -= dx / s;
      view.cy -= dy / s;
      drag = { x: e.clientX, y: e.clientY };
      clampView();
      applyVB();
    }
  };
  function endPtr(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastDist = 0;
    if (pointers.size === 0) {
      drag = null;
      svg.classList.remove("grabbing");
    }
  }
  const onPointerUp = (e: PointerEvent) => {
    const tap = moved < 6;
    endPtr(e);
    if (tap && sel) deselect();
  };
  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", endPtr);
  svg.addEventListener("pointerleave", endPtr);

  function setView(v: string) {
    app.classList.toggle("show-map", v === "map");
    app.classList.toggle("show-list", v === "list");
    root
      .querySelectorAll<HTMLElement>("#viewtoggle button")
      .forEach((b) => b.classList.toggle("is-on", b.dataset.view === v));
    if (v === "map") requestAnimationFrame(() => applyVB());
  }
  const onResize = () => applyVB();
  window.addEventListener("resize", onResize);

  // ---- init ----
  drawLand();
  renderStats();
  renderAll();
  applyVB();
  fitVisible(false);
  requestAnimationFrame(() => {
    applyVB();
    fitVisible(false);
  });
  const t = setTimeout(() => {
    applyVB();
    fitVisible(false);
  }, 120);

  // ---- cleanup ----
  return () => {
    clearTimeout(t);
    if (tweenId) cancelAnimationFrame(tweenId);
    window.removeEventListener("resize", onResize);
    svg.removeEventListener("wheel", onWheel);
    svg.removeEventListener("pointerdown", onPointerDown);
    svg.removeEventListener("pointermove", onPointerMove);
    svg.removeEventListener("pointerup", onPointerUp);
    svg.removeEventListener("pointercancel", endPtr);
    svg.removeEventListener("pointerleave", endPtr);
    landG.innerHTML = "";
    overlay.innerHTML = "";
    card.innerHTML = "";
    card.classList.remove("show");
  };
}
