#!/usr/bin/env node
'use strict';

// רינדור מייל הפיד היומי מ-JSON ל-HTML.
// דטרמיניסטי לגמרי - אותו קלט מייצר בדיוק אותו פלט, כדי שהעיצוב
// לא יזוז מיום ליום.
//
//   node render.js items.json email.html
//
// אפשר לשלוט בצבע המותג דרך משתנה הסביבה FEED_ACCENT.
//
// העיצוב בנוי טבלאות מקוננות עם סטיילינג inline בלבד, כי Outlook
// לא תומך ב-CSS מודרני, וללא גופני רשת, כי ג'ימייל מסיר אותם.

const fs = require('fs');

const ACCENT = process.env.FEED_ACCENT || '#e63f18';

const INK = '#0a0a0a';
const BODY = '#3a3835';
const MUTED = '#8f8d89';
const FADE = '#c9c7c3';
const PAGE = '#e4e4e2';
const PANEL = '#f4f3f1';
const FONT = "'Segoe UI', Tahoma, Arial, sans-serif";
const MONO = "'SFMono-Regular', Consolas, Monaco, monospace";

// דירוג הישימות מתורגם למילים ולא לנקודות, כדי שלא יידרש מקרא
const RANKS = {
  3: { label: 'התחל היום', numeral: ACCENT, chipBg: INK, chipText: '#ffffff', chipBorder: INK },
  2: { label: 'דורש הגדרה', numeral: INK, chipBg: '', chipText: INK, chipBorder: INK },
  1: { label: 'לידיעה', numeral: FADE, chipBg: '', chipText: MUTED, chipBorder: FADE }
};

// ---------------------------------------------------------------- עזרים

function esc(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(value) {
  return esc(value).replace(/\r?\n/g, '<br>');
}

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

function table(attrs, rows) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" ' + attrs +
    ' style="border-collapse:collapse;">' + rows + '</table>';
}

function spacer(height) {
  return '<tr><td style="font-size:0;line-height:0;height:' + height + 'px;">&nbsp;</td></tr>';
}

// ---------------------------------------------------------------- רכיבי פריט

function metaRow(item, index, rank) {
  const chip = '<td bgcolor="' + (rank.chipBg || '#ffffff') + '" style="background-color:' +
    (rank.chipBg || '#ffffff') + ';border:2px solid ' + rank.chipBorder + ';">' +
    '<span style="display:inline-block;padding:3px 9px;font-family:' + FONT +
    ';font-size:10px;font-weight:bold;color:' + rank.chipText + ';letter-spacing:1.2px;">' +
    esc(rank.label) + '</span></td>';

  const tag = [item.type, item.source].filter(Boolean).join(' \u00b7 ');
  const source = tag
    ? '<td style="padding:0 8px 0 0;font-family:' + FONT + ';font-size:11px;font-weight:bold;color:' +
      MUTED + ';letter-spacing:0.8px;">' + esc(tag) + '</td>'
    : '';

  return '<tr>' +
    '<td width="76" valign="top" style="width:76px;font-family:' + FONT +
    ';font-size:52px;font-weight:bold;color:' + rank.numeral + ';line-height:44px;letter-spacing:-1.5px;">' +
    pad(index) + '</td>' +
    '<td valign="top" style="padding-top:7px;">' +
    table('', '<tr>' + chip + source + '</tr>') +
    '</td></tr>';
}

function howToBlock(item, rank) {
  // פריט של כוכב אחד מקבל טיפול שקט, בלי הקופסה הכבדה
  if (rank.label === 'לידיעה') {
    return spacer(12) +
      '<tr><td style="font-family:' + FONT + ';font-size:14.5px;color:' + MUTED +
      ';line-height:25px;">' + nl2br(item.how_to) + '</td></tr>';
  }

  return spacer(20) +
    '<tr><td>' +
    table('width="100%"',
      '<tr><td bgcolor="' + PANEL + '" style="background-color:' + PANEL +
      ';border-top:4px solid ' + INK + ';padding:18px 20px;">' +
      '<div style="font-family:' + FONT + ';font-size:11px;font-weight:bold;color:' + INK +
      ';letter-spacing:1.6px;">איך עושים</div>' +
      '<div style="font-size:0;line-height:0;height:9px;">&nbsp;</div>' +
      '<div style="font-family:' + FONT + ';font-size:14.5px;color:#2a2825;line-height:25px;">' +
      nl2br(item.how_to) + '</div>' +
      '</td></tr>') +
    '</td></tr>';
}

function promptBlock(text) {
  // הפרומפט באנגלית - כיוון ויישור נפרדים כדי שלא יתהפך ב-RTL
  return spacer(12) +
    '<tr><td>' +
    table('width="100%"',
      '<tr><td bgcolor="' + INK + '" style="background-color:' + INK + ';padding:18px 20px;">' +
      '<div style="font-family:' + FONT + ';font-size:11px;font-weight:bold;color:' + ACCENT +
      ';letter-spacing:1.6px;">העתק את זה</div>' +
      '<div style="font-size:0;line-height:0;height:10px;">&nbsp;</div>' +
      '<div dir="ltr" style="direction:ltr;text-align:left;font-family:' + MONO +
      ';font-size:12.5px;color:#e8e6e2;line-height:21px;">' + nl2br(text) + '</div>' +
      '</td></tr>') +
    '</td></tr>';
}

