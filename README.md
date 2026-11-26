# ApnaDukan — Offline Shop Stock & Billing PWA

<p align="center">
  <img src="./icons/logo-wordmark.svg" alt="ApnaDukan Logo" width="340">
</p>

**ApnaDukan** is a clean, 100% offline, mobile-first **Progressive Web App (PWA)** for small and medium retail shops to manage inventory, stock purchases, and PDF billing directly in the browser using `localStorage`.

---

## Key Features

- **Installable Offline PWA:** Install on mobile or desktop and run 100% offline (`sw.js` + `manifest.webmanifest`).
- **1-Click Top-Bar JSON Backup:** Save a complete `.json` backup straight from the header bar or the top of Settings.
- **Sales & Profit Tracking:** Switch cleanly between **Today**, **1 Month (30d)**, **1 Year**, and **Total (All Time)** Sales and Profit.
- **Dual Stock Focus System:** Separate views and priority alerts for **Low & Out of Stock** vs **In Stock** items across both Dashboard and Inventory.
- **Mobile-First + PC Ready:** Touch-friendly mobile card lists, compact POS item rows, and bottom navigation bar on phones; clean sidebar and full data tables on desktop.
- **Instant A4 PDF Invoices:** Auto bill numbering (`INV-101`...), live over-stock warning, automatic stock deduction, and instant PDF download (`jsPDF` + `jspdf-autotable`).
- **Shop Settings & Optional Logo:** Configure Shop Name, Address, Phone, Footer Note, and optional Base64 Logo (strictly hidden in header and PDF when no logo is uploaded).
- **Backup & Excel Export:** Full JSON Backup/Restore with validation and 4-sheet Excel (`.xlsx`) export (`Summary`, `Inventory`, `Stock In`, `Bill History`).

---

## Project Structure

```text
ApnaDukan/
├── index.html                  # Main PWA shell (Bottom Nav on mobile + Sidebar on desktop)
├── manifest.webmanifest        # PWA Manifest (standalone, icons, #1E3A5F theme)
├── sw.js                       # Offline Service Worker
├── css/
│   └── styles.css              # Mobile-first Navy (#1E3A5F) & Teal (#2C7A7B) stylesheet
├── js/
│   ├── storage.js              # LocalStorage state, period metrics, sample data & JSON validation
│   ├── pdf.js                  # A4 PDF Invoice generator (jsPDF + Mukta font)
│   ├── export.js               # JSON Backup & Multi-sheet Excel (.xlsx) export
│   └── app.js                  # UI controller, Chart.js, Billing & PWA events
├── icons/                      # ApnaDukan SVG Logo & PWA PNG/ICO Icons
└── vendor/                     # Local offline bundles (Chart.js, jsPDF, SheetJS, Mukta TTF)
```

---

## How to Run

1. **GitHub Pages / Live PWA:** Enable GitHub Pages on branch `main` (`/root`) to install and run offline on mobile and desktop.
2. **Local Server:**
   ```bash
   npx serve .
   # or with Python:
   python -m http.server 8080
   ```
3. **Direct Browser:** Open `index.html` directly in any modern browser without build tools.
