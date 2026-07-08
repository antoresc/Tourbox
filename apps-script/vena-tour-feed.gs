/**
 * VENA TOURBOOK — per-artist tour feed (Supabase sync)
 *
 * Reads the booking folder (one subfolder per show, each with a "Tourbook" doc),
 * parses every tourbook the same way the map does (splitting name + number),
 * and UPSERTS the result into Supabase `tourbook_details` on a time trigger.
 *
 * SETUP (once, per artist):
 *   1. script.google.com -> New project -> paste this file.
 *   2. Left sidebar -> Services (+) -> add "Drive API" (Advanced). Needed to read
 *      Word (.docx) tourbooks; Google-Docs ones work without it.
 *   3. Project Settings -> Script properties, add:
 *        SUPABASE_URL                = https://<ref>.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY   = <service role key>   (secret; lives ONLY here)
 *        ARTIST_SLUG                 = gioia-lucia
 *        FOLDER_ID                   = <Drive booking folder id>
 *        TOUR_YEAR                   = 2026
 *   4. Run installTrigger() once (authorize when prompted).
 *   5. Run syncTourbooks() once to confirm, then check the map.
 *
 * The service-role key is stored in Script Properties and never leaves Google.
 */

function cfg_() {
  var p = PropertiesService.getScriptProperties();
  return {
    url: p.getProperty('SUPABASE_URL'),
    key: p.getProperty('SUPABASE_SERVICE_ROLE_KEY'),
    slug: p.getProperty('ARTIST_SLUG'),
    folder: p.getProperty('FOLDER_ID'),
    year: p.getProperty('TOUR_YEAR') || '2026'
  };
}

function rest_(c, path, opts) {
  var options = opts || {};
  options.muteHttpExceptions = true;
  options.headers = options.headers || {
    apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json'
  };
  var res = UrlFetchApp.fetch(c.url + '/rest/v1/' + path, options);
  var code = res.getResponseCode();
  if (code >= 300) throw new Error('Supabase ' + code + ': ' + res.getContentText());
  var body = res.getContentText();
  return body ? JSON.parse(body) : null;
}

function pad2_(n) { n = String(n); return n.length < 2 ? '0' + n : n; }

function syncTourbooks() {
  var c = cfg_();
  if (!c.url || !c.key || !c.slug || !c.folder) throw new Error('Missing Script Properties');
  var artists = rest_(c, 'artists?slug=eq.' + encodeURIComponent(c.slug) + '&select=id');
  if (!artists || !artists.length) throw new Error('artist not found: ' + c.slug);
  var artistId = artists[0].id;

  var subs = DriveApp.getFolderById(c.folder).getFolders();
  var written = 0, skipped = 0;
  while (subs.hasNext()) {
    var f = subs.next();
    var m = f.getName().match(/(\d{1,2})\s*\/\s*(\d{1,2})/);   // "DD/MM - Venue"
    if (!m) continue;
    var isoDate = c.year + '-' + pad2_(m[2]) + '-' + pad2_(m[1]); // YYYY-MM-DD
    var file = findTourbook(f);
    if (!file) continue;
    var rows = readTable(file);
    if (!rows || !rows.length) continue;
    var d = extract(rows);

    var shows = rest_(c, 'shows?artist_id=eq.' + artistId + '&date=eq.' + isoDate + '&select=id');
    if (!shows || !shows.length) { skipped++; continue; } // date not in DB yet

    var payload = {
      show_id: shows[0].id,
      venue: d.venue || null, address: d.address || null,
      wifi: d.wifi || null, parking: d.parking || null, dressing: d.dressing || null,
      payment: d.payment || null, dinner: d.dinner || null,
      hotel: d.hotel || {}, timings: d.timings || {},
      arriving: d.arriving || {}, leaving: d.leaving || {},
      contacts: { rep: d.rep || [], venue: d.venueContacts || [], sound: d.sound || [] }
    };
    rest_(c, 'tourbook_details?on_conflict=show_id', {
      method: 'post', payload: JSON.stringify(payload),
      headers: {
        apikey: c.key, Authorization: 'Bearer ' + c.key,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates'
      }
    });
    written++;
  }
  Logger.log('synced: ' + written + ' written, ' + skipped + ' skipped (no matching show)');
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncTourbooks').timeBased().everyMinutes(10).create();
  Logger.log('trigger installed: syncTourbooks every 10 minutes');
}

/* ============================================================================
 * Parsing logic below — kept verbatim from the original map feed.
 * ==========================================================================*/

function findTourbook(folder) {
  var files = folder.getFiles(), best = null;
  while (files.hasNext()) {
    var fl = files.next(), mt = fl.getMimeType(), nm = fl.getName();
    var isDoc = mt === 'application/vnd.google-apps.document' ||
                mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                mt === 'application/msword';
    if (!isDoc) continue;
    if (/tourbook|^tb |scheda/i.test(nm)) return fl;
    if (!best) best = fl;
  }
  return best;
}

function readTable(file) {
  var mt = file.getMimeType(), docId = file.getId(), temp = null;
  if (mt !== 'application/vnd.google-apps.document') {
    try {
      var copy = Drive.Files.copy({ title: '__tb_tmp', mimeType: 'application/vnd.google-apps.document' }, file.getId());
      docId = copy.id; temp = docId;
    } catch (err) { return null; }   // Drive advanced service not enabled -> skip word docs
  }
  var rows = [];
  try {
    var tables = DocumentApp.openById(docId).getBody().getTables();
    if (tables.length) {
      var t = tables[0];
      for (var r = 0; r < t.getNumRows(); r++) {
        var row = t.getRow(r);
        if (row.getNumCells() >= 2) rows.push([row.getCell(0).getText().trim(), row.getCell(1).getText().trim()]);
      }
    }
  } finally {
    if (temp) DriveApp.getFileById(temp).setTrashed(true);
  }
  return rows;
}

