# ApnaDukan — Offline Shop Stock & Billing PWA

<p align="center">
  <img src="./icons/logo-wordmark.svg" alt="ApnaDukan Logo" width="340">
</p>

**ApnaDukan** ek 100% offline, mobile-first **Progressive Web App (PWA)** hai jo chhoti aur madhyam dukaano (retail shops, kirana stores, general stores) ke liye **Stock Management aur Billing (PDF Invoice)** ko aasaan banata hai. Isme kisi backend server ki zaroorat nahi hai — saara data aapke browser ke `localStorage` mein safely save rehta hai.

---

## Key Features / मुख्य विशेषताएं

- **Installable Offline PWA:** Mobile (Android/iOS) aur Desktop par app ki tarah install karein; bina internet ke 100% kaam karta hai (`sw.js` + `manifest.webmanifest`).
- **Bilingual UI (Hindi + English):** Aasaan Hindi aur English labels taaki har shopkeeper bina dikkat chala sake.
- **Shop Settings & Optional Logo:** Shop Name, Address, Phone, Bill Footer Note aur Base64 Shop Logo upload/remove. *(Agar logo upload nahi kiya hai toh header aur PDF bill mein koi empty box ya placeholder icon nahi dikhega.)*
- **Live Dashboard:** 6 KPI Cards (Total Products, Stock Value, Total Sales, Est. Profit, Low Stock Count, Out of Stock Count), **Chart.js** horizontal stock graph aur Live Stock Tracker table.
- **Master Inventory:** Item add/edit/delete, auto `Stock In (+)`, `Stock Out (-)`, `Current Stock`, `Stock Value`, search bar aur category/status filters.
- **Stock In Management:** Supplier ke saath naya maal add karein — stock turant update hota hai aur purchase history save hoti hai.
- **Create Bill + Auto Stock Deduction:** Multi-item billing (`INV-101`, `INV-102`...), live stock limit warning, Discount calculation, aur **"Save & Download PDF Bill"** par turant **A4 PDF Invoice** download (`jsPDF` + `jspdf-autotable`, Hindi + `₹` support ke saath).
- **Bill History:** Search by Bill No / Customer, View Invoice popup, Duplicate PDF download, aur Delete Bill with optional **Stock Restore**.
- **Full Backup & Export:**
  - **Export / Import JSON** (Shop Settings + Logo Base64 + Inventory + Stock In + Bill History)
  - **Export to Excel (`.xlsx`)** via SheetJS — 4 sheets (`Summary`, `Inventory`, `Stock In`, `Bill History`)

---

## Project Structure

```text
ApnaDukan/
├── index.html                  # Main PWA App Shell (Mobile Bottom Nav + Desktop Sidebar)
├── manifest.webmanifest        # PWA Manifest (standalone, icons, #1E3A5F theme)
├── sw.js                       # Offline Service Worker (caches app shell & vendor libs)
├── css/
│   └── styles.css              # Mobile-first Navy (#1E3A5F) & Teal (#2C7A7B) stylesheet
├── js/
│   ├── storage.js              # LocalStorage state, metrics, sample data & JSON validation
│   ├── pdf.js                  # A4 PDF Invoice generator (jsPDF + Mukta Hindi/Rupee font)
│   ├── export.js               # JSON Backup & Multi-sheet Excel (.xlsx) export
│   └── app.js                  # UI controller, Dashboard Chart.js, Billing & PWA events
├── icons/                      # ApnaDukan Logo (SVG) & PWA PNG/ICO Icons
└── vendor/                     # Local offline bundles (Chart.js, jsPDF, SheetJS, Mukta TTF)
```

---

## How to Run / कैसे चलाएं

1. **GitHub Pages / Live PWA:** Repository ko GitHub Pages par host karne par yeh sidha installable PWA ke roop mein mobile aur desktop par chalega.
2. **Local Server:**
   ```bash
   npx serve .
   # ya Python se:
   python -m http.server 8080
   ```
3. **Direct Browser:** Bina kisi build tool ke `index.html` ko browser mein double-click karke bhi open kiya ja sakta hai.
