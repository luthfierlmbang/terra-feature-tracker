# Bugfix Requirements Document

## Introduction

Pengguna melaporkan bahwa hasil ekspor PDF dari fitur Visual Deck Report (`generateVisualDeckReport` →
`createReportPdf` di `src/app/services/pdf-report.ts`) terlihat sangat buruk: gambar bukti visual tidak
pernah muncul, banyak teks terpotong tanpa alasan jelas, antar-slide tampak tidak konsisten, dan
beberapa slide mengalami overflow ke luar area konten. Akar masalahnya bukan terletak di builder
deck (`buildReportDeckSpec`), melainkan di lapisan renderer jsPDF yang:

1. Mem-bypass gambar yang sebenarnya sudah lolos filter aman PDF (`isPdfSafeDataImage`, ≤ 700 KB)
   dan menggantinya dengan placeholder statis.
2. Menerapkan truncation tambahan di hampir setiap fungsi `draw*`, di atas truncation yang sudah
   dilakukan oleh deck builder, sehingga konten yang sah ikut hilang diam-diam.
3. Membocorkan state jsPDF (`setLineWidth`, draw color) antar pemanggilan, membuat slide-slide
   setelah flowchart tampak berbeda dari slide sebelumnya.
4. Tidak memiliki strategi pagination/overflow handling, sehingga konten panjang menabrak footer
   `Sources:` atau keluar dari halaman A4 landscape (297 × 210 mm).
5. Mengabaikan `FlowChartDefinition.edges` dan hanya menarik panah antar node yang berurutan,
   sehingga flow non-linear tidak tergambar dengan benar.

Dampak: laporan PDF terlihat kosong, terpotong, dan tidak konsisten meskipun data tracker dan output
AI sudah lengkap. Bug ini hanya muncul pada lapisan ekspor PDF; tampilan in-app (Markdown / Flow
Chart Diagram React) tidak terpengaruh.

Scope perbaikan: `src/app/services/pdf-report.ts` (renderer, target utama) dan perbaikan minor di
`src/app/services/report-deck.ts` yang berkaitan langsung dengan kontrak renderer (mempertahankan
`edges` asli dari flowchart sebelum dikirim ke renderer). Gemini prompt, panel AI agent, tipe data
publik `createReportPdf`, dan `flow-chart-diagram.tsx` tidak boleh berubah.

## Bug Analysis

### Current Behavior (Defect)

Perilaku saat ini di `src/app/services/pdf-report.ts` (dan titik kontak terkait di
`src/app/services/report-deck.ts`):

1.1 WHEN slide bertipe `visual_evidence` atau `comparison` memiliki `image.src` yang sudah lolos
`isPdfSafeDataImage` (data URL gambar ≤ 700 KB) THEN `drawImageBox` mengabaikan `image.src` dan
selalu menggambar kotak placeholder bertuliskan "Visual evidence" / "Image tersedia di tracker; PDF
memakai placeholder aman."

1.2 WHEN `drawSlideFrame` dipanggil dengan `slide.title` yang melebihi 76 karakter THEN judul
dipotong oleh `truncateText(slide.title, 76)` dan dipaksa maksimal 2 baris (`maxWidth: 215`),
tanpa memberi tahu pengguna bahwa judul terpotong dan tanpa memperhitungkan tabrakan dengan
headline di `CONTENT_Y = 45`.

1.3 WHEN `drawHeadline` dipanggil dengan `slide.headline` yang panjang THEN headline dipotong oleh
`truncateText(slide.headline, 92)` lalu hasil `splitTextToSize` di-`slice(0, 2)`, sehingga baris
ketiga dan seterusnya hilang tanpa indikator.

1.4 WHEN `drawMetricCards` menerima lebih dari enam kartu THEN kartu ke-7 dan seterusnya di-drop
oleh `cards.slice(0, 6)`; selain itu `card.value` dipotong oleh `truncateText(card.value, 20)` dan
`card.label` dipaksa maksimal 2 baris via `splitTextToSize(...).slice(0, 2)`.

1.5 WHEN `drawBullets` menerima daftar bullet panjang THEN daftar terlebih dulu dipotong oleh
`shortList(bullets, maxItems, 120)` (membuang item dan memotong tiap item ke 120 karakter), lalu
tiap bullet di-render dipotong lagi ke maksimal 3 baris via `lines.slice(0, 3)`.

