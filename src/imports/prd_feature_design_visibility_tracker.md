# PRD — Feature Design Visibility Tracker

## 1. Overview

### Product Name
**Feature Design Visibility Tracker**

### Product Type
Internal product / internal dashboard untuk tim Product Design & Research.

### Background
Tim Product Design & Research mengalami kesulitan mendapatkan visibility terhadap fitur-fitur yang sedang berjalan di masing-masing squad. Informasi terkait feature yang sedang dikembangkan sering kali tersebar, tidak terdokumentasi dengan rapi, atau hanya diketahui oleh PO/squad tertentu.

Dalam beberapa kasus, PO atau squad juga membuat design sendiri tanpa melakukan request atau review ke tim Product Design. Akibatnya, tim Product Design & Research tidak selalu mengetahui feature apa saja yang sedang dikembangkan, apakah feature tersebut sudah memiliki design resmi di Figma, apakah design existing sudah sesuai, dan apakah ada kebutuhan review atau evaluasi UX.

Produk ini dibuat sebagai inisiatif untuk mencatat, memonitor, dan memberikan visibility terhadap feature yang sedang berjalan maupun yang sudah release, khususnya dari perspektif Product Design & Research.

---

## 2. Problem Statement

Tim Product Design & Research belum memiliki satu tempat terpusat untuk melihat dan men-track feature yang sedang dikembangkan, sudah release, atau membutuhkan keterlibatan design/research.

Saat ini, informasi feature masih bergantung pada komunikasi manual dengan PO/squad. Namun, PO/squad tidak selalu dapat memberikan informasi yang lengkap, terstruktur, atau terbaru. Hal ini membuat tim Product Design & Research sulit mengetahui:

- Feature apa saja yang sedang dikembangkan.
- Feature berada di modul apa.
- Feature memiliki design existing atau tidak.
- Feature memiliki design resmi di Figma atau tidak.
- Design dibuat oleh Product Design Team atau dibuat sendiri oleh PO/squad.
- Feature mana yang membutuhkan review design.
- Feature mana yang membutuhkan research atau UX evaluation.
- Feature mana yang sudah release.

---

## 3. Goals

### Primary Goal
Membuat internal product berbasis table dashboard yang memudahkan tim Product Design & Research untuk mencatat, melihat, mengelola, dan memonitor feature yang sedang berjalan maupun sudah release dari sisi feature status dan design visibility.

### Secondary Goals
- Mempermudah input data feature secara cepat dan terstruktur.
- Memudahkan tim untuk melihat feature yang dibuat tanpa keterlibatan Product Design.
- Memudahkan tracking ketersediaan design existing dan design Figma.
- Membantu tim menentukan action lanjutan, seperti design review, redesign, research, atau UX evaluation.
- Menjadi single source of visibility untuk kebutuhan monitoring feature dari perspektif design dan research.

---

## 4. Non-Goals

Produk ini tidak bertujuan untuk:

- Menggantikan Jira, Trello, ClickUp, atau project management tool milik squad/dev.
- Mengelola task teknis developer secara detail.
- Mengukur velocity sprint atau story point.
- Menjadi approval system resmi untuk seluruh release.
- Mengelola backlog product secara penuh.
- Menjadi repository utama file design.

Produk ini hanya fokus pada visibility feature dan status design/research.

---

## 5. Target Users

### Primary Users

#### Product Designer
Membutuhkan visibility terhadap feature yang sedang dikembangkan, terutama untuk mengetahui apakah suatu feature sudah memiliki design resmi, perlu review, atau perlu redesign.

#### UX Researcher
Membutuhkan visibility terhadap feature yang mungkin membutuhkan research, usability testing, atau UX evaluation setelah release.

### Secondary Users

#### Design Lead / Product Design Manager
Membutuhkan overview terhadap design coverage, feature yang dibuat oleh PO/squad, serta feature yang membutuhkan perhatian tim design.

#### Product Owner / Squad Representative
Dapat membantu menginput atau memperbarui informasi feature yang sedang dikerjakan oleh squad.

---

## 6. User Needs

| User | Need | Reason |
|---|---|---|
| Product Designer | Melihat daftar feature yang sedang dikembangkan | Agar tidak ada feature yang lepas dari radar design team |
| Product Designer | Melihat apakah feature memiliki Figma design | Agar bisa mengetahui design coverage |
| Product Designer | Melihat design source | Agar tahu apakah design berasal dari tim design atau dibuat sendiri oleh PO/squad |
| Product Designer | Melihat design status | Agar tahu apakah perlu review, redesign, atau sudah approved |
| UX Researcher | Melihat feature yang butuh research | Agar bisa merencanakan riset lebih awal |
| Design Lead | Melihat summary design visibility | Agar bisa menentukan prioritas tim |
| PO/Squad | Menginput feature yang sedang berjalan | Agar informasi feature terdokumentasi dan bisa dilihat tim design/research |

