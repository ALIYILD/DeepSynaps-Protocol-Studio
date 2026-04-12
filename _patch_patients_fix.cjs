const fs = require('fs');
const filePath = 'C:/Users/yildi/DeepSynaps-Protocol-Studio/apps/web/src/pages-clinical.js';

let src = fs.readFileSync(filePath, 'utf8');
src = src.replace(/\r\n/g, '\n');

// Fix broken onclick single-quote escaping in _patCard
// The patch produced '' (empty string concat) instead of \' (escaped quote)

const OLD_CARD_END = `    const transferBtn = canTransferFlag
      ? '<button class="pat-act-btn" onclick="window._transferPatient('' + p.id + '','' + name.replace(/'/g, "\\'") + '')">Transfer</button>'
      : '';
    return '<div class="pat-roster-card" data-id="' + p.id + '" data-status="' + p.status + '" data-attention="' + (att ? att.type : 'ok') + '" onclick="window.openPatient('' + p.id + '')">'
      + '<div class="pat-card-left">'
      +   '<div class="pat-card-avatar">'
      +     '<span class="pat-status-dot" style="background:' + statusColor + '"></span>'
      +     initials(name)
      +   '</div>'
      + '</div>'
      + '<div class="pat-card-main">'
      +   '<div class="pat-card-name">' + name + ageSpan + '</div>'
      +   '<div class="pat-card-meta">' + condTag + modTag + ' ' + courseInfo + '</div>'
      +   progressBar
      +   lastSess
      + '</div>'
      + '<div class="pat-card-signals">' + attBadge + '</div>'
      + '<div class="pat-card-actions" onclick="event.stopPropagation()">'
      +   '<button class="pat-act-btn pat-act-btn--primary" onclick="window.openPatient('' + p.id + '')">Open Chart</button>'
      +   '<button class="pat-act-btn" onclick="window._patStartSession('' + p.id + '')">Start Session</button>'
      +   '<button class="pat-act-btn" onclick="window._nav('virtual-care')">Virtual Care</button>'
      +   '<button class="pat-act-btn" onclick="window._patAddNote('' + p.id + '')">Add Note</button>'
      +   transferBtn
      + '</div>'
      + '</div>';`;

if (!src.includes(OLD_CARD_END)) { console.error('ERROR: OLD_CARD_END not found'); process.exit(1); }

// In the fixed version, onclick attributes use single-quoted IDs inside double-quoted attributes.
// JS source: '...onclick="window.openPatient(\'' + p.id + '\')"...'
// The \' here is a single-quote escape inside a single-quoted JS string.
const NEW_CARD_END = `    const transferBtn = canTransferFlag
      ? '<button class="pat-act-btn" onclick="window._transferPatient(\\'' + p.id + '\\',\\'' + name.replace(/'/g, "\\\\'") + '\\')">Transfer</button>'
      : '';
    return '<div class="pat-roster-card" data-id="' + p.id + '" data-status="' + p.status + '" data-attention="' + (att ? att.type : 'ok') + '" onclick="window.openPatient(\\'' + p.id + '\\')">'
      + '<div class="pat-card-left">'
      +   '<div class="pat-card-avatar">'
      +     '<span class="pat-status-dot" style="background:' + statusColor + '"></span>'
      +     initials(name)
      +   '</div>'
      + '</div>'
      + '<div class="pat-card-main">'
      +   '<div class="pat-card-name">' + name + ageSpan + '</div>'
      +   '<div class="pat-card-meta">' + condTag + modTag + ' ' + courseInfo + '</div>'
      +   progressBar
      +   lastSess
      + '</div>'
      + '<div class="pat-card-signals">' + attBadge + '</div>'
      + '<div class="pat-card-actions" onclick="event.stopPropagation()">'
      +   '<button class="pat-act-btn pat-act-btn--primary" onclick="window.openPatient(\\'' + p.id + '\\')">Open Chart</button>'
      +   '<button class="pat-act-btn" onclick="window._patStartSession(\\'' + p.id + '\\')">Start Session</button>'
      +   '<button class="pat-act-btn" onclick="window._nav(\\'virtual-care\\')">Virtual Care</button>'
      +   '<button class="pat-act-btn" onclick="window._patAddNote(\\'' + p.id + '\\')">Add Note</button>'
      +   transferBtn
      + '</div>'
      + '</div>';`;

src = src.replace(OLD_CARD_END, NEW_CARD_END);

src = src.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, src, 'utf8');
console.log('Fix applied.');