function cleanVal(v) { return (v || '').replace(/\s{2,}/g, ' ').trim(); }

function telHref(p) { return (p.charAt(0) === '+' ? '+' : '') + p.replace(/\D/g, ''); }

function parseContacts(s) {
  if (!s) return [];
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\b(TBD|TBC)\b/gi, ' ').replace(/\/\//g, ' ').replace(/;/g, ' ');
  var EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.\-]+?\.(?:com|it|net|org|be|fr|eu|io|co|info|studio|me)/ig;
  var PHONE = /\+?\s?\d[\d ]{5,}\d/g;
  var masked = s.replace(EMAIL, function (m) { return new Array(m.length + 1).join(''); });
  var marks = [], m;
  EMAIL.lastIndex = 0; while ((m = EMAIL.exec(s))) marks.push([m.index, m.index + m[0].length, 'email', m[0]]);
  PHONE.lastIndex = 0; while ((m = PHONE.exec(masked))) marks.push([m.index, m.index + m[0].length, 'phone', s.substring(m.index, m.index + m[0].length).trim()]);
  marks.sort(function (a, b) { return a[0] - b[0]; });
  var seq = [], pos = 0;
  marks.forEach(function (k) { if (k[0] < pos) return; var nf = s.substring(pos, k[0]); if (nf.trim()) seq.push(['name', nf]); seq.push([k[2], k[3]]); pos = k[1]; });
  var tail = s.substring(pos); if (tail.trim()) seq.push(['name', tail]);
  function cleanName(n) {
    n = n.replace(/[\-–|\/]+/g, ' ').replace(/[^\w\sÀ-ÿ&.']/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return n.replace(/^[.\- ]+|[.\- ]+$/g, '');
  }
  var out = [], cur = {};
  seq.forEach(function (it) {
    if (it[0] === 'name') { var nm = cleanName(it[1]); if (!nm) return; if (cur.phone || cur.email || cur.name) { out.push(cur); cur = {}; } cur.name = nm; }
    else if (it[0] === 'phone') { if (cur.phone) { out.push(cur); cur = {}; } cur.phone = it[1].replace(/\s{2,}/g, ' ').trim(); }
    else { if (cur.email) { out.push(cur); cur = {}; } cur.email = it[1]; }
  });
  if (Object.keys(cur).length) out.push(cur);
  var merged = [];
  out.forEach(function (c) {
    var last = merged[merged.length - 1];
    if (last && Object.keys(last).length === 1 && last.phone && Object.keys(c).length === 1 && c.name) last.name = c.name;
    else merged.push(c);
  });
  merged = merged.filter(function (c) {
    if (!(Object.keys(c).length === 1 && c.name)) return true;
    var n = c.name;
    return !(n.indexOf('@') > -1 || /\w+\.\w{2,}/.test(n) || n.trim().length < 2);
  });
  merged.forEach(function (c) { if (c.phone) c.tel = telHref(c.phone); });
  return merged;
}

function extract(rows) {
  var map = {};
  rows.forEach(function (kv) {
    var k = kv[0], v = cleanVal(kv[1]);
    if (!k) return;
    if (k === v && k.toUpperCase() === k) return;   // section header row
    (map[k] = map[k] || []).push(v);
  });
  function g(key, idx) { var a = (map[key] || []).filter(Boolean); if (!a.length) return ''; idx = idx || 0; return idx < a.length ? a[idx] : a[a.length - 1]; }

  var venueVals = (map['Venue'] || []).filter(Boolean);
  var venue = venueVals.length ? venueVals[venueVals.length - 1] : '';
  var phones = (map['Phone'] || []).filter(Boolean);
  var venuePhone = phones.length ? phones[phones.length - 1] : '';
  var addrs = (map['Address'] || []).filter(Boolean);

  var rep = parseContacts(g('Representative contacts'));
  var repFirst = {}; rep.forEach(function (c) { if (c.name) repFirst[c.name.toLowerCase().split(' ')[0]] = 1; });
  function dedup(cs) {
    var firsts = cs.filter(function (c) { return c.name; }).map(function (c) { return c.name.toLowerCase().split(' ')[0]; });
    if (firsts.length && firsts.every(function (x) { return repFirst[x]; })) return [];
    return cs.filter(function (c) { var ks = Object.keys(c); return !(ks.length === 1 && c.email); });
  }
  var se = parseContacts((g('Sound engineer (name)') + ' ' + g('Sound engineer (phone)')).trim());

  return {
    venue: venue,
    address: g('Address', 0),
    venueContacts: parseContacts(venuePhone),
    rep: rep,
    sound: se,
    wifi: g('Wi-fi'),
    parking: g('Parking'),
    dressing: g('Dressing rooms'),
    payment: g('Payment methods (cash, bank transfer, etc.)'),
    dinner: g('Restaurant'),
    hotel: { name: g('Hotel'), address: addrs.length > 1 ? addrs[1] : '', distance: g('Distance from the venue'), rooming: g('Rooming') },
    arriving: { time: g('Arriving - Time and place'), contacts: dedup(parseContacts(g('Arriving - Contacts'))) },
    leaving: { time: g('Leaving - Time and place'), contacts: dedup(parseContacts(g('Leaving - Contacts'))) },
    timings: { load: g('Load in'), sound: g('Soundcheck'), dinner: g('Dinner'), doors: g('Doors'), stage: g('On stage') }
  };
}