1.6 WHEN `drawBullets` me-render bullet yang membungkus ke beberapa baris THEN spasi antar bullet
dihitung dengan `cursorY += (lines.length - 1) * lineSpacing + 6.5`, di mana `lineSpacing ≈ 3.94mm`
adalah perkiraan kasar berbasis font size dan tidak sinkron dengan `lineHeightFactor: 1.24` yang
dipakai jsPDF, sehingga jarak antar bullet menjadi tidak rata terutama saat bullet membungkus 2–3
baris.

1.7 WHEN `drawChips` menerima lebih dari 12 chip THEN chip ke-13 dan seterusnya di-drop oleh
`chips.slice(0, 12)`, dan `chip.label` dipotong oleh `truncateText(chip.label, 28)`.

1.8 WHEN `drawChips` menghitung lebar chip via
`Math.min(62, Math.max(28, chip.label.length * 1.8 + chip.value.length * 2.2 + 13))` THEN lebar yang
dihasilkan tidak sesuai dengan lebar teks aktual untuk karakter lebar (`m`, `w`, kapital), sehingga
teks chip dapat terpotong di tepi atau chip terakhir di sebuah baris keluar dari area `w`.

1.9 WHEN `drawImageBox` menerima `image.caption` yang panjang THEN caption dipotong oleh
`truncateText(image.caption, 90)` lalu dipaksa 2 baris via `splitTextToSize(...).slice(0, 2)`,
sementara `image.label` dipotong oleh `truncateText(image.label, 54)`.

1.10 WHEN `drawRiskMatrix` me-render lebih dari satu item dengan koordinat `(x, y)` yang berdekatan
THEN dot dan label saling tumpang tindih (label hanya dipotong via `truncateText(item.label, 24)`
dan diberi `maxWidth: 45`, tidak ada penghindaran tabrakan).

1.11 WHEN `drawFlowChart` menerima `FlowChartDefinition` dengan `edges` yang menggambarkan koneksi
non-linear (mis. percabangan, loop balik) THEN renderer tetap menarik panah hanya antar
`positions[index]` dan `positions[index + 1]`; field `definition.edges` diabaikan, dan
`chunkFlowDefinition` di `report-deck.ts` ikut menulis ulang `edges` menjadi rantai linier sehingga
informasi koneksi asli hilang sebelum sampai ke renderer.

1.12 WHEN `drawNodeShape` selesai menggambar suatu node THEN nilai `doc.setLineWidth(0.45)` dan
warna `setDraw` tidak di-reset; demikian pula `drawArrow` / `drawPolylineArrow` membocorkan
`setLineWidth(0.35)` dan warna teal. Pada slide-slide setelah `flowchart`, semua `roundedRect` /
`rect` border (kartu, header, chip, dst.) memakai stroke yang bocor tersebut, membuat tampilan
slide tidak konsisten.

1.13 WHEN `drawNodeShape` me-render node dengan `kind === "database"` THEN bentuk silinder
digambar dengan `rect` "F" + dua `ellipse` "F" lalu garis sisi + dua `ellipse` "S", tetapi tidak
ada urutan stroke yang konsisten sehingga seam (sambungan sisi dan tutup) terlihat tebal-tipis
tidak rata di hasil PDF.

1.14 WHEN `addSlide` masuk cabang `recommendation` dengan `slide.bullets` lebih dari 5 item THEN
item ke-6+ di-drop oleh `(slide.bullets ?? []).slice(0, 5)`; tiap item dipotong lagi via
`truncateText(item, 118)`. Jika headline membungkus 2 baris sehingga `y ≈ 62 mm`, lima kartu
setinggi 20 mm dengan jarak 24 mm berakhir pada `y + 4 * 24 + 20 ≈ 178 mm`, dan untuk headline
lebih panjang `y` dapat mendekati atau melewati `drawSourceRefs` di `y = 194 mm` / batas halaman
210 mm.

