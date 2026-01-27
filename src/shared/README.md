# כלים משותפים - Shared

## מה התיקייה הזו עושה?
מכילה **ספריות עזר וכלים משותפים** שכל המודולים בפרויקט צורכים:
ולידציית שדות, מערכת קואורדינטות, רינדור גליפים, ניהול טבלאות, ועוד.

## באילו כלים היא משתתפת?
- **Mapper v3** - schemas, coordinates, tables, layout
- **LiveFill** - schemas, coordinates, rendering
- **Mobile Fill** - schemas, rendering
- **Fill Engine** - schemas, coordinates

## מי קורא לה?
כמעט כל מודול בפרויקט.

## מתי היא פעילה?
תמיד - שימושי כלי עזר.

## קבצים מרכזיים

| קובץ | תפקיד |
|------|--------|
| `fieldSchema.js` | **ולידציית שדות** - תומך V2 (PDF נקודות) ו-V3 (bbox מנורמל). מוודא שכל שדה חוקי |
| `UnifiedCoordinateSystem.js` | **מערכת קואורדינטות אחידה** - המרה בין PDF, canvas, מסך. מטפל ב-DPI ו-device pixel ratio |
| `coordinateTranslator.js` | **תרגום קואורדינטות** - פונקציות עזר להמרה |
| `FieldIntentResolver.js` | **זיהוי כוונת רינדור** - מחליט אם שדה מקבל תאים (perGlyphBoxes) או טקסט חופשי (flowText). גנרי - לא מכיר סמנטיקה |
| `LayoutHelper.js` | **עוזר פריסה** - גישה בטוחה למאפייני layout. תומך בפורמט חדש + legacy. לעולם לא זורק שגיאה |
| `normalizeField.js` | **נירמול שדות** - המרה לפורמט אחיד |
| `migrateV1toV2.js` | **מיגרציה** - המרת נתונים מ-V1 ל-V2 |
| `PerGlyphBoxRenderer.js` | **רינדור תאים** - מצייר תאים לספרות (ת.ז., טלפון, תאריך) |
| `ScaffoldAvoidance.js` | **הימנעות משיכון** - מניעת חפיפה עם אלמנטים קיימים |
| `debounce.js` | **דיבאונס** - עיכוב הפעלה (למניעת קריאות מרובות) |
| `font-paths.js` | **נתיבי פונטים** - הגדרת מיקום פונטים |
| `toast.js` + `toast.css` | **הודעות Toast** - הודעות קצרות למשתמש |
| `TablesCore.js` | **ליבת טבלאות** - placeholder למערכת עתידית |

### תת-תיקייה: `/tables/`
**מודל טבלאות משותף** - ראה README נפרד.
