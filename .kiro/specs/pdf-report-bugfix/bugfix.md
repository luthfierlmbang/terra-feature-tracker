# Bugfix Requirements Document

## Introduction

Fitur **Generate PDF Report** di Feature Tracker (entry point: tombol PDF + auto-detect prompt di `AiAgentPanel`, hasil di-render via `createReportPdf` → `jspdf` A4 landscape) menghasilkan PDF yang **rusak secara visual dan kehilangan konten**. Laporan user (paraphrased dari bahasa Indonesia): _"hasil PDF aneh, layout pecah, konten hilang, bentuk jelek."_

Setelah membaca `src/app/services/pdf-report.ts`, `src/app/components/flow-chart-diagram.tsx`, dan `tests/services/pdf-report.test.ts`, akar masalahnya bukan satu bug tunggal — ada **beberapa silent-truncation dan layout-overflow yang saling memperparah** di renderer:

- **Silent drop di akhir slide.** `addContentSlide` melakukan `if (y > CONTENT_BOTTOM) break;` setelah setiap block. Sisa blok pada slide tersebut di-buang tanpa pagination — itu sumber utama "konten hilang".
- **Pagination memakai estimator yang divergen.** `paginateSlides` menjumlahkan `estimateBlockHeight(block)` lalu memotong kalau `height > 132`. Tapi tinggi sebenarnya yang dipakai renderer (`drawTextCard`, `drawList`, `drawKeyValueGrid`, `drawMetricCards`, `drawTable`) berbeda dari estimator, dan ambang `132` lebih rendah dari content area sesungguhnya (`CONTENT_BOTTOM − CONTENT_Y ≈ 138`). Hasilnya: kombinasi premature break ("konten hilang sebelum penuh") dan overflow ("layout pecah" — block menabrak footer).
- **Truncation terselubung di renderer block.** `drawTable` memotong tiap cell ke `slice(0, 3)` baris; `drawKeyValueGrid` memotong value ke `slice(0, 2)` baris; `drawMetricCards` memotong ke `slice(0, 6)` entry. Long Figma URL, deskripsi business impact, dan list metric yang lebih dari 6 hilang tanpa peringatan.
- **Flowchart mengabaikan edges.** `drawFlowChart` me-render arrow hanya antara `positions[i]` → `positions[i+1]` — `definition.edges` tidak pernah dibaca. `chunkFlowDefinition` malah membangun ulang edges sequential murni, jadi kalau di masa depan markdown `flowchart` punya percabangan, edges-nya hancur. Untuk flowchart linear pun, posisi sqrt-grid mengabaikan urutan edge sehingga arrow bisa "skip baris" dengan janggal.
- **Polish kecil yang menambah kesan "bentuk jelek":** `drawNodeShape` untuk kind `database` menggambar `roundedRect` (sudut atas/bawah membulat) lalu menumpuk `ellipse` di atas → garis ganda. `setLineWidth` di-set di `drawArrow`/`drawNodeShape` lalu tidak pernah di-reset, sehingga border block setelah flowchart bisa berubah ketebalan.

Cakupan fix terbatas pada **renderer PDF** (`src/app/services/pdf-report.ts`). Sumber markdown (`gemini.ts`), entry-point (`AiAgentPanel`), dan parser flow-chart (`flow-chart-diagram.tsx`) **tidak diubah** — fix harus toleran terhadap output Gemini apa adanya.

## Bug Analysis

### Current Behavior (Defect)

Apa yang terjadi sekarang dan kenapa salah:

