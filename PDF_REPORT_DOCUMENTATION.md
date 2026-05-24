# Dokumentasi Fitur Generate PDF Report

## Ringkasan

Fitur ini menghasilkan laporan PDF visual dari data Feature Tracker. User bisa klik tombol PDF di panel AI Agent, atau ketik perintah seperti "generate report" / "buat laporan PDF" di chat. Hasilnya adalah file PDF A4 landscape yang berisi deck slide berisi insight, metric, risk matrix, flowchart, dan evidence visual dari data tracker.

---

## Cara Kerja (Alur Teknis)

```
User klik tombol PDF
  → AiAgentPanel memanggil generateVisualDeckReport()
  → Gemini AI membuat konten slide (JSON)
  → buildReportDeckSpec() menyusun struktur deck
  → createReportPdf() merender setiap slide sebagai HTML
      → Setiap slide di-render sebagai React component di background (tidak terlihat user)
      → html2canvas mengambil screenshot slide tersebut
      → Screenshot dimasukkan ke PDF via jsPDF
      → Layer teks transparan ditambahkan supaya teks bisa di-select
  → PDF di-upload ke Firebase Storage
  → Link PDF muncul di chat sebagai attachment
```

---

## Struktur File

```
src/app/services/
├── pdf-report.ts                    ← Entry point (thin shim, ~30 baris)
├── report-deck.ts                   ← Menyusun struktur deck dari data AI + tracker
├── report-types.ts                  ← Tipe data slide (tidak diubah)
├── report-generation.ts             ← Orchestrator: panggil Gemini → render PDF → upload
└── report-rendering/
    ├── render-html-pdf.ts           ← Pipeline utama: render slide → screenshot → PDF
    ├── slide-renderer.tsx           ← Dispatcher: pilih komponen berdasarkan tipe slide
    ├── slide-frame.tsx              ← Chrome bersama: header, kicker, page badge, footer
    ├── style-config.ts              ← Konfigurasi warna/font (StyleConfig)
    ├── offscreen-stage.tsx          ← Container tersembunyi untuk render slide
    ├── text-overlay.ts              ← Layer teks transparan untuk selectable text
    ├── pagination.ts                ← Memecah slide panjang ke halaman lanjutan
    ├── pdf-state.ts                 ← Reset state jsPDF antar slide
    ├── hooks/use-fonts-ready.ts     ← Tunggu font selesai load sebelum screenshot
    └── slides/
        ├── cover-slide.tsx
        ├── metric-snapshot-slide.tsx
        ├── visual-evidence-slide.tsx
        ├── comparison-slide.tsx
        ├── risk-matrix-slide.tsx
        ├── flowchart-slide.tsx
        ├── recommendation-slide.tsx
        ├── appendix-slide.tsx
        └── text-only-fallback-slide.tsx
```

---

## Tipe Slide yang Didukung

| Tipe | Isi |
|---|---|
| `cover` | Halaman pertama: headline, 6 metric cards, panel "VISUAL DECK" |
| `metric_snapshot` | Angka-angka tracker: metric cards + status chips + bullets |
| `visual_evidence` | Satu gambar bukti (screenshot UI / userflow) + caption |
| `comparison` | Dua gambar berdampingan (existing vs design) |
| `risk_matrix` | Scatter plot risiko fitur berdasarkan evidence vs severity |
| `flowchart` | Diagram alur proses dengan node dan panah |
| `recommendation` | Daftar action items dengan warna prioritas (merah → amber → teal) |
| `appendix` | Daftar sumber data yang dipakai deck |

---

## Integrasi dengan AI Training

### Yang sudah berjalan ✅

Entri AI Training dengan domain **`document_template`** sudah langsung mempengaruhi **konten** PDF. Di `report-generation.ts`, fungsi `buildReportPrompt()` membaca semua entri `document_template` dan menambahkannya ke prompt Gemini sebagai instruksi tambahan.

Contoh: kalau kamu tambahkan training entry "selalu sertakan section budget impact di setiap recommendation", Gemini akan mengikutinya saat menyusun slide.

### Yang belum diwiring ⚠️

Entri AI Training **belum** bisa mengubah **tampilan/style** PDF (warna, font, density). Infrastrukturnya sudah siap (`StyleConfig` di `style-config.ts`), tapi belum ada adapter yang membaca training entry dan mengubahnya jadi konfigurasi style.

**Cara menyelesaikannya nanti:**
1. Baca entri `document_template` di `report-generation.ts`
2. Parse instruksi style dari entri tersebut (misal: warna brand, font)
3. Buat objek `StyleConfig` dari instruksi tersebut
4. Pass ke `createReportPdf()` sebagai parameter keempat

---

## Issue yang Diketahui

### 1. Slide components tidak reuse komponen dashboard yang sudah ada

**Masalah:** Setiap slide dibuat ulang dari scratch menggunakan Tailwind + SVG custom. Komponen yang sudah ada di dashboard seperti `flow-chart-diagram.tsx`, `summary-cards.tsx`, dan komponen shadcn/ui **tidak dipakai**.

**Dampak:** Tampilan PDF mirip tapi tidak identik dengan dashboard. Kalau ada perubahan di komponen dashboard, PDF tidak ikut berubah otomatis.

**Solusi yang disarankan:**
- `FlowchartSlide` → import dan render `<FlowChartDiagram>` dari `src/app/components/flow-chart-diagram.tsx`
- Metric cards → reuse komponen dari `summary-cards.tsx`
- Ini akan memastikan konsistensi visual jangka panjang