1.15 WHEN `addSlide` masuk cabang default (slide tipe lain dengan bullet) dan slide juga memiliki
`metricCards` yang sudah memakan ruang vertikal THEN bullets dirender sebagai kartu 27 mm dalam
grid 2 kolom dengan tinggi baris 30 mm tanpa cek apakah `currentY + rows * 30` melewati
`CONTENT_BOTTOM`; kartu dapat keluar dari area konten dan menabrak footer, dan setiap kartu
memotong teks via `truncateText(item, 108)` + `.slice(0, 3)` baris.

1.16 WHEN `drawSourceRefs` menerima lebih dari empat referensi THEN referensi ke-5 dan seterusnya
di-drop oleh `refs.slice(0, 4)` sebelum di-`join(", ")`, tanpa tanda bahwa daftar dipotong.

1.17 WHEN `createReportPdf` mengiterasi `deck.slides` THEN setiap slide dipanggil sekali via
`addSlide(doc, slide, index + 1)` tanpa pengukuran tinggi konten; tidak ada strategi pagination
sehingga slide dengan kombinasi metric cards + chips + bullets atau bullets banyak akan menabrak
footer atau keluar halaman, dan tidak ada continuation page.

1.18 WHEN `addSlide` cabang `cover` selesai THEN tidak ada reset state jsPDF (font, line width,
draw/fill/text color) sebelum slide berikutnya dirender, ikut berkontribusi pada inkonsistensi
visual antar slide.

### Expected Behavior (Correct)

Untuk tiap defek di Section 1, perilaku yang benar setelah perbaikan (`F'` di
`src/app/services/pdf-report.ts`):

2.1 WHEN slide bertipe `visual_evidence` atau `comparison` memiliki `image.src` yang lolos
`isPdfSafeDataImage` THEN `drawImageBox` SHALL menanam gambar tersebut menggunakan `doc.addImage`
ke dalam kotak yang disediakan, dengan aspect-ratio dipertahankan (letterbox di dalam kotak),
clipping dibatasi pada area kotak, dan placeholder hanya dipakai sebagai fallback ketika `image.src`
kosong, gagal di-decode oleh jsPDF, atau dilempar exception oleh `addImage`.

2.2 WHEN `drawSlideFrame` menerima `slide.title` panjang THEN sistem SHALL menghitung lebar
sebenarnya via `splitTextToSize(slide.title, 215)` dan, jika hasil ≥ 2 baris, mengurangi font size
secara adaptif (mis. 14.5 → 12 → 10.5) sampai muat dalam dua baris tanpa truncation, atau menambah
ellipsis hanya sebagai langkah terakhir; dan memastikan baris terakhir tidak melewati batas bawah
header card (y ≈ 36 mm).

2.3 WHEN `drawHeadline` menerima `slide.headline` panjang THEN sistem SHALL menampilkan headline
hingga 3 baris dengan font size adaptif (20 → 17 → 14.5 pt) sebelum melakukan truncation; jika
truncation tetap diperlukan, ellipsis SHALL ditambahkan secara eksplisit dan tinggi yang
dikembalikan SHALL mencerminkan jumlah baris yang benar-benar dirender.

2.4 WHEN `drawMetricCards` menerima lebih dari enam kartu THEN sistem SHALL menambah baris ketiga
(grid `cols × ceil(n/cols)`) selama total tinggi tidak melewati area konten; jika melewati, sistem
SHALL menempatkan kartu sisanya di slide continuation (lihat 2.17). Nilai dan label kartu SHALL
tidak dipotong di tingkat renderer; sebaliknya font size SHALL dikurangi secara adaptif agar muat
ke dalam kartu sebelum ellipsis.

2.5 WHEN `drawBullets` menerima daftar bullet THEN renderer SHALL TIDAK memotong jumlah bullet
secara diam-diam; jumlah bullet ditentukan oleh deck builder. Tiap bullet SHALL di-wrap penuh
(tanpa `.slice(0, 3)`) selama muat di area yang tersisa, dan jika tidak muat, kelebihan SHALL
diteruskan ke continuation page (2.17), bukan dibuang.

2.6 WHEN `drawBullets` me-render bullet yang membungkus ke `n` baris THEN jarak antar bullet SHALL
dihitung dari tinggi blok teks aktual (`n * lineHeight`) plus padding tetap, dengan `lineHeight`
yang konsisten dengan `lineHeightFactor` yang dipakai jsPDF, sehingga gap antar bullet sama besar
terlepas dari banyak baris pada masing-masing item.

