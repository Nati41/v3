# כלי המיפוי הראשי - Mapper v3

## מה התיקייה הזו עושה?
זהו **הכלי המרכזי של הפרויקט** - כאן מתבצע המיפוי החזותי של טפסי PDF.
המשתמש פותח טופס PDF, מסמן שדות (טקסט, צ'קבוקס, רדיו, טבלה, חתימה),
והמערכת שומרת תבנית JSON שמתארת בדיוק איפה כל שדה נמצא.

## מבנה התיקייה
```
mapper-v3/
├── mapper-v3.html      ← נקודת כניסה ראשית (HTML + כל ה-scripts)
├── core/               ← ליבת מיפוי (State, Events, Templates, Auth)
├── engines/            ← מנועי עיבוד (AutoBoxer, Draw, Overlay, PDF...)
├── ai/                 ← אינטגרציית AI (Claude API, פרומפטים)
├── ui/                 ← ממשק משתמש (דיאלוגים, מסכים, סרגל צד)
├── reverse-mapping/    ← מצב ניסיוני (ציור פיזי + זיהוי AI)
├── pre-mapper/         ← עיבוד מקדים (ייבוא JSON, זיהוי טבלאות)
├── overlay/            ← שכבת תוויות חזותית
├── helpers/            ← עוזרים (בחירת שמות קנוניים)
├── tables/             ← ניהול טבלאות (stub - מערכת ישנה)
├── styles/             ← קבצי CSS
├── shared/             ← סימלינק ל-../shared
└── fonts/              ← סימלינק ל-../livefill/fonts
```

## מצבי עבודה
1. **מיפוי מונחה (Guided)** - תבנית AI מציעה שדות, המשתמש ממפה אחד אחד
2. **מיפוי חופשי** - המשתמש מצייר שדות באופן חופשי
3. **מצב ניסיוני (Reverse)** - ציור פיזי בלבד, AI מזהה משמעות

## זרימת עבודה טיפוסית
```
טעינת PDF → בחירת כלי ציור → לחיצה על שדה →
AutoBoxer מזהה גבולות → BboxRefiner משפר →
TextExtractor שולף שם → StateManager שומר →
OverlayRenderer מציג → ייצוא JSON
```

## תלויות
- `/src/core/` - תשתית (State, Events, PDF)
- `/src/shared/` - כלים משותפים (schemas, coordinates, tables)
- `/src/fill-engine/` - לייצוא תבניות מילוי