1.1 WHEN `addContentSlide` me-render slide AND akumulasi `y` melewati `CONTENT_BOTTOM` setelah suatu block THEN the system menjalankan `break` dan **menghapus diam-diam semua block sisa pada slide tersebut** tanpa membuat halaman lanjutan
1.2 WHEN `paginateSlides` menjumlahkan `estimateBlockHeight(block)` untuk memutuskan page break THEN the system memakai ambang konstan `132` walaupun area konten sebenarnya `CONTENT_BOTTOM − CONTENT_Y = 184 − 46 = 138mm`, sehingga split prematur (mis. konten muat tapi dipindah ke halaman baru) dan akumulasi off-by-error untuk multi-block
1.3 WHEN suatu block punya tinggi render aktual yang lebih besar dari hasil `estimateBlockHeight` (text card panjang, list dengan banyak wrap, table key-value dua kolom) THEN the system membiarkan block tersebut menabrak `CONTENT_BOTTOM` dan menumpuk di atas footer page (overflow visual)
1.4 WHEN `drawTable` me-render satu row tabel AND ada cell yang setelah wrap menghasilkan lebih dari 3 baris THEN the system memotong cell ke `splitTextToSize(...).slice(0, 3)` — sisa teks hilang tanpa indikator
1.5 WHEN `drawTable` me-render tabel yang total tinggi row-nya lebih dari sisa content area THEN the system menggambar row terakhir menabrak footer dan **tidak melakukan pagination row-by-row**, karena pagination hanya terjadi di level block via estimator
1.6 WHEN `drawList` me-render bullet list THEN the system menghitung `h` total list dan menggambar background `roundedRect(x, y − 6, w, h, ...)` sekali di awal — bila list mendekati bawah halaman, background dan bullet dapat melewati `CONTENT_BOTTOM` tanpa cek
1.7 WHEN `drawKeyValueGrid` me-render entries dari `Field|Value` table AND value memiliki lebih dari 2 baris setelah wrap (mis. Figma link panjang, deskripsi multi-baris) THEN the system memotong ke `slice(0, 2)` dan kehilangan sisa teks
1.8 WHEN `drawKeyValueGrid` me-render lebih banyak entries daripada yang muat di sisa halaman THEN the system tetap menggambar semua kartu di posisi yang dihitung secara linear, sehingga kartu terakhir dapat menabrak atau melewati `CONTENT_BOTTOM`
1.9 WHEN `drawMetricCards` me-render `Metric|Value` table dengan lebih dari 6 entries THEN the system memanggil `entries.slice(0, 6)` dan **membuang entries ke-7 dst.** tanpa pagination
1.10 WHEN `drawFlowChart` mendapat `FlowChartDefinition` dengan `definition.edges` yang non-sequential atau memiliki label THEN the system mengabaikan field `edges` sama sekali dan hanya menggambar arrow antara node berurutan dalam grid sqrt
1.11 WHEN `chunkFlowDefinition` membagi flowchart >10 nodes menjadi beberapa halaman THEN the system meng-overwrite `edges` dengan rangkaian sequential `nodes[i] → nodes[i+1]`, sehingga edges asli dari `parseFlowChartDefinition` dilenyapkan
1.12 WHEN `drawNodeShape` me-render node `kind = "database"` THEN the system menggambar `roundedRect` (yang sudah membulatkan sudut atas) **dan** menumpuk `ellipse` di atas pada `y + 5` → garis silinder ganda yang janggal
1.13 WHEN `drawArrow` atau `drawNodeShape` mengubah `setLineWidth` THEN the system tidak men-reset line width ke default, sehingga block berikutnya (border kartu, garis tabel) menggunakan stroke yang tidak konsisten
1.14 WHEN `splitTextIntoBlocks` memecah teks panjang dengan ambang `maxLength = 520` THEN the system dapat menghasilkan satu text card yang setelah wrap melebihi sisa halaman, lalu jatuh ke kondisi 1.1/1.3
1.15 WHEN `drawCover` selesai dan `addPage` dipanggil THEN the system tidak men-reset state warna/font (`setFillColor`, `setTextColor`, `setDrawColor`, `setLineWidth`), sehingga kebocoran state antar halaman bergantung pada urutan panggilan `set*` di `drawSlideFrame`

### Expected Behavior (Correct)

Apa yang seharusnya terjadi setelah fix. Setiap clause di bawah berkorespondensi dengan clause di **Current Behavior**:

