# פיד AI יומי

כל בוקר GitHub Actions מריץ סקריפט Node אחד, שקורא ל-Anthropic Messages API
עם כלי חיפוש ברשת, מקבל בחזרה 15 פריטי AI בעברית, מרנדר מייל HTML ב-RTL
ושולח אותו במייל. אין שרת, אין n8n, אין RSS.

## מבנה

```
feed.js                       הכל בקובץ אחד
.github/workflows/daily.yml   התזמון היומי
history.json                  היסטוריית הפריטים, למניעת חזרות
archive/                      עותק HTML של כל מייל שנשלח
```

## Secrets

הגדר ב-Settings > Secrets and variables > Actions > Secrets:

| Secret | מה זה |
|---|---|
| `ANTHROPIC_API_KEY` | מפתח API מ-console.anthropic.com |
| `SMTP_USER` | כתובת הג'ימייל השולחת |
| `SMTP_PASS` | App Password של גוגל, לא הסיסמה הרגילה |
| `MAIL_TO` | לאן לשלוח. אפשר כמה כתובות מופרדות בפסיק |

## משתנים אופציונליים

אלה נכנסים תחת Variables (לא Secrets) באותו מסך:

| Variable | ברירת מחדל | מה זה |
|---|---|---|
| `FEED_ACCENT` | `#3730a3` | צבע המותג של המייל |
| `ITEM_COUNT` | `15` | כמה פריטים לבקש |
| `MODEL` | `claude-sonnet-5` | המודל |
| `SMTP_HOST` | `smtp.gmail.com` | שרת SMTP אחר |
| `SMTP_PORT` | `465` | פורט. 465 עובד ב-secure |

## איך מקבלים App Password מגוגל

1. הפעל אימות דו-שלבי בחשבון: myaccount.google.com > Security > 2-Step Verification.
   בלי זה האפשרות לא תופיע בכלל.
2. גש ל-myaccount.google.com/apppasswords
3. תן שם כלשהו (למשל `ai-feed`) ולחץ Create
4. גוגל יציג סיסמה של 16 תווים. העתק אותה בלי הרווחים והדבק ב-`SMTP_PASS`
5. הסיסמה מוצגת פעם אחת בלבד. אם איבדת אותה - צור חדשה ומחק את הישנה

## איפה משנים מה

- **מקורות ותוכן הפיד** - הפונקציה `buildPrompt` ב-`feed.js`. שם רשומים
  המקורות, מה נכנס, מה לא נכנס וכללי הדירוג
- **מספר פריטים** - Variable בשם `ITEM_COUNT`, או ברירת המחדל ב-`CONFIG`
- **צבע** - Variable בשם `FEED_ACCENT`, או ברירת המחדל ב-`CONFIG`
- **עיצוב המייל** - הפונקציות `renderItem` ו-`renderEmail`
- **שעה** - שורת ה-`cron` ב-`.github/workflows/daily.yml`

## שעת ההרצה

ה-cron של GitHub Actions רץ ב-UTC בלבד, בלי שעון קיץ.
`0 4 * * *` פירושו **07:00 בשעון ישראל בקיץ ו-06:00 בחורף**.
אם חשוב לך שהמייל יגיע תמיד ב-07:00, שנה את השעה פעמיים בשנה.

בפועל GitHub לא מריץ את ה-cron בדיוק בשעה - עיכוב של כמה דקות הוא נורמלי,
ובשעות עומס הוא יכול להגיע לחצי שעה.

## הרצה ידנית

Actions > פיד AI יומי > Run workflow.

## הרצה מקומית

```bash
npm install nodemailer --no-save

# הרצה מלאה
ANTHROPIC_API_KEY=... SMTP_USER=... SMTP_PASS=... MAIL_TO=... node feed.js

# רק רינדור לארכיון, בלי לשלוח מייל
ANTHROPIC_API_KEY=... node feed.js --dry-run

# בדיקת העיצוב בלי לגעת ב-API, מקובץ JSON מקומי
FEED_FIXTURE=fixture.json node feed.js --dry-run
```

שים לב: גם הרצת `--dry-run` מעדכנת את `history.json`, כדי שאפשר יהיה לבדוק
את מנגנון מניעת החזרות מקומית. אם אתה מריץ ניסויים - החזר את הקובץ
ל-`{"entries":[]}` לפני commit.

## מניעת חזרות

אחרי כל שליחה מוצלחת הפריטים החדשים נדחפים לראש `history.json`, שנשמר על
300 הפריטים האחרונים. בהרצה הבאה 120 הכותרות האחרונות נכנסות לפרומפט עם
הוראה לא להביא פריט דומה מהותית, גם בניסוח שונה.
ה-Action עושה commit של הקובץ חזרה לריפו, ולכן ההיסטוריה נשמרת בין הרצות.
