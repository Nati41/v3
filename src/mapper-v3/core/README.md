# ליבת המיפוי - Mapper Core

## מה התיקייה הזו עושה?
מכילה את **הלוגיקה העסקית** של כלי המיפוי: ניהול מצב שדות, מערכת אירועים,
ניהול תבניות, אימות, ייצוא, אותנטיקציה, ומעקב אחרי כוונת משתמש.

## באילו כלים היא משתתפת?
Mapper v3 בלבד (אבל חלק מהמודולים מייצאים נתונים ל-Fill Engine ו-LiveFill).

## מי קורא לה?
- `engines/` - המנועים צורכים State ו-Events
- `ui/` - הממשק צורך State, Events, TemplateStore
- `ai/` - שירות AI צורך FieldIntelligenceStore
- `reverse-mapping/` - מצב ניסיוני צורך State ו-Events

## מתי היא פעילה?
מרגע טעינת ה-Mapper ועד סגירתו. תמיד פעילה ברקע.

## קבצים מרכזיים

| קובץ | תפקיד |
|------|--------|
| `MapperCore.js` | **התזמורן הראשי** - מאתחל את כל המנועים וה-UI, מנהל מקשי קיצור, טעינת PDF, זרימות עבודה. Singleton: `mapper` |
| `StateManager.js` | **מקור אמת יחיד** - כל השדות, קבוצות רדיו, טבלאות, ומצב UI. תומך undo/redo. Singleton: `state` |
| `EventBus.js` | **מערכת אירועים** - 50+ סוגי אירועים. מוניטור ביצועים עם מצב חירום. Singleton: `eventBus` |
| `TemplateStore.js` | **ניהול תבנית AI** - מעקב: שדות שמופו / לא מופו / דולגו. ADDITIVE ONLY. Singleton: `templateStore` |
| `FieldIntelligenceStore.js` | **מאגר אינטליגנציה** - נתוני AI סמנטיים (שם קנוני, הקשר). שומר ב-IndexedDB. Singleton: `fieldIntelligenceStore` |
| `IntentManager.js` | **ניהול כוונות** - מה המשתמש מנסה לעשות (ציור שדה, הנחה, לכידת כותרת...). מחליף 5 דגלים ישנים. Singleton: `intentManager` |
| `TableRegionManager.js` | **אזורי טבלה** (v3.10) - המשתמש מגדיר אזור טבלה, המערכת מזהה שדות בתוכו. Singleton: `tableRegionManager` |
| `FillEngineExporter.js` | **ייצוא למנוע מילוי** - ממזג קואורדינטות (State) + סמנטיקה (AI) ל-JSON. Singleton: `fillEngineExporter` |
| `TemplateValidator.js` | **ולידציה** (v3.4) - מאמת שלמות שדות לפני ייצוא. חוסם ייצוא בשגיאות |
| `AuthManager.js` | **אותנטיקציה** - רמות גישה: PUBLIC (מילוי בלבד) / AUTHORIZED (גישה מלאה) |
| `RecentPDFs.js` | **קבצים אחרונים** (v3.9) - שומר 5 PDF אחרונים ב-IndexedDB לטעינה מהירה |
| `auth-config.js` | **הגדרות אימות** - מפתח אחסון, זמן תפוגה |