2.7 WHEN `drawChips` menerima daftar chip THEN renderer SHALL menampilkan semua chip yang masih
muat dalam area; chip yang tidak muat di area utama SHALL diteruskan ke continuation page atau
ditempatkan dalam baris tambahan yang masih dalam area konten, bukan di-drop diam-diam.

2.8 WHEN `drawChips` menghitung lebar chip THEN lebar SHALL dihitung berdasarkan
`doc.getTextWidth(label)` + `doc.getTextWidth(value)` + padding, sehingga lebar selalu cukup untuk
menampung teks aktual dan tidak pernah keluar dari `x + w`.

2.9 WHEN `drawImageBox` menerima `image.caption` / `image.label` THEN caption SHALL ditampilkan
hingga 3 baris dengan wrap penuh tanpa pre-truncation di renderer (deck builder sudah membatasi
panjang); jika perlu, font size dikurangi adaptif sebelum ellipsis.

2.10 WHEN `drawRiskMatrix` mendeteksi dua atau lebih item dengan koordinat berdekatan THEN
renderer SHALL menerapkan offset label minimal (mis. `dotY ± k`) atau leader line agar dot tidak
saling menutup dan label tidak saling tumpang tindih; semua label SHALL tetap berada di dalam
bounding box matrix.

2.11 WHEN `drawFlowChart` menerima `FlowChartDefinition` dengan `edges` THEN renderer SHALL
menggambar panah berdasarkan `definition.edges` (`from` → `to`) menggunakan koordinat node yang
dipetakan, bukan berdasarkan urutan indeks, sehingga flow non-linear tergambar benar; dan
`chunkFlowDefinition` di `report-deck.ts` SHALL mempertahankan `edges` asli (memfilter hanya yang
`from`/`to`-nya berada dalam chunk) alih-alih menulis ulang menjadi rantai linier.

2.12 WHEN `drawNodeShape`, `drawArrow`, `drawPolylineArrow`, atau fungsi `draw*` lain mengubah
state jsPDF (`setLineWidth`, `setDrawColor`, `setFillColor`, `setTextColor`, `setFont`,
`setFontSize`) THEN setiap fungsi SHALL me-restore state ke nilai default slide (atau menggunakan
helper save/restore terpusat) sebelum return, sehingga tidak ada bocoran ke pemanggil berikutnya.

2.13 WHEN `drawNodeShape` me-render `kind === "database"` THEN urutan gambar SHALL: (a) fill body
(rect + dua ellipse), (b) stroke seluruh kontur (sisi + ellipse atas + ellipse bawah) dengan satu
`setLineWidth` yang konsisten, sehingga seam silinder tampak rata.

2.14 WHEN `addSlide` masuk cabang `recommendation` dengan ≤ 5 item THEN tata letak saat ini
dipertahankan; ketika item > 5 atau `y` headline mendorong kartu terakhir melewati 174 mm
(batas aman di atas footer), sistem SHALL memindahkan sisa kartu ke continuation page (2.17), dan
teks tiap kartu SHALL di-wrap penuh ke dalam lebar kartu tanpa truncation di renderer.

2.15 WHEN `addSlide` masuk cabang default dengan kombinasi `metricCards` + `bullets` THEN sebelum
menggambar baris kartu bullets, renderer SHALL memeriksa apakah `currentY + rows * 30 > CONTENT_BOTTOM`;
jika ya, sisa kartu SHALL diteruskan ke continuation page (2.17), dan teks tiap kartu SHALL di-wrap
penuh tanpa truncation di renderer.

2.16 WHEN `drawSourceRefs` menerima daftar referensi THEN seluruh referensi SHALL ditampilkan
dengan wrap multi-baris dalam area `CONTENT_W` di y = 194 mm, dengan font size dikurangi adaptif
bila perlu; tidak ada `slice` di renderer (deck builder sudah membatasi 6 referensi).

2.17 WHEN `addSlide` mendeteksi konten yang akan menabrak `CONTENT_BOTTOM` (≈ 188 mm di atas
footer) THEN sistem SHALL memulai continuation page (`doc.addPage()` + `drawSlideFrame` dengan
title + " (lanjutan)" dan kicker yang sama, tanpa menambah nomor slide baru di deck spec) dan
melanjutkan rendering sisa konten dari titik berhenti, sehingga tidak ada konten yang keluar
halaman atau menabrak footer.