function angleBlock(text) {
  return spacer(14) +
    '<tr><td>' +
    table('width="100%"',
      '<tr><td bgcolor="#fdefe9" style="background-color:#fdefe9;padding:13px 16px;font-family:' + FONT +
      ';font-size:13.5px;color:#7a2d11;line-height:22px;">' +
      '<span style="font-weight:bold;">זווית לקהילה - </span>' + nl2br(text) +
      '</td></tr>') +
    '</td></tr>';
}

function renderItem(item, index) {
  const rank = RANKS[item.stars] || RANKS[1];
  const quiet = rank.label === 'לידיעה';
  const rows = [];

  rows.push('<tr><td>' + table('width="100%"', metaRow(item, index, rank)) + '</td></tr>');
  rows.push(spacer(14));

  rows.push('<tr><td style="font-family:' + FONT + ';font-size:' + (quiet ? '21px' : '27px') +
    ';font-weight:bold;color:' + (quiet ? '#55534f' : INK) + ';line-height:' + (quiet ? '27px' : '34px') +
    ';letter-spacing:-0.5px;">' + esc(item.title) + '</td></tr>');

  if (item.summary) {
    rows.push(spacer(13));
    rows.push('<tr><td style="font-family:' + FONT + ';font-size:' + (quiet ? '14.5px' : '15.5px') +
      ';color:' + (quiet ? '#7a7874' : BODY) + ';line-height:26px;">' + nl2br(item.summary) + '</td></tr>');
  }

  if (item.how_to) rows.push(howToBlock(item, rank));
  if (item.prompt) rows.push(promptBlock(item.prompt));
  if (item.angle) rows.push(angleBlock(item.angle));

  if (item.url) {
    rows.push(spacer(16));
    rows.push('<tr><td><a href="' + esc(item.url) + '" style="font-family:' + FONT +
      ';font-size:13px;font-weight:bold;color:' + (quiet ? MUTED : INK) +
      ';letter-spacing:0.6px;text-decoration:none;">קרא במקור &#8592;</a></td></tr>');
  }

  return '<tr><td style="padding:0 40px;">' + table('width="100%"', rows.join('')) + '</td></tr>';
}

function divider() {
  return '<tr><td style="padding:30px 40px;">' +
    '<div style="border-top:4px solid ' + INK + ';font-size:0;line-height:0;">&nbsp;</div>' +
    '</td></tr>';
}

// ---------------------------------------------------------------- מסגרת המייל

function masthead(feed) {
  const now = new Date();
  const stamp = pad(now.getDate()) + '.' + pad(now.getMonth() + 1);
  const n = feed.items.length;
  const line = n === 1
    ? 'דבר אחד שאפשר לעשות איתו משהו היום'
    : n + ' דברים שאפשר לעשות איתם משהו היום';

  return '<tr><td bgcolor="' + INK + '" style="background-color:' + INK + ';padding:34px 40px 30px 40px;">' +
    table('width="100%"',
      '<tr>' +
      '<td valign="middle" style="font-family:' + FONT +
      ';font-size:40px;font-weight:bold;color:#ffffff;letter-spacing:-1.2px;line-height:40px;">פיד AI</td>' +
      '<td valign="middle" align="left">' +
      table('',
        '<tr><td bgcolor="' + ACCENT + '" style="background-color:' + ACCENT + ';">' +
        '<span style="display:inline-block;padding:7px 13px;font-family:' + FONT +
        ';font-size:12px;font-weight:bold;color:#ffffff;letter-spacing:1.4px;">' + esc(stamp) + '</span>' +
        '</td></tr>') +
      '</td></tr>') +
    '<div style="font-size:0;line-height:0;height:18px;">&nbsp;</div>' +
    '<div style="font-family:' + FONT + ';font-size:13px;color:' + MUTED +
    ';letter-spacing:0.5px;line-height:21px;">' + esc(line) + ' &#183; ' + esc(feed.date) + '</div>' +
    '</td></tr>';
}

function footer() {
  return '<tr><td bgcolor="' + INK + '" style="background-color:' + INK + ';padding:22px 40px;' +
    'font-family:' + FONT + ';font-size:11.5px;color:' + MUTED + ';line-height:20px;letter-spacing:0.3px;">' +
    'נבחר מתוך 36 השעות האחרונות. פריט נכנס רק אם אפשר לכתוב לו הוראת הפעלה.' +
    '</td></tr>';
}