---

## 7. MVP Scope

### In Scope
MVP akan berfokus pada fitur berikut:

1. Dashboard berbasis table.
2. Create feature data.
3. View feature detail.
4. Edit feature data.
5. Archive feature data.
6. Search feature.
7. Filter feature.
8. Status badge untuk feature dan design.
9. Summary cards di atas table.
10. Link Figma dan existing design evidence.
11. Action needed tracking.

### Out of Scope untuk MVP
Fitur berikut tidak masuk MVP:

- Integrasi otomatis dengan Jira.
- Integrasi otomatis dengan Figma API.
- Notification otomatis ke Slack/email.
- Role permission kompleks.
- Approval workflow.
- Analytics lanjutan.
- Bulk update.
- Export report.
- Activity log detail per field.

---

## 8. Main User Flow

### Flow 1 — Add New Feature
1. User membuka dashboard.
2. User klik tombol **Add Feature**.
3. Sistem membuka drawer form input.
4. User mengisi data feature, modul, status feature, design source, design status, Figma link, PIC, dan action needed.
5. User klik **Save Feature**.
6. Sistem menyimpan data dan menampilkan feature baru di table.

### Flow 2 — View Feature Detail
1. User membuka dashboard.
2. User mencari atau memfilter feature.
3. User klik **View Detail** pada row feature.
4. Sistem membuka drawer detail.
5. User melihat informasi lengkap feature, design information, research information, dan notes.

### Flow 3 — Edit Feature
1. User membuka detail feature atau klik action **Edit** dari row table.
2. Sistem membuka drawer edit.
3. User memperbarui data seperti feature status, design status, Figma link, action needed, atau notes.
4. User klik **Save Changes**.
5. Sistem memperbarui data pada table.

### Flow 4 — Archive Feature
1. User klik menu action pada row feature.
2. User memilih **Archive Feature**.
3. Sistem menampilkan confirmation dialog.
4. User mengonfirmasi archive.
5. Sistem menyembunyikan feature dari default active table dan menyimpannya di archived data.

---

## 9. Information Architecture

### Main Navigation
Untuk MVP, produk dapat dibuat sebagai single-page dashboard.

Recommended navigation:

- Dashboard
- Archived Features
- Settings atau Master Data

Jika ingin lebih sederhana, MVP cukup memiliki:

- Feature Tracker Dashboard

---

## 10. Dashboard Layout

### Page Header
Isi:

- Product title: **Feature Design Visibility Tracker**
- Short description: “Track feature development visibility, design source, Figma availability, and action needed for Product Design & Research.”
- Primary CTA: **Add Feature**

### Summary Cards
Summary cards ditampilkan di atas table untuk membantu user membaca kondisi secara cepat.

Recommended cards:

1. **Total Features**
2. **In Development**
3. **Need Design Review**
4. **No Figma Design**
5. **Designed by PO/Squad**
6. **Released**

### Filter & Search Bar
Filter dan search berada di atas table.

Components:

- Search input
- Module filter
- Feature Status filter
- Design Source filter
- Design Status filter
- Figma Availability filter
- Action Needed filter
- Research Needed filter

### Main Table
Table menjadi pusat utama dashboard.

Recommended columns:

| Column | Description |
|---|---|
| Feature | Menampilkan nama feature dan deskripsi singkat |
| Module | Modul tempat feature berada |
| Feature Status | Status pengerjaan feature |
| Design Status | Gabungan design source dan design status |
| Figma | Ketersediaan design Figma |
| Owner | PO/PIC dan designer jika ada |
| Action Needed | Tindakan yang dibutuhkan dari tim design/research |
| Last Updated | Waktu terakhir data diperbarui |
| Action | View, Edit, Archive |

---

## 11. Data Fields

### Feature Information

| Field | Type | Required | Notes |
|---|---|---|---|
| Module | Dropdown | Yes | Modul tempat feature berada |
| Feature Name | Text input | Yes | Nama feature |
| Feature Description | Textarea | Yes | Deskripsi singkat feature |
| Squad | Dropdown / Text | Optional | Squad yang mengerjakan |
| PO/PIC | Text input | Yes | PIC utama dari sisi product/squad |
| Feature Status | Dropdown | Yes | Status feature |
| Target Release Date | Date picker | Optional | Estimasi release |
| Release Date | Date picker | Optional | Diisi jika sudah release |

### Design Information