2.18 WHEN `addSlide` selesai me-render satu slide (apa pun cabangnya, termasuk `cover`) THEN
sistem SHALL me-reset state jsPDF (font helvetica normal, fontSize default, lineWidth default,
warna fill/draw/text default) sebelum slide berikutnya, sehingga slide demi slide terlihat
konsisten.

### Unchanged Behavior (Regression Prevention)

Hal-hal yang harus tetap berperilaku seperti sebelum perbaikan:

3.1 WHEN `createReportPdf(aiOutput, features, onProgress?)` dipanggil THEN sistem SHALL CONTINUE TO
mengembalikan `Promise<Blob>` yang berisi PDF A4 landscape (297 × 210 mm) dengan tanda tangan
fungsi yang sama dan parameter yang sama.

3.2 WHEN `aiOutput` kosong, bukan JSON valid, atau tidak mengandung blok slides yang dapat di-parse
THEN sistem SHALL CONTINUE TO menjalankan fallback deck builder yang menghasilkan minimal cover +
metric snapshot + risk matrix + recommendation + appendix.

3.3 WHEN `features` kosong THEN sistem SHALL CONTINUE TO menghasilkan deck PDF tanpa error,
dengan slide cover dan recommendation tetap dirender berdasarkan output AI / fallback.

3.4 WHEN slide bertipe `visual_evidence` atau `comparison` memiliki `image.src` yang TIDAK lolos
`isPdfSafeDataImage` (kosong, bukan data URL, atau > 700 KB) THEN sistem SHALL CONTINUE TO
menampilkan placeholder aman alih-alih melempar exception.

3.5 WHEN `doc.addImage` melempar exception saat menanam gambar yang tampaknya valid THEN sistem
SHALL CONTINUE TO men-degrade ke placeholder aman dan melanjutkan rendering slide-slide berikutnya
tanpa membatalkan ekspor.

3.6 WHEN `slide.type === "cover"` THEN tata letak signature (kartu metric 3-kolom di kiri,
panel "VISUAL DECK" di kanan) SHALL CONTINUE TO dipertahankan; perubahan hanya menyangkut reset
state setelah render selesai.

3.7 WHEN `progress callback` `onProgress` diberikan THEN sistem SHALL CONTINUE TO melaporkan
progress monoton naik mendekati 100% di akhir, tanpa regresi pada persentase yang sudah dilaporkan.

3.8 WHEN deck spec menghasilkan ≤ N slide yang setiap slide-nya muat di satu halaman A4 landscape
THEN sistem SHALL CONTINUE TO menghasilkan PDF dengan tepat N halaman (continuation page hanya
muncul untuk slide yang benar-benar overflow, bukan untuk slide yang sebelumnya muat).

3.9 WHEN slide menyertakan `sourceRefs` ≤ 4 dengan total panjang yang muat dalam satu baris di
`CONTENT_W` THEN sistem SHALL CONTINUE TO menampilkan footer "Sources: ..." dalam satu baris di
y = 194 mm.

3.10 WHEN slide bertipe `flowchart` memiliki `definition.edges` yang sudah linier (rantai
sekuensial dari node ke node berikutnya) THEN visual flow chart SHALL CONTINUE TO terlihat sama
seperti sebelumnya (panah antar node berurutan), karena renderer baru hanya menambahkan dukungan
edge non-linear, bukan mengubah perilaku linier.

3.11 WHEN tipe publik `Feature`, `ReportDeckSlide`, `MetricCard`, `StatusChip`, `RiskMatrixItem`,
`DeckImage`, `FlowChartDefinition`, `FlowChartNode` digunakan oleh kode lain (mis.
`ai-agent-panel/index.tsx`, `flow-chart-diagram.tsx`) THEN sistem SHALL CONTINUE TO mengekspor
tipe-tipe ini dengan bentuk yang sama; perubahan terbatas pada implementasi internal renderer.

3.12 WHEN deck spec yang sama dirender dua kali ke jsPDF THEN hasil PDF SHALL CONTINUE TO bersifat
deterministik (bytes-for-bytes setara untuk input identik), tidak diperkenalkan sumber non-determinisme
(mis. timestamp, random id) di lapisan renderer.
