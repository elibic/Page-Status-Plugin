#!/usr/bin/env node
'use strict';

// רינדור מייל הפיד היומי מ-JSON ל-HTML.
// דטרמיניסטי לגמרי - אותו קלט מייצר בדיוק אותו פלט, כדי שהעיצוב
// לא יזוז מיום ליום.
//
//   node render.js items.json email.html
//
// אפשר לשלוט בצבע המותג דרך משתנה הסביבה FEED_ACCENT.

const fs = require('fs');

const ACCENT = process.env.FEED_ACCENT || '#3730a3';

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

function starDots(count) {
  const full = Math.max(0, Math.min(3, Number(count) || 0));
  let out = '';
  for (let i = 0; i < 3; i++) {
    const color = i < full ? ACCENT : '#d4d4d8';
    out += '<span style="color:' + color + ';font-size:14px;line-height:14px;">&#9679;</span>';
  }
  return out;
}

function renderPromptBlock(text) {
  // הפרומפט באנגלית - כיוון ויישור נפרדים כדי שלא יתהפך ב-RTL
  return '' +
    '<tr><td style="padding:0 0 12px 0;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">' +
    '<tr><td style="padding:0 0 5px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;color:#71717a;">פרומפט מוכן להעתקה</td></tr>' +
    '<tr><td dir="ltr" style="direction:ltr;text-align:left;background-color:#f4f4f5;border:1px solid #e4e4e7;border-radius:4px;padding:12px;font-family:Consolas,Monaco,monospace;font-size:13px;line-height:19px;color:#27272a;">' +
    nl2br(text) +
    '</td></tr></table></td></tr>';
}

function renderItem(item, index) {
  const rows = [];

  // שורת מטא: נקודות דירוג + סוג + מקור
  rows.push('' +
    '<tr><td style="padding:0 0 10px 0;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">' +
    '<tr>' +
    '<td style="padding:0 0 0 8px;white-space:nowrap;">' + starDots(item.stars) + '</td>' +
    '<td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#ffffff;background-color:' + ACCENT + ';border-radius:3px;">' +
    '<span style="display:inline-block;padding:3px 8px;">' + esc(item.type) + '</span></td>' +
    (item.source
      ? '<td style="padding:0 8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#71717a;">' + esc(item.source) + '</td>'
      : '') +
    '</tr></table></td></tr>');

  // כותרת ממוספרת
  rows.push('' +
    '<tr><td style="padding:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;line-height:26px;color:#18181b;">' +
    index + '. ' + esc(item.title) +
    '</td></tr>');

  if (item.summary) {
    rows.push('' +
      '<tr><td style="padding:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#3f3f46;">' +
      nl2br(item.summary) +
      '</td></tr>');
  }

  if (item.how_to) {
    rows.push('' +
      '<tr><td style="padding:0 0 12px 0;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#f6f6fb;border-right:3px solid ' + ACCENT + ';">' +
      '<tr><td style="padding:12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:23px;color:#27272a;">' +
      '<span style="font-weight:bold;color:' + ACCENT + ';">איך עושים את זה: </span>' +
      nl2br(item.how_to) +
      '</td></tr></table></td></tr>');
  }

  if (item.prompt) rows.push(renderPromptBlock(item.prompt));

  if (item.angle) {
    rows.push('' +
      '<tr><td style="padding:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#52525b;">' +
      '<span style="font-weight:bold;color:#18181b;">זווית לקהילה: </span>' + nl2br(item.angle) +
      '</td></tr>');
  }

  if (item.url) {
    rows.push('' +
      '<tr><td style="padding:4px 0 0 0;border-top:1px solid #f0f0f2;">' +
      '<a href="' + esc(item.url) + '" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:' + ACCENT + ';text-decoration:none;">' +
      'קרא במקור &#8592;</a></td></tr>');
  }

  return '' +
    '<tr><td style="padding:0 0 16px 0;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" dir="rtl" style="border-collapse:collapse;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:6px;">' +
    '<tr><td style="padding:18px 20px;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">' +
    rows.join('') +
    '</table></td></tr></table></td></tr>';
}

function renderEmail(feed) {
  const items = feed.items.map(function (item, i) { return renderItem(item, i + 1); }).join('');

  return '' +
'<!DOCTYPE html>\n' +
'<html dir="rtl" lang="he"><head>' +
'<meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>' + esc('פיד AI יומי - ' + feed.date) + '</title>' +
'</head>' +
'<body dir="rtl" style="margin:0;padding:0;background-color:#f1f1f4;">' +
'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" dir="rtl" style="border-collapse:collapse;background-color:#f1f1f4;">' +
'<tr><td align="center" style="padding:20px 10px;">' +

'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" dir="rtl" style="border-collapse:collapse;width:600px;max-width:600px;">' +

// כותרת עליונה
'<tr><td style="padding:0 0 16px 0;">' +
'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:' + ACCENT + ';border-radius:6px;">' +
'<tr><td style="padding:22px 20px;text-align:right;">' +
'<div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#ffffff;line-height:30px;">פיד AI יומי</div>' +
'<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#dcdcf5;line-height:20px;padding-top:4px;">' +
esc(feed.date) + ' &#183; ' + feed.items.length + ' פריטים' +
'</div>' +
'</td></tr></table></td></tr>' +

// מקרא
'<tr><td style="padding:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#71717a;text-align:right;">' +
starDots(3) + ' אפשר להתחיל היום &#160;&#160; ' +
starDots(2) + ' דורש הגדרה או תשלום &#160;&#160; ' +
starDots(1) + ' טוב לדעת' +
'</td></tr>' +

items +

// תחתית
'<tr><td style="padding:8px 4px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#a1a1aa;text-align:right;">' +
'נשלח אוטומטית מהריפו שלך ב-GitHub Actions&#8207;. כדי לשנות מקורות, מספר פריטים או צבע - ערוך את feed.js&#8207;.' +
'</td></tr>' +

'</table></td></tr></table></body></html>';
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
  return { date: data.date || hebrewDate(), items: items };
}

const inputPath = process.argv[2];
const outputPath = process.argv[3] || 'email.html';

if (!inputPath) {
  console.error('שימוש: node render.js items.json [email.html]');
  process.exit(1);
}

const feed = normalize(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
fs.writeFileSync(outputPath, renderEmail(feed), 'utf8');

// שורת הסיכום נועדה לקלוד: ממנה הוא לוקח את הנושא ואת שם הקובץ לשליחה
console.log('נרנדרו ' + feed.items.length + ' פריטים אל ' + outputPath);
console.log('SUBJECT: פיד AI יומי - ' + feed.date);
