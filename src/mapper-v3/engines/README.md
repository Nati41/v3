# מנועי עיבוד - Engines

## מה התיקייה הזו עושה?
מכילה את **המנועים** שעושים את העבודה הכבדה של המיפוי:
רינדור PDF, זיהוי גבולות שדות, ציור, חילוץ טקסט, גרירה, זום, ובחירת מילים.

> זהו הלב הטכנולוגי של כלי המיפוי. רוב הקבצים כאן מסומנים כ-PROTECTED
> ולא אמורים להשתנות ללא בדיקה מעמיקה.

## באילו כלים היא משתתפת?
- **Mapper v3** - כל המנועים
- **מצב ניסיוני** - AutoBoxer, BboxRefiner, DrawController (עם חיתוך מוקדם)

## מי קורא לה?
- `MapperCore.js` מאתחל את כל המנועים
- `ui/` - ה-UI מפעיל מנועים דרך Events ו-State
- `reverse-mapping/` - משתמש ב-DrawController עם אירוע REVERSE_DRAW_COMPLETE

## מתי היא פעילה?
מרגע טעינת PDF ועד סגירת ה-Mapper. חלק מהמנועים פעילים רק בפעולות ספציפיות.

## קבצים מרכזיים

| קובץ | תפקיד | סטטוס |
|------|--------|-------|
| `PDFEngine.js` | רינדור PDF ב-300 DPI → PNG → תמונה. Cache לדפים. | יציב |
| `AutoBoxer.js` | **מנוע פיזיקה** - זיהוי גבולות שדה מנקודת לחיצה. עובד על פיקסלים בלבד. | v1.0.2 PROTECTED |
| `BboxRefiner.js` | **שיפור הדרגתי** - מועמדים לכל צלע, לחיצה מרחיבה/מכווצת. | v1.0.0 PROTECTED |
| `DrawController.js` | **ניהול ציור** - מתרגם אירועי עכבר לפעולות מיפוי. משלב AutoBoxer + BboxRefiner. | PROTECTED |
| `OverlayRenderer.js` | **שכבה חזותית** - מציג מלבנים צבעוניים מעל ה-PDF. תומך ghost overlays. | יציב |
| `TextExtractor.js` | **חילוץ טקסט** - pdf.js ראשי, OCR (Tesseract) חלופי. רק טקסט בתוך המלבן. | יציב |
| `FieldNamer.js` | **שמות שדות** - עברית→אנגלית. מילון ידוע (שם פרטי→first_name) + טרנסליטרציה. | יציב |
| `LabelDetectionV2.js` | **זיהוי תוויות** - סריקה חכמה RTL, קיבוץ לפי שורה, סינון רעש. | v2 |
| `DragController.js` | **גרירה** - העברה ושינוי גודל שדות. פורט מדויק מ-V2. | יציב |
| `ViewportController.js` | **זום ופאן** - גלגלת עכבר לזום, גרירה לפאן. | יציב |
| `WordSelector.js` | **בחירת מילים** - המשתמש בוחר מילים מטקסט ה-PDF לבניית שם שדה. | יציב |
| `RefinerConfig.js` | **קונפיגורציה** - פרמטרים של AutoBoxer ו-BboxRefiner. מוקפא (frozen). | v1.0.0 LOCKED |

## זרימת ציור שדה (Flow)
```
לחיצת עכבר → DrawController._startDraw()
  → AutoBoxer.findBbox() → מלבן ראשוני
  → BboxRefiner.refine() → שיפור הדרגתי
  → DrawController._finishDraw()
    → [מצב רגיל] StateManager.addField() + OverlayRenderer
    → [מצב ניסיוני] emit('REVERSE_DRAW_COMPLETE') → ReverseMappingMode
```