| Field | Type | Required | Notes |
|---|---|---|---|
| Design Source | Dropdown | Yes | Sumber design |
| Design Status | Dropdown | Yes | Status design |
| Existing Design Available | Boolean | Optional | Ada/tidak existing design |
| Existing Design Evidence | URL / Upload | Optional | Link atau screenshot existing design |
| Figma Available | Boolean | Yes | Ada/tidak Figma design |
| Figma Link | URL | Conditional | Required jika Figma Available = Yes |
| Designer PIC | Text input | Optional | Designer yang terlibat |
| Design Gap Notes | Textarea | Optional | Catatan gap antara existing, PO design, dan Figma |

### Research & Follow-up Information

| Field | Type | Required | Notes |
|---|---|---|---|
| Research Needed | Dropdown | Optional | Yes / No / Maybe |
| Researcher PIC | Text input | Optional | Researcher yang terlibat |
| UX Evaluation Needed | Dropdown | Optional | Yes / No / Maybe |
| Action Needed | Dropdown | Yes | Action utama yang perlu dilakukan |
| Notes | Textarea | Optional | Catatan tambahan |

### System Fields

| Field | Type | Notes |
|---|---|---|
| Created At | Timestamp | Dibuat otomatis |
| Created By | User | Dibuat otomatis |
| Last Updated | Timestamp | Update otomatis |
| Updated By | User | Update otomatis |
| Archived | Boolean | Untuk menyembunyikan data dari default table |

---

## 12. Dropdown Values

### Feature Status

- Discovery
- In Discussion
- In Development
- Ready to Release
- Released
- On Hold

### Design Source

- Not Available
- Product Design Team
- PO / Squad
- Existing App
- Unknown

### Design Status

- No Design Yet
- Need Review
- In Progress
- Approved
- Figma Available
- Mismatch
- Need Redesign

### Figma Availability

- Available
- Not Available

### Research Needed

- Yes
- No
- Maybe

### UX Evaluation Needed

- Yes
- No
- Maybe

### Action Needed

- No Action
- Need Design
- Need Design Review
- Need Figma Link
- Need Redesign
- Need Research
- Need UX Evaluation
- Need PO Confirmation

---

## 13. CRUD Requirements

### Create Feature
User dapat menambahkan data feature baru melalui drawer form.

Acceptance Criteria:

- User dapat membuka form Add Feature dari tombol utama.
- Field required wajib terisi sebelum data dapat disimpan.
- Jika Figma Available = Available, maka Figma Link wajib diisi.
- Setelah berhasil disimpan, data baru muncul di table.
- Summary cards ikut diperbarui setelah data tersimpan.

### View Feature
User dapat melihat detail lengkap sebuah feature.

Acceptance Criteria:

- User dapat membuka detail feature dari table.
- Detail menampilkan informasi feature, design, research, dan follow-up.
- Link Figma dapat diklik jika tersedia.
- Existing design evidence dapat dilihat jika tersedia.

### Edit Feature
User dapat memperbarui data feature.

Acceptance Criteria:

- User dapat membuka edit form dari table atau detail drawer.
- Data lama tampil otomatis di form.
- User dapat menyimpan perubahan.
- Last Updated berubah setelah data disimpan.
- Table dan summary cards diperbarui setelah perubahan.

### Archive Feature
User dapat mengarsipkan feature.

Acceptance Criteria:

- User dapat memilih Archive dari action menu.
- Sistem menampilkan confirmation dialog sebelum archive.
- Setelah di-archive, feature tidak muncul di default active table.
- Feature tetap tersedia di Archived Features.

---

## 14. Search, Filter, and Sorting Requirements

### Search
User dapat mencari feature berdasarkan:

- Feature name
- Feature description
- Module
- PO/PIC
- Designer PIC

### Filter
User dapat memfilter data berdasarkan:

- Module
- Feature Status
- Design Source
- Design Status
- Figma Availability
- Action Needed
- Research Needed
- UX Evaluation Needed

### Sorting
User dapat mengurutkan data berdasarkan:

- Last Updated
- Target Release Date
- Release Date
- Feature Name
- Module

Default sorting:

1. Action Needed selain “No Action” tampil lebih atas.
2. Feature dengan Design Status “Need Review”, “No Design Yet”, “Mismatch”, atau “Need Redesign” tampil lebih atas.
3. Last Updated terbaru.

---

## 15. Empty States

### No Data Yet
Title: **No features tracked yet**

Description: **Start by adding your first feature to build visibility for Product Design & Research.**

CTA: **Add Feature**

### No Search Result
Title: **No matching feature found**

Description: **Try adjusting your search keyword or filter to find the feature you need.**

CTA: **Clear Filter**

### No Archived Feature
Title: **No archived feature**

Description: **Archived features will appear here when you archive tracked feature data.**

---

## 16. Validation Rules