### 2. Duplikasi fungsi `isPdfSafeDataImage`

**Masalah:** Fungsi ini didefinisikan ulang di `comparison-slide.tsx` padahal sudah ada di `report-deck.ts`.

**Dampak:** Kalau batas ukuran gambar diubah di satu tempat, tempat lain tidak ikut berubah.

**Solusi:** Export fungsi dari `report-deck.ts` dan import di slide component.

### 3. Selectable text belum terverifikasi di browser sungguhan

**Masalah:** Test untuk membaca teks dari PDF (`pdfjs-spike.test.ts`) di-skip karena environment test tidak support canvas rendering. Belum ada konfirmasi bahwa teks benar-benar bisa di-select di Chrome/Preview.

**Dampak:** Fitur selectable text mungkin tidak berfungsi di PDF yang dihasilkan.

**Cara verifikasi:** Generate PDF dari dashboard, buka di Chrome, coba select teks.

### 4. `renderTextOnlyFallback` duplikasi kode

**Masalah:** Fungsi fallback di `render-html-pdf.ts` hampir identik dengan `renderOnePage` — ada ~40 baris kode yang sama persis.

**Dampak:** Kalau ada perubahan di logika rendering, harus diubah di dua tempat.

**Solusi:** Refactor jadi satu fungsi dengan parameter `slideElement`.

---

## Kemungkinan Error di Production

### 🔴 Tinggi — Perlu ditest segera

**html2canvas tidak bisa render CSS tertentu**
- Beberapa CSS modern tidak di-support html2canvas: `backdrop-filter`, `clip-path`, beberapa gradient kompleks, `position: sticky`
- Gejala: slide terlihat berbeda dari dashboard, atau ada elemen yang hilang/blank
- Cara cek: generate PDF, bandingkan setiap slide dengan tampilan dashboard

**Slide hang / generate PDF tidak selesai**
- Kalau `onReady` tidak pernah dipanggil di salah satu slide component (misalnya karena bug di `useFontsReady`), proses akan stuck selamanya
- Gejala: loading spinner tidak berhenti, tidak ada error message
- Mitigasi yang sudah ada: `useFontsReady` punya timeout 2 detik sebagai fallback

### 🟡 Sedang — Perlu dimonitor

**Font belum selesai load saat screenshot**
- Kalau font Inter dari CDN lambat atau gagal load, screenshot akan pakai Helvetica sebagai fallback
- Gejala: teks di PDF terlihat berbeda fontnya dari dashboard
- Mitigasi: `useFontsReady` menunggu `document.fonts.ready` sebelum screenshot

**File PDF terlalu besar**
- Setiap slide di-screenshot sebagai JPEG. Deck 10 slide bisa menghasilkan file 5–15 MB
- Gejala: upload ke Firebase lambat, atau gagal kalau melebihi batas storage
- Mitigasi yang sudah ada: JPEG quality 0.92 (bukan 1.0), gambar dibatasi 700KB per slide

**Gambar bukti visual tidak muncul**
- Gambar hanya diembed kalau lolos filter `isPdfSafeDataImage` (data URL, ≤700KB)
- Gambar dari URL eksternal atau yang terlalu besar akan tampil sebagai placeholder
- Ini by design, bukan bug

### 🟢 Rendah — Edge case

**Slide dengan konten sangat panjang**
- Pagination otomatis sudah ada untuk tipe `recommendation` dan `appendix`
- Tipe lain (cover, risk_matrix, flowchart) tidak punya pagination — kalau kontennya terlalu banyak, bisa overflow
- Mitigasi: deck builder sudah membatasi jumlah item per slide

**Deck kosong (tidak ada fitur di tracker)**
- Sudah ditangani: deck builder tetap menghasilkan slide cover + metric snapshot + risk matrix + recommendation + appendix meski fitur kosong

**Gemini timeout atau gagal**
- Sudah ditangani: kalau Gemini gagal dalam 45 detik, PDF tetap dibuat dari data tracker saja (tanpa AI insight)

---

## Status Test

```
Test Files  72 passed | 2 skipped (74)
Tests       401 passed | 2 skipped (403)
Duration    ~34 detik
```

**Yang di-skip:**
- `pdfjs-spike.test.ts` — test baca teks dari PDF, tidak bisa jalan di jsdom
- `performance.smoke.test.ts` — test performa, di-skip di CI

**Coverage fitur PDF:**
- Unit test: semua slide components, helpers (pagination, text-overlay, pdf-state, offscreen-stage)
- Property test: 21 properti diverifikasi dengan fast-check
- Integration test: alur lengkap generate → upload → attachment

---

## Langkah Selanjutnya yang Disarankan

1. **Manual test di browser** — generate PDF dari dashboard, cek setiap tipe slide, verifikasi selectable text
2. **Reuse komponen dashboard** — terutama `FlowChartDiagram` dan metric cards
3. **Wire AI Training ke StyleConfig** — buat adapter di `report-generation.ts`
4. **Fix duplikasi `isPdfSafeDataImage`** — export dari `report-deck.ts`, import di slide components
5. **Refactor `renderTextOnlyFallback`** — gabung dengan `renderOnePage` untuk kurangi duplikasi kode

---

*Dokumentasi ini dibuat berdasarkan state kode per branch `fix/pdf-report-html-render` — Mei 2026.*
