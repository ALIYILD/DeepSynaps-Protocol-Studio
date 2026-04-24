const fs = require('fs');
const c = fs.readFileSync('src/pages-patient.js', 'utf8');
const re = new RegExp("_navPatient\\('([^']+)'\\)", 'g');
const s = new Set();
let m;
while ((m = re.exec(c)) !== null) s.add(m[1]);

// Also get the switch cases from app.js
const a = fs.readFileSync('src/app.js', 'utf8');
const re2 = new RegExp("case '([^']+)':\\s+await m\\.pg", 'g');
const routes = new Set();
while ((m = re2.exec(a)) !== null) routes.add(m[1]);

console.log('=== Routes used in pages-patient.js ===');
Array.from(s).sort().forEach(x => console.log(' ', x));

console.log('\n=== Routes handled in app.js patient router ===');
Array.from(routes).sort().forEach(x => console.log(' ', x));

console.log('\n=== MISSING: Used but not handled ===');
Array.from(s).sort().forEach(x => {
  if (!routes.has(x)) console.log('  !!', x);
});