2.1 WHEN suatu block tidak muat di sisa halaman saat di-render THEN the system SHALL menambah halaman baru via `doc.addPage()`, menggambar `drawSlideFrame` dengan judul slide (atau `Title (cont.)`) dan nomor halaman lanjutan, lalu melanjutkan render block — **tidak ada block yang dihilangkan secara diam-diam**
2.2 WHEN paginasi block dilakukan THEN the system SHALL menggunakan tinggi render **terukur** (measure-then-place: minta `splitTextToSize`/precompute geometry untuk dapatkan `h` aktual block sebelum memutuskan page break) dan ambang yang dihitung dari `CONTENT_BOTTOM − cursorY`, bukan konstanta hard-coded `132`
2.3 WHEN block di-render THEN the system SHALL menjamin posisi terakhir cursor `y` ≤ `CONTENT_BOTTOM` untuk **semua** block yang berhasil di-render (tidak ada block yang menabrak footer)
2.4 WHEN `drawTable` menemui cell yang setelah wrap memiliki banyak baris THEN the system SHALL me-render seluruh baris cell tanpa silent slice; kalau row-nya tidak muat di sisa halaman, system SHALL melakukan pagination **row-by-row** (header diulang di halaman berikutnya)
2.5 WHEN `drawTable` me-render row tunggal yang lebih tinggi dari content area THEN the system SHALL menerapkan strategi yang konsisten (mis. memecah cell menjadi sub-row, atau memberikan row halamannya sendiri) sehingga tidak ada overflow ke footer
2.6 WHEN `drawList` me-render bullet list THEN the system SHALL menggambar list dengan paginasi item-by-item: kalau item berikutnya tidak muat, system SHALL membuat halaman baru dan melanjutkan list (background dan bullet diulang)
2.7 WHEN `drawKeyValueGrid` me-render value yang panjang THEN the system SHALL menampilkan seluruh value (multi-baris penuh) — dengan opsi tinggi cell variable, atau pagination grid bila perlu — tanpa `slice(0, 2)`
2.8 WHEN `drawKeyValueGrid` perlu menggambar lebih banyak entries daripada yang muat di sisa halaman THEN the system SHALL pagination grid (memindahkan entries berikutnya ke halaman baru dengan judul slide diulang)
2.9 WHEN `drawMetricCards` mendapat lebih dari 6 entries THEN the system SHALL me-render seluruh entries dengan **pagination** (kartu metric di halaman berikutnya bila kapasitas baris terlampaui), atau jatuh kembali ke `drawTable` paginated — tidak ada `slice(0, 6)`
2.10 WHEN `drawFlowChart` mendapat `FlowChartDefinition` THEN the system SHALL membaca `definition.edges` sebagai sumber kebenaran adjacency, menggambar arrow per-edge (bukan per-index), dan men-support edges non-sequential serta `edge.label`
2.11 WHEN `chunkFlowDefinition` membagi flowchart THEN the system SHALL mempertahankan edges asli untuk node yang masuk ke chunk yang sama (dropping cross-chunk edges atau menampilkan placeholder "continued"), dan **tidak** mengganti edges asli dengan rangkaian sequential
2.12 WHEN `drawNodeShape` me-render kind `database` THEN the system SHALL menggambar bentuk silinder yang konsisten secara visual (satu pasang ellipse + sisi vertikal), tanpa garis ganda dari `roundedRect` + `ellipse` yang menumpuk
2.13 WHEN renderer mengubah `setLineWidth`/state warna/font THEN the system SHALL men-reset state ke default yang dikenal (helper `resetDocState(doc)`) sebelum keluar dari fungsi atau sebelum block berikutnya, sehingga tidak ada bleed-through antar block/halaman
2.14 WHEN `splitTextIntoBlocks` memecah teks THEN the system SHALL memilih ukuran chunk berbasis tinggi-render-aktual (atau biarkan renderer paginasi internal text card), bukan ambang karakter konstan
2.15 WHEN `drawCover` selesai THEN the system SHALL memanggil `resetDocState(doc)` (atau setara) sebelum loop `for slide of fullSlides`, sehingga page kedua dimulai dari state yang konsisten

### Unchanged Behavior (Regression Prevention)

Behavior berikut WAJIB tidak berubah setelah fix dirilis:

