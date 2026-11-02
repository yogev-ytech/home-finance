# כלכלת הבית

אפליקציית ווב פרטית לניהול כלכלת משק הבית: ייבוא פירוטי כרטיסי אשראי (Excel) ותנועות עו"ש (PDF), סיווג אוטומטי של הוצאות, הצלבה בין חיובי אשראי בבנק לבין הפירוט שלהם, וניתוח הוצאות.

## איך זה בנוי

| רכיב | מה הוא עושה |
| --- | --- |
| `index.html`, `css/`, `js/app.js` | הממשק |
| `js/parse.js` | קריאת קובצי הפירוט, סיווג והצלבה. רץ בדפדפן בלבד |
| `js/store.js` | התחברות עם Google ושמירה ב-Cloud Firestore |
| `js/firebase-config.js` | פרטי הזיהוי של פרויקט Firebase. ציבוריים מעצם התכנון |
| `firestore.rules` | מי רשאי לקרוא ולכתוב. זה מה שמגן על הנתונים |
| `vendor/` | ספריות בגרסאות נעולות: Firebase 12.19.0, SheetJS 0.18.5, pdf.js 3.11.174 |

## אבטחה ופרטיות

- קובצי הפירוט נקראים בדפדפן. לענן נשמרות רק התנועות שחולצו מהם, בלי מספרי חשבון ובלי מספרי כרטיס.
- הקוד ציבורי, הנתונים לא. הגישה לנתונים נקבעת ב-`firestore.rules`: רק כתובות Gmail שמופיעות שם, ורק אחרי אימות של Google.
- אסור להעלות ל-repository קובצי Excel, PDF או גיבוי. `.gitignore` חוסם אותם.

## הגדרה

1. ב-Firebase console, Firestore Database, לשונית Rules: מדביקים את התוכן של `firestore.rules`, מחליפים את הכתובות בכתובות של בני המשפחה, ולוחצים Publish.
2. ב-Authentication, Settings, Authorized domains: מוודאים ש-`yogev-ytech.github.io` ברשימה.
3. האתר מתפרסם ב-Firebase Hosting בכתובת https://home-finance-ytech.firebaseapp.com. כל שינוי שנדחף ל-`main` עולה אוטומטית דרך `.github/workflows/deploy.yml`.
4. הפרסום דורש סוד בשם `FIREBASE_SERVICE_ACCOUNT` ב-Settings, Secrets and variables, Actions: מפתח JSON של חשבון שירות עם התפקידים Firebase Hosting Admin ו-Service Usage Consumer בלבד.
5. האפליקציה יושבת באותו דומיין כמו חלון ההתחברות של Google, וכך ההתחברות עובדת גם ב-Safari ובאייפון. הכתובות הישנות (GitHub Pages ו-web.app) מעבירות אליה אוטומטית.

## עדכון כתובות מורשות

עורכים את הרשימה ב-`firestore.rules` ומפרסמים אותה מחדש ב-Firebase console. שינוי בקובץ ב-GitHub לבד לא מספיק.
