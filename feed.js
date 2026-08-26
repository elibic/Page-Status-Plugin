#!/usr/bin/env node
'use strict';

// פיד AI יומי
// קורא ל-Anthropic Messages API עם כלי חיפוש ברשת, מקבל JSON של פריטים
// בעברית, מרנדר מייל HTML ב-RTL ושולח דרך SMTP.
// אין תלויות מעבר ל-nodemailer, אין build step.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HISTORY_FILE = path.join(ROOT, 'history.json');
const ARCHIVE_DIR = path.join(ROOT, 'archive');

const HISTORY_LIMIT = 300;   // כמה פריטים לשמור בהיסטוריה
const TITLES_IN_PROMPT = 120; // כמה כותרות אחרונות להזריק לפרומפט

const DRY_RUN = process.argv.includes('--dry-run');
const FIXTURE = process.env.FEED_FIXTURE || '';

const CONFIG = {
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  model: process.env.MODEL || 'claude-sonnet-5',
  itemCount: Number(process.env.ITEM_COUNT || 15),
  accent: process.env.FEED_ACCENT || '#3730a3',
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  mailTo: process.env.MAIL_TO || ''
};

const ACCENT = CONFIG.accent;

// ---------------------------------------------------------------- היסטוריה

function readHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return { entries: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    if (!raw || !Array.isArray(raw.entries)) return { entries: [] };
    return raw;
  } catch (err) {
    console.warn('אזהרה: history.json לא נקרא כראוי, מתחיל מהיסטוריה ריקה -', err.message);
    return { entries: [] };
  }
}

function writeHistory(history, items, dateLabel) {
  const stamp = new Date().toISOString();
  const fresh = items.map(function (item) {
    return {
      title: item.title || '',
      url: item.url || '',
      type: item.type || '',
      source: item.source || '',
      date: dateLabel || '',
      added_at: stamp
    };
  });
  const entries = fresh.concat(history.entries).slice(0, HISTORY_LIMIT);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify({ entries: entries }, null, 2) + '\n', 'utf8');
  return entries.length;
}

function recentTitles(history) {
  return history.entries
    .slice(0, TITLES_IN_PROMPT)
    .map(function (entry) { return entry.title; })
    .filter(Boolean);
}

// ---------------------------------------------------------------- הפרומפט

function buildPrompt(titles, count) {
  const seen = titles.length
    ? titles.map(function (title, i) { return (i + 1) + '. ' + title; }).join('\n')
    : '(אין היסטוריה עדיין - זו ההרצה הראשונה)';

  return [
    'אתה עורך של פיד AI יומי בעברית. תפקידך לחפש ברשת ולהחזיר ' + count + ' פריטים.',
    '',
    'קהל היעד:',
    'בעלי עסקים, מנהלים, שכירים ועצמאיים שמשתמשים ב-AI בעבודה היומיומית.',
    'הם לא מתכנתים. אם פריט דורש כתיבת קוד - הוא לא מתאים.',
    '',
    'מקורות לחיפוש:',
    'The Rundown AI, Superhuman AI, TLDR AI, Ben\'s Bites, The Neuron,',
    'ההודעות הרשמיות של Anthropic, OpenAI, Google ו-Microsoft Copilot,',
    'ותתי הרדיט r/ChatGPT, r/ArtificialInteligence, r/PromptEngineering.',
    'רק תוכן מ-36 השעות האחרונות.',
    '',
    'מה נכנס לפיד:',
    '- כלים ופיצ\'רים חדשים שאפשר להתחיל להשתמש בהם',
    '- טיפים ופרומפטים שעובדים',
    '- שימושים אמיתיים בשיווק, שירות, מכירות, ניהול, כספים ותפעול',
    '- שינויי מחיר, מגבלות שימוש ותנאי מנוי',
    '',
    'מה לא נכנס:',
    '- גיוסי הון, שווי חברות, עסקאות',
    '- מינויים ועזיבות של אנשים',
    '- מאמרי מחקר ובנצ\'מרקים',
    '- ספקולציות על העתיד ו"מה זה אומר על התעשייה"',
    '- כל דבר שדורש קוד או ידע טכני',
    '',
    'מניעת חזרות - חשוב מאוד:',
    'אלה הכותרות שכבר נשלחו בפידים קודמים. אסור להביא פריט שדומה להם מהותית,',
    'גם אם הניסוח שונה לגמרי, וגם אם המקור אחר:',
    seen,
    '',
    'אם כמה מקורות מדווחים על אותו סיפור - אחד אותם לפריט אחד.',
    'אסור להמציא קישורים. כל URL חייב להגיע מתוצאות חיפוש אמיתיות שראית.',
    'אם לא מצאת מספיק פריטים איכותיים - החזר פחות, אל תמלא בזבל.',
    '',
    'דירוג כוכבים לפי ישימות, לא לפי כמה זה מרשים:',
    '3 = אפשר להתחיל להשתמש בזה היום, בלי מחסומים',
    '2 = דורש הגדרה, מנוי בתשלום או המתנה לגישה',
    '1 = טוב לדעת, אבל אין מה לעשות עם זה כרגע',
    'מיין את הפריטים מ-3 ל-1.',
    '',
    'השדה how_to הוא הלב של הפיד. הוא לא השראה ולא "זה מראה על מגמה של",',
    'אלא הוראות הפעלה: איפה בדיוק לוחצים, מה צריך כדי להפעיל (מנוי? תוסף? הרשאת מנהל?),',
    'וכמה זמן זה לוקח. אם אי אפשר להשתמש בזה עדיין - תגיד את זה במפורש ואל תמציא הוראות.',
    'אם אין הוראה מעשית אמיתית - זה פריט של כוכב אחד.',
    '',
    'החזר JSON בלבד, בלי טקסט לפני או אחרי, בדיוק במבנה הזה:',
    '{"date":"תאריך בעברית","items":[{',
    '  "stars": 1-3,',
    '  "type": "כלי | טיפ | עדכון | שינוי מחיר",',
    '  "source": "שם המקור",',
    '  "title": "עד 10 מילים",',
    '  "summary": "2-3 משפטים: מה קרה ומה החידוש",',
    '  "how_to": "ההוראה המעשית",',
    '  "prompt": "נוסח פרומפט מלא באנגלית, אופציונלי",',
    '  "angle": "זווית לקהילה, רק אם יש משהו ממש טוב, אופציונלי",',
    '  "url": "קישור"',
    '}]}',
    '',
    'כל הטקסט בעברית, למעט שדה prompt שנכתב באנגלית.'
  ].join('\n');
}