3.1 WHEN `createReportPdf(markdown, features)` dipanggil dengan markdown valid THEN the system SHALL CONTINUE TO mengembalikan `Promise<Blob>` dengan `blob.type === "application/pdf"` dan `blob.size > 0`
3.2 WHEN markdown mengandung heading `#` tunggal THEN the system SHALL CONTINUE TO menggunakannya sebagai judul cover (default `"Product & UX Report"` bila tidak ada)
3.3 WHEN markdown mengandung heading `## ...` THEN the system SHALL CONTINUE TO membuat slide baru per heading dan menggunakannya sebagai title slide
3.4 WHEN markdown mengandung heading `### ...` THEN the system SHALL CONTINUE TO me-render heading sebagai section label di dalam slide
3.5 WHEN markdown mengandung kode fence ```` ```flowchart ```` THEN the system SHALL CONTINUE TO mem-parse via `parseFlowChartDefinition`, menempatkan flowchart pada **halaman tersendiri** dengan judul slide induk, dan tetap memanggil `drawSlideFrame`
3.6 WHEN markdown mengandung tabel pipe (`|...|`) yang headernya `Field|Value` THEN the system SHALL CONTINUE TO me-render sebagai key-value grid (bukan tabel biasa) — pemilihan layout berbasis header tidak berubah
3.7 WHEN markdown mengandung tabel pipe yang header pertamanya `Metric` THEN the system SHALL CONTINUE TO me-render sebagai metric cards grid (bukan tabel biasa) — pemilihan layout berbasis header tidak berubah
3.8 WHEN markdown mengandung tabel pipe biasa THEN the system SHALL CONTINUE TO me-render sebagai tabel dengan header row di-styled teal soft
3.9 WHEN markdown mengandung list `-`, `*`, atau `1.` THEN the system SHALL CONTINUE TO me-render sebagai bullet list (numbered list di-treat sama seperti bullet)
3.10 WHEN markdown mengandung paragraf teks biasa THEN the system SHALL CONTINUE TO me-render sebagai text card dengan border, padding 8mm, dan font helvetica 9.2pt
3.11 WHEN `sanitizeReportMarkdown` di-jalankan THEN the system SHALL CONTINUE TO mengganti kata "Tepat AI" → "Feature Tracker" dan menghapus baris yang dimulai dengan "generated/printed/dibuat/dicetak/analisis oleh/prepared by/created by/dibuat oleh"
3.12 WHEN `cleanInline` di-jalankan THEN the system SHALL CONTINUE TO menghapus markdown image, link, code-tick, bold/italic markers, dan menormalkan whitespace
3.13 WHEN report diberikan `features: Feature[]`, the system SHALL CONTINUE TO menambahkan **3 jenis appendix** secara otomatis: Tracker Data Snapshot, Action Priority Summary, dan per-feature detail (Feature Detail + opsional Business Impact + opsional Evidence & Notes)
3.14 WHEN cover halaman digambar THEN the system SHALL CONTINUE TO menampilkan judul, badge "PRODUCT & UX", deskripsi ringkasan, dan kartu jumlah fitur — layout cover tidak diubah
3.15 WHEN slide frame digambar THEN the system SHALL CONTINUE TO menampilkan strip teal di kiri, kartu putih header dengan judul slide, badge nomor halaman, dan footer "Generated report"
3.16 WHEN ekstensi file dihasilkan THEN the system SHALL CONTINUE TO menggunakan `application/pdf` blob (mekanisme `makeReportFileName` di `AiAgentPanel` tidak diubah)
3.17 WHEN orientasi halaman dipilih THEN the system SHALL CONTINUE TO menggunakan A4 landscape (`297mm × 210mm`) dengan margin yang sama
3.18 WHEN `parseFlowChartDefinition` mengembalikan flowchart linear (kasus saat ini dari Gemini), the system SHALL CONTINUE TO menampilkan flowchart yang dapat dibaca dengan urutan node yang benar dari atas-kiri ke bawah-kanan
3.19 WHEN `paginateSlides` menerima slide kosong (semua block-nya filtered) THEN the system SHALL CONTINUE TO meng-skip slide tersebut (filter `slide.blocks.length > 0` tetap berlaku)
3.20 WHEN test `tests/services/pdf-report.test.ts` di-jalankan THEN the system SHALL CONTINUE TO PASS (kontrak return-blob tidak berubah)
