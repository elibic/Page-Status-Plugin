#!/usr/bin/env node
'use strict';

// בונה סקיל פיד מותאם מתוך קובץ מפרט שנוצר בראיון.
//
//   node build.js feed-spec.json [תיקיית-יעד]
//
// מייצר תיקייה עם SKILL.md, render.js ו-feed.config.json, ואורז אותה
// ל-zip להתקנה. הבנייה מכנית בכוונה: אותו מפרט מייצר תמיד אותו סקיל.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;

// ---------------------------------------------------------------- ולידציה

const REQUIRED = ['slug', 'feedName', 'audience', 'topicGate', 'wowTest',
  'mailTo', 'sourcesCommunity', 'sourcesCurated', 'sourcesOfficial',
  'topicsOut', 'types'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function validate(spec) {
  const missing = REQUIRED.filter(function (key) {
    const v = spec[key];
    return v === undefined || v === null || v === '' ||
      (Array.isArray(v) && !v.length);
  });
  if (missing.length) fail('חסרים שדות במפרט: ' + missing.join(', '));

  if (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(spec.slug)) {
    fail('slug חייב להיות אותיות אנגליות קטנות, ספרות ומקפים בלבד, ' +
      'באורך 3 עד 40 תווים. התקבל: "' + spec.slug + '"');
  }

  if (!Array.isArray(spec.types) || spec.types.length < 3) {
    fail('צריך לפחות שלושה סוגי פריטים ב-types');
  }

  const doers = spec.types.filter(function (t) { return t.doer; });
  if (doers.length < 2) {
    fail('צריך לפחות שני סוגים מסומנים כ-doer, אלה שכבת העושים. ' +
      'בלעדיהם הפיד יהיה רק הודעות ספקים');
  }

  spec.types.forEach(function (t, i) {
    if (!t.name || !t.when) fail('type מספר ' + (i + 1) + ' חסר name או when');
  });

  const bad = String(spec.mailTo).split(',').map(function (s) { return s.trim(); })
    .filter(function (a) { return a && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a); });
  if (bad.length) fail('כתובת מייל לא תקינה: ' + bad.join(', '));
}

// ---------------------------------------------------------------- בנייה

function bullets(list) {
  return (Array.isArray(list) ? list : [list])
    .map(function (line) { return '- ' + line; }).join('\n');
}

function typeTable(types) {
  const rows = types.map(function (t) {
    return '| `' + t.name + '` | ' + t.when + ' |';
  });
  return ['| type | מתי |', '|---|---|'].concat(rows).join('\n');
}

function build(spec, outRoot) {
  const doerNames = spec.types.filter(function (t) { return t.doer; })
    .map(function (t) { return t.name; });

  const count = Number(spec.itemCount) || 15;
  const floor = Math.max(3, Math.round(count * 0.65));

  const replacements = {
    SLUG: spec.slug,
    DESCRIPTION: spec.description ||
      ('בניית ' + spec.feedName + ' ושליחתו כמייל מעוצב. הפעל כשהמשתמש מבקש את הפיד היומי ' +
       'או כשמשימה מתוזמנת מבקשת אותו.'),
    FEED_NAME: spec.feedName,
    AUDIENCE: spec.audience,
    TOPIC_GATE: spec.topicGate,
    WOW_TEST: spec.wowTest,
    MAIL_TO: spec.mailTo,
    ITEM_COUNT: String(count),
    ITEM_FLOOR: String(floor),
    HISTORY_DRAFT: 'FEED-HISTORY-' + spec.slug.toUpperCase(),
    SOURCES_COMMUNITY: bullets(spec.sourcesCommunity),
    SOURCES_CURATED: bullets(spec.sourcesCurated),
    SOURCES_OFFICIAL: bullets(spec.sourcesOfficial),
    TOPICS_OUT: bullets(spec.topicsOut),
    TYPE_LIST: spec.types.map(function (t) { return t.name; }).join(' | '),
    TYPE_TABLE: typeTable(spec.types),
    DOER_TYPES_TEXT: doerNames.join(', ')
  };

  let skill = fs.readFileSync(path.join(HERE, 'feed-template.md'), 'utf8');
  Object.keys(replacements).forEach(function (key) {
    skill = skill.split('{{' + key + '}}').join(replacements[key]);
  });

  const leftover = skill.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) fail('נשארו מצייני מקום שלא הוחלפו: ' + leftover.join(', '));

  const config = {
    title: spec.feedName,
    wordmark: spec.wordmark || spec.feedName,
    dir: spec.dir === 'ltr' ? 'ltr' : 'rtl',
    lang: spec.lang || 'he',
    locale: spec.locale || 'he-IL',
    accent: spec.accent || '#e63f18',
    labels: spec.labels || { '3': 'התחל היום', '2': 'דורש הגדרה', '1': 'לידיעה' },
    ui: Object.assign({
      howTo: 'איך עושים',
      prompt: 'העתק את זה',
      angle: 'זווית מעניינת',
      readMore: 'קרא במקור',
      tagline: '{n} דברים שאפשר לעשות איתם משהו היום',
      footer: 'פריט נכנס רק אם אפשר לכתוב לו הוראת הפעלה.'
    }, spec.ui || {}),
    doerTypes: doerNames,
    maxPerSource: spec.maxPerSource || 2,
    maxPerUrl: spec.maxPerUrl || 2
  };

  const dir = path.join(outRoot, spec.slug);
  if (fs.existsSync(dir)) fail('התיקייה כבר קיימת: ' + dir + '. מחק אותה או בחר יעד אחר');
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, 'SKILL.md'), skill, 'utf8');
  fs.writeFileSync(path.join(dir, 'feed.config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
  fs.copyFileSync(path.join(HERE, 'render.js'), path.join(dir, 'render.js'));

  return { dir: dir, config: config, floor: floor, count: count };
}

function zip(outRoot, slug) {
  const target = path.join(outRoot, slug + '.zip');
  try {
    execFileSync('zip', ['-qr', target, slug], { cwd: outRoot });
    return target;
  } catch (err) {
    return null;
  }
}

// ---------------------------------------------------------------- ראשי

const specPath = process.argv[2];
const outRoot = path.resolve(process.argv[3] || process.cwd());

if (!specPath) {
  console.error('שימוש: node build.js feed-spec.json [תיקיית-יעד]');
  process.exit(1);
}

let spec;
try {
  spec = JSON.parse(fs.readFileSync(path.resolve(specPath), 'utf8'));
} catch (err) {
  fail('לא הצלחתי לקרוא את המפרט: ' + err.message);
}

validate(spec);
const built = build(spec, outRoot);
const archive = zip(outRoot, spec.slug);

console.log('נבנה הסקיל "' + spec.slug + '" ב-' + built.dir);
console.log('  יעד פריטים: ' + built.count + ', רצפה: ' + built.floor);
console.log('  שכבת עושים: ' + built.config.doerTypes.join(', '));
console.log('  טיוטת היסטוריה: FEED-HISTORY-' + spec.slug.toUpperCase());
console.log('  נמענים: ' + spec.mailTo);
if (archive) {
  console.log('ZIP להתקנה: ' + archive);
} else {
  console.log('אזהרה: zip לא זמין. מסור את התיקייה עצמה לאריזה ידנית.');
}