- Module is required.
- Feature Name is required.
- Feature Description is required.
- PO/PIC is required.
- Feature Status is required.
- Design Source is required.
- Design Status is required.
- Figma Availability is required.
- Figma Link is required if Figma Availability = Available.
- Action Needed is required.
- Release Date should only be filled if Feature Status = Released.

---

## 17. Success Metrics

### Product Usage Metrics
- Number of features tracked.
- Number of active users from Product Design & Research.
- Number of feature records updated per week.
- Percentage of feature records with complete design information.

### Visibility Metrics
- Number of features in development visible to the design/research team.
- Number of features with Figma design available.
- Number of features designed by PO/squad.
- Number of features requiring design review.
- Number of released features requiring UX evaluation.

### Operational Metrics
- Reduction in manual follow-up to PO/squad.
- Faster identification of features without Figma design.
- Faster identification of features that need design review.

---

## 18. Risks & Considerations

### Risk 1 — Data tidak di-update secara rutin
Jika data tidak diperbarui, dashboard akan kehilangan akurasi.

Mitigation:
- Buat ownership data yang jelas.
- Tambahkan Last Updated agar data stale terlihat.
- Jadikan update tracker sebagai bagian dari weekly design/research sync.

### Risk 2 — PO/Squad tidak menginput data
Jika hanya tim design yang input manual, visibility tetap bergantung pada inisiatif individual.

Mitigation:
- Mulai dari input manual oleh design/research team.
- Setelah value terbukti, ajak PO/squad untuk ikut update.
- Buat form input yang sangat sederhana.

### Risk 3 — Terlalu mirip project management tool
Jika scope melebar, produk bisa menjadi terlalu kompleks.

Mitigation:
- Fokus pada feature visibility, design source, Figma availability, dan action needed.
- Hindari task-level tracking untuk MVP.

### Risk 4 — Status terlalu banyak dan membingungkan
Terlalu banyak status bisa membuat user bingung saat input.

Mitigation:
- Gunakan status yang sederhana.
- Berikan helper text pada dropdown jika diperlukan.
- Evaluasi status setelah beberapa minggu penggunaan.

---

## 19. MVP Prioritization

### Must Have
- Feature table dashboard.
- Add feature.
- View detail.
- Edit feature.
- Archive feature.
- Search.
- Filter.
- Summary cards.
- Design source tracking.
- Design status tracking.
- Figma availability tracking.
- Action needed tracking.

### Should Have
- Archived feature page.
- Existing design evidence link/upload.
- Research needed field.
- UX evaluation needed field.
- Last updated indicator.

### Could Have
- Export CSV.
- Bulk update.
- Duplicate feature.
- Activity log.
- Comment thread.
- Notification/reminder.

### Won’t Have in MVP
- Jira integration.
- Figma API integration.
- Slack notification.
- Approval workflow.
- Advanced analytics.

---

## 20. Recommended MVP Screen List

### Screen 1 — Feature Tracker Dashboard
Main screen berisi summary cards, filter/search, dan feature table.

### Screen 2 — Add Feature Drawer
Drawer form untuk membuat feature baru.

### Screen 3 — View Feature Detail Drawer
Drawer untuk melihat detail lengkap feature.

### Screen 4 — Edit Feature Drawer
Drawer untuk mengubah data feature.

### Screen 5 — Archive Confirmation Dialog
Dialog konfirmasi sebelum mengarsipkan feature.

### Screen 6 — Archived Features View
List feature yang sudah diarsipkan.

---

## 21. Initial UI Direction

### Design Principle
- Table-first.
- Fast scanning.
- Easy filtering.
- Status should be visually clear.
- Input should be simple and structured.
- Detail should not overload the main table.

### UI Recommendations
- Use badge/chip for status.
- Use drawer for Add, View, and Edit.
- Use compact summary cards.
- Use sticky table header.
- Use clear empty states.
- Put long descriptions inside detail drawer, not as separate wide columns.
- Prioritize action needed and design status visually.

---

## 22. Open Questions

1. Siapa yang akan menjadi primary data owner untuk setiap feature?
2. Apakah PO/squad akan diberi akses input, atau hanya Product Design & Research?
3. Apakah existing design evidence perlu berupa upload image, link, atau keduanya?
4. Apakah archived feature bisa di-restore?
5. Apakah diperlukan role permission sejak MVP?
6. Apakah module list akan fixed atau bisa ditambahkan manual oleh user?
7. Apakah data perlu bisa diexport untuk reporting?
8. Apakah tracking release date cukup manual atau perlu sinkronisasi dengan release notes?

---

## 23. One-liner Product Definition

**Feature Design Visibility Tracker adalah internal product berbasis table yang membantu tim Product Design & Research mencatat, memonitor, dan mengevaluasi feature yang sedang dikembangkan atau sudah release, khususnya dari sisi design source, Figma availability, design status, dan action needed.**