function renderEmail(feed) {
  const body = [];
  feed.items.forEach(function (item, i) {
    if (i > 0) body.push(divider());
    body.push(renderItem(item, i + 1));
  });

  const inner = table('width="600" dir="rtl" bgcolor="#ffffff"',
    masthead(feed) +
    spacer(34) +
    body.join('') +
    spacer(34) +
    footer());

  return '<!DOCTYPE html>\n' +
    '<html dir="rtl" lang="he"><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc('פיד AI יומי - ' + feed.date) + '</title>' +
    '</head>' +
    '<body dir="rtl" style="margin:0;padding:0;background-color:' + PAGE + ';">' +
    table('width="100%" dir="rtl" bgcolor="' + PAGE + '"',
      '<tr><td align="center" style="padding:28px 10px;">' + inner + '</td></tr>') +
    '</body></html>';
}

// ---------------------------------------------------------------- ראשי

function hebrewDate() {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date());
  } catch (err) {
    return new Date().toISOString().slice(0, 10);
  }
}

// תקרות ריכוזיות. שלוש הרצות הראו שהנחיה בפרוזה לא מחזיקה, ולכן
// הבדיקה כאן חוסמת רינדור במקום להסתמך על שיקול דעת.
const MAX_PER_SOURCE = 2;
const MAX_PER_URL = 2;

// שכבת העושים: מה שאנשים גילו שאפשר לעשות, להבדיל ממה שחברה הכריזה.
// זה הלב של הפיד, ולכן יש לו רצפה ולא רק המלצה.
const DOER_TYPES = ['שיטה', 'פרומפט', 'טיפ'];
const MIN_ITEMS_FOR_MIX = 5;

function tally(items, key) {
  const counts = new Map();
  items.forEach(function (item) {
    const value = String(item[key] || '').trim().toLowerCase();
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return counts;
}

function checkConcentration(items) {
  const problems = [];

  tally(items, 'source').forEach(function (count, source) {
    if (count > MAX_PER_SOURCE) {
      problems.push('המקור "' + source + '" מופיע ב-' + count + ' פריטים, המקסימום הוא ' + MAX_PER_SOURCE);
    }
  });

  tally(items, 'url').forEach(function (count, url) {
    if (count > MAX_PER_URL) {
      problems.push('הקישור ' + url + ' משמש ' + count + ' פריטים, המקסימום הוא ' + MAX_PER_URL +
        '. כמה פריטים מאותו עמוד הם כרייה מתוך פוסט סיכום, לא חיפוש');
    }
  });

  if (problems.length) {
    throw new Error('הפיד מרוכז מדי ולכן לא רונדר:\n  - ' + problems.join('\n  - ') +
      '\nהשאר את הפריט החזק ביותר מכל מקור, ומצא פריטים אחרים במקומם. אל תשלח את הפיד כמו שהוא.');
  }
}

function checkMix(items) {
  if (items.length < MIN_ITEMS_FOR_MIX) return;

  const doers = items.filter(function (item) {
    return DOER_TYPES.indexOf(String(item.type || '').trim()) !== -1;
  }).length;
  const required = Math.max(2, Math.ceil(items.length / 3));

  if (doers < required) {
    throw new Error('הפיד כולו הודעות ספקים ולכן לא רונדר:\n' +
      '  - יש ' + doers + ' פריטים מסוג ' + DOER_TYPES.join(' / ') + ', ונדרשים לפחות ' + required +
      ' מתוך ' + items.length + '\n' +
      'חפש מה אנשים גילו שאפשר לעשות: פרומפטים, שיטות עבודה וטיפים ב-Reddit, ב-X,\n' +
      'ביוטיוב ובניוזלטרים של יוצרים. פיד שכולו "חברה X הכריזה" הוא לא הפיד הזה.');
  }
}

function normalize(data) {
  if (!data || !Array.isArray(data.items)) throw new Error('הקלט לא מכיל מערך items');

  const items = data.items
    .filter(function (item) { return item && item.title; })
    .map(function (item) {
      let stars = Number(item.stars);
      if (!(stars >= 1 && stars <= 3)) stars = 1;
      return {
        stars: Math.round(stars),
        type: item.type || 'עדכון',
        source: item.source || '',
        title: item.title || '',
        summary: item.summary || '',
        how_to: item.how_to || '',
        prompt: item.prompt || '',
        angle: item.angle || '',
        url: item.url || ''
      };
    })
    .sort(function (a, b) { return b.stars - a.stars; });

  if (!items.length) throw new Error('אין פריטים לרנדר');
  checkConcentration(items);
  checkMix(items);
  return { date: data.date || hebrewDate(), items: items };
}

const inputPath = process.argv[2];
const outputPath = process.argv[3] || 'email.html';

if (!inputPath) {
  console.error('שימוש: node render.js items.json [email.html]');
  process.exit(1);
}

try {
  const feed = normalize(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
  fs.writeFileSync(outputPath, renderEmail(feed), 'utf8');

  // שורת הסיכום נועדה לקלוד: ממנה הוא לוקח את הנושא ואת שם הקובץ לשליחה
  console.log('נרנדרו ' + feed.items.length + ' פריטים אל ' + outputPath);
  console.log('SUBJECT: פיד AI יומי - ' + feed.date);
} catch (err) {
  // הודעה נקייה בלי stack, כדי שהסיבה תהיה קריאה
  console.error(err.message);
  process.exit(1);
}
