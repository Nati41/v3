[README.md](https://github.com/user-attachments/files/24195201/README.md)
# Tofesly – PDF Form Mapping & Filling Platform

Tofesly is a professional platform for mapping, filling, and generating complex PDF forms.
It is designed for accountants, tax advisors, mortgage consultants, lawyers, and any organization
that works repeatedly with PDF forms.

The system allows mapping a PDF form **once**, and then filling it **again and again**
for different clients with maximum accuracy.

---

## 🧠 Core Concept

1. **Map once** – Define where each field exists on the PDF
2. **Fill many times** – Reuse the mapped template for unlimited clients
3. **Send link to client** – Client completes missing data online
4. **Generate final PDF** – Accurate, printable, and ready to sign

---

## ⭐ Main Components

### 📐 Mapper v3 (Primary Tool)
**Location:** `/mapper-v3`

The main and authoritative mapping tool.

Features:
- Visual field mapping on PDF
- Text fields, checkboxes, radio groups
- Advanced table mapping (rows & columns)
- Accurate coordinate system
- RTL & Hebrew support
- State-driven mapping flow
- Reusable JSON mapping output

> Mapper v3 is the core product of Tofesly.

---

### ✍️ LiveFill (Client Filling Tool)
**Location:** `/livefill`

- Client-facing filling interface
- Partial pre-fill by advisor
- Client completes remaining fields
- Live preview
- Final PDF generation

---

### ⚙️ Fill Engine
**Location:** `/fill-engine`

- Low-level PDF filling logic
- Font handling (Hebrew support)
- Checkbox & radio rendering
- Final PDF export

---

### 🔁 Shared Core
**Location:** `/shared`

- Unified coordinate system
- Table models & validation
- Field schemas
- Utilities shared between Mapper and LiveFill

---

### 🗂 Legacy Mapper
**Location:** `/mapper`

Older experimental versions.
Kept for reference only.
**Not the main tool.**

---

## 🎯 Target Users

- Accountants / Tax advisors
- Mortgage consultants
- Lawyers
- Payroll & HR departments
- Any organization that repeatedly fills PDF forms

---

## 🚀 Typical Workflow

1. Advisor uploads a PDF form
2. Maps it once using Mapper v3
3. Saves the mapping as a template
4. For each client:
   - Pre-fills known data
   - Sends a filling link to the client
   - Client completes missing fields
5. Final PDF is generated and signed

---

## 🛠 Technology

- Vanilla JavaScript
- Modular architecture
- No backend dependency for mapping
- Designed for future SaaS / API integration

---

## 📌 Status

This repository represents an **active, production-grade foundation**
for a commercial PDF automation platform.

Mapper v3 is considered stable and authoritative.