// ---------------------------------------------------------------- קריאה ל-API

async function callApi(prompt) {
  if (!CONFIG.apiKey) throw new Error('חסר ANTHROPIC_API_KEY');

  const body = {
    model: CONFIG.model,
    max_tokens: 12000,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 20 }],
    messages: [{ role: 'user', content: prompt }]
  };

  console.log('שולח בקשה ל-Anthropic, מודל ' + CONFIG.model + ' ...');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CONFIG.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error('ה-API החזיר שגיאה ' + res.status + ': ' + detail.slice(0, 500));
  }

  const data = await res.json();
  const blocks = Array.isArray(data.content) ? data.content : [];
  const text = blocks
    .filter(function (block) { return block && block.type === 'text'; })
    .map(function (block) { return block.text || ''; })
    .join('\n');

  const searches = blocks.filter(function (b) { return b && b.type === 'server_tool_use'; }).length;
  console.log('התקבלה תשובה. חיפושים שבוצעו: ' + searches);

  return text;
}

// ---------------------------------------------------------------- פענוח JSON

function extractJson(text) {
  let clean = String(text || '').trim();

  // הסרת code fences אם המודל עטף את התשובה
  clean = clean.replace(/```[a-zA-Z]*\s*/g, '').replace(/```/g, '');

  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first !== -1 && last > first) clean = clean.slice(first, last + 1);

  try {
    return JSON.parse(clean);
  } catch (err) {
    throw new Error('נכשל פענוח ה-JSON מהתשובה. 300 התווים הראשונים:\n' + String(text || '').slice(0, 300));
  }
}

function normalize(data) {
  if (!data || !Array.isArray(data.items)) throw new Error('התשובה לא מכילה מערך items');

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

  return { date: data.date || hebrewDate(), items: items };
}

function hebrewDate() {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date());
  } catch (err) {
    return new Date().toISOString().slice(0, 10);
  }
}

// ---------------------------------------------------------------- רינדור המייל

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

// ---------------------------------------------------------------- ארכיון

function saveArchive(html) {
  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const name = new Date().toISOString().slice(0, 10) + '.html';
  const target = path.join(ARCHIVE_DIR, name);
  fs.writeFileSync(target, html, 'utf8');
  return target;
}

// ---------------------------------------------------------------- שליחה

async function sendMail(subject, html) {
  const missing = ['SMTP_USER', 'SMTP_PASS', 'MAIL_TO'].filter(function (key) { return !process.env[key]; });
  if (missing.length) throw new Error('חסרים משתני סביבה לשליחה: ' + missing.join(', '));

  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: CONFIG.smtpHost,
    port: CONFIG.smtpPort,
    secure: CONFIG.smtpPort === 465,
    auth: { user: CONFIG.smtpUser, pass: CONFIG.smtpPass }
  });

  const info = await transport.sendMail({
    from: '"פיד AI יומי" <' + CONFIG.smtpUser + '>',
    to: CONFIG.mailTo,
    subject: subject,
    html: html
  });

  return info.messageId;
}

// ---------------------------------------------------------------- ראשי

async function main() {
  const history = readHistory();
  console.log('היסטוריה: ' + history.entries.length + ' פריטים שמורים');

  let raw;
  if (FIXTURE) {
    console.log('מצב fixture: קורא מ-' + FIXTURE + ' במקום מה-API');
    raw = fs.readFileSync(path.resolve(FIXTURE), 'utf8');
  } else {
    raw = await callApi(buildPrompt(recentTitles(history), CONFIG.itemCount));
  }

  const feed = normalize(extractJson(raw));
  if (!feed.items.length) throw new Error('לא התקבלו פריטים');
  console.log('התקבלו ' + feed.items.length + ' פריטים לתאריך ' + feed.date);

  const html = renderEmail(feed);
  const archived = saveArchive(html);
  console.log('נשמר ארכיון: ' + path.relative(ROOT, archived));

  if (DRY_RUN) {
    console.log('מצב --dry-run: לא נשלח מייל');
  } else {
    const messageId = await sendMail('פיד AI יומי - ' + feed.date, html);
    console.log('המייל נשלח אל ' + CONFIG.mailTo + ' (' + messageId + ')');
  }

  const total = writeHistory(history, feed.items, feed.date);
  console.log('history.json עודכן, סך הכל ' + total + ' פריטים');
}

main().catch(function (err) {
  console.error('נכשל: ' + err.message);
  process.exit(1);
});
