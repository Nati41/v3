# מילוי מנייד - Mobile Fill

## מה התיקייה הזו עושה?
**אפליקציית מילוי טפסים מותאמת לנייד.** ממשק מגע, תמיכה במצלמה + OCR,
ניווט שדה-אחרי-שדה מותאם למסך קטן.

## באילו כלים היא משתתפת?
**Mobile Fill** - כלי עצמאי.

## מי קורא לה?
- `mobile-fill.html` - נקודת כניסה
- `mapper-v3.html` - מפנה אוטומטית מכשירים ניידים לכאן

## מתי היא פעילה?
כשמשתמש פותח את האפליקציה מטלפון או טאבלט.

## קבצים מרכזיים

### ליבה
| קובץ | תפקיד |
|------|--------|
| `mobile-fill.html` | **נקודת כניסה** |
| `js/bootstrap.js` | **אתחול** - טעינת מודולים |
| `js/mobile-flow-controller.js` | **בקר זרימה** - ניהול מצבים: טעינת PDF → ניווט שדות → ייצוא |
| `js/state-store.js` | **ניהול מצב** |
| `js/event-bus.js` | **מערכת אירועים** |

### PDF ותצוגה
| קובץ | תפקיד |
|------|--------|
| `js/mobile-pdf-viewer.js` | **תצוגת PDF** מותאמת למגע |
| `js/pdf-loader.js` | **טעינת PDF** |
| `js/pdf-upload.js` | **העלאת קבצים** |
| `js/hotspot-overlay.js` | **נקודות מגע** - אזורים אינטראקטיביים על ה-PDF |
| `js/live-preview-renderer.js` | **תצוגה מקדימה חיה** |

### קלט ומילוי
| קובץ | תפקיד |
|------|--------|
| `js/mobile-input-panel.js` | **פאנל קלט** מותאם למגע |
| `js/popover-input-controller.js` | **פופובר קלט** |
| `js/field-navigator.js` | **ניווט שדות** - קדימה/אחורה |
| `js/validation-engine.js` | **ולידציה** - בדיקת תקינות שדות |
| `js/mobile-ocr-service.js` | **OCR** - זיהוי טקסט ממצלמה (Tesseract.js) |

### ייצוא
| קובץ | תפקיד |
|------|--------|
| `js/export-controller.js` | **בקר ייצוא** |
| `js/export-gate.js` | **שער ייצוא** - הגבלות (למשל demo mode) |
| `js/export-button.js` | **כפתור ייצוא** |
| `js/export-blocked-banner.js` | **באנר חסימה** |

### קטלוג טפסים
| קובץ | תפקיד |
|------|--------|
| `js/form-catalog-service.js` | **שירות קטלוג** - טעינת רשימת טפסים |
| `js/form-selector-screen.js` | **מסך בחירה** |
| `js/form-list-ui.js` | **רשימת טפסים** |
| `data/form-catalog.json` | **קטלוג** - מטא-דאטה של טפסים זמינים |

### עוזרים
| קובץ | תפקיד |
|------|--------|
| `js/mapping-loader.js` | טעינת תבניות מיפוי |
| `js/smart-import-service.js` | ייבוא חכם |
| `js/quickfill-editor.js` | עריכת QuickFill |
| `js/landscape-gate.js` | הגבלת מצב landscape |
| `js/toast-manager.js` | הודעות Toast |
| `js/ui-status.js` | סטטוס UI |
| `js/mobile-debug-console.js` | קונסולת דיבאג |
| `js/event-logger.js` | תיעוד אירועים |
