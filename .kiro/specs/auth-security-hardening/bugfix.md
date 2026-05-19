# Bugfix Requirements Document

## Introduction

Terra Feature Tracker memiliki tiga celah keamanan yang saling terkait di area kredensial dan otorisasi. Ketiganya diperbaiki dalam satu siklus karena Bug 2 berakar pada Bug 1, dan Bug 3 berbagi tema "credentials hygiene" yang sama.

- **Bug 1 — Plaintext password di Firestore.** Dokumen `workspaces/default/users/{uid}` menyimpan field `password` dalam bentuk plaintext (ditulis saat admin membuat user lewat Settings, dan di-overwrite dengan hardcoded `"admin1234"` saat auto-seed di `App.tsx`). Siapa pun yang punya read access ke koleksi user — kolaborator workspace, kebocoran security rules, atau breach — langsung mendapat kredensial yang bisa dipakai login.
- **Bug 2 — Secondary auth flow rapuh saat edit/delete user.** `handleEdit` dan `confirmDelete` di `settings-page.tsx` re-authenticate pakai `signInWithEmailAndPassword(secondaryAuth, originalUser.email, originalUser.password)`. Jika password Firestore tidak match Firebase Auth (kasus auto-seed dari Bug 1, atau reset password manual), edit gagal total. Worse: di `confirmDelete`, sign-in yang gagal hanya di-`console.warn` lalu kode tetap menghapus dokumen Firestore — meninggalkan **orphan Firebase Auth user** yang masih bisa login tanpa profile.
- **Bug 3 — Gemini API key ter-bundle ke client.** `gemini.ts` membaca `import.meta.env.VITE_GEMINI_API_KEY`; karena prefix `VITE_`, Vite meng-inline value tersebut ke bundle JavaScript publik. Siapa pun yang inspect bundle (View Source / DevTools / asset publik Vercel) bisa scrape key dan menguras kuota Gemini billing.

Fix dirancang dengan keputusan arsitektur:
1. Admin user management dipindah ke endpoint Vercel Serverless Function yang menggunakan Firebase Admin SDK — tidak butuh password user.
2. Gemini di-proxy lewat Vercel Serverless Function dengan verifikasi Firebase ID token.
3. Field `password` lama dibersihkan dari Firestore lewat one-shot migration script.

## Bug Analysis

### Current Behavior (Defect)

Apa yang terjadi sekarang dan kenapa itu salah:

1.1 WHEN admin membuat user lewat Settings → "Add User" THEN the system menyimpan `form.password` sebagai field plaintext di dokumen `workspaces/default/users/{uid}`
1.2 WHEN client mana pun dengan read access ke koleksi `workspaces/default/users` membaca dokumen user THEN the system mengembalikan field `password` dalam bentuk plaintext
1.3 WHEN Settings page me-render tabel user THEN the system menampilkan kolom Password dengan toggle visibility (Eye/EyeOff) yang membongkar password plaintext ke admin yang melihat
1.4 WHEN user yang sudah authenticated login pertama kali AND profile Firestore-nya belum ada THEN the system menulis hardcoded `password: "admin1234"` ke dokumen Firestore-nya tanpa peduli password Firebase Auth aslinya
1.5 WHEN migrasi `feature_tracker_db` dari localStorage berjalan THEN the system menyalin field `password` plaintext apa adanya dari localStorage ke Firestore
1.6 WHEN admin meng-edit user dan email/password berubah THEN the system memanggil `signInWithEmailAndPassword(secondaryAuth, originalUser.email, originalUser.password)` menggunakan plaintext password yang tersimpan di Firestore sebagai source of truth
1.7 WHEN password Firestore tidak match password Firebase Auth (akibat auto-seed di 1.4 atau reset password manual) THEN the system menggagalkan seluruh operasi edit dengan error "wrong password" walaupun perubahan yang diminta hanya update display name
1.8 WHEN admin meng-hapus user AND sign-in `secondaryAuth` gagal THEN the system hanya menulis `console.warn` lalu tetap memanggil `deleteUserProfile`, sehingga Firestore profile terhapus tetapi Firebase Auth user tetap ada (orphan) dan masih bisa login tanpa profile di app
1.9 WHEN operasi admin gagal THEN the system menampilkan raw Firebase error message tanpa konteks bahwa kegagalan diakibatkan re-auth flow yang rapuh
1.10 WHEN Vite mem-bundle aplikasi untuk produksi THEN the system meng-inline value `VITE_GEMINI_API_KEY` sebagai string literal di bundle JavaScript yang di-serve publik
1.11 WHEN siapa pun membuka DevTools / View Source / mengakses asset bundle di Vercel THEN the system meng-ekspos Gemini API key dalam bentuk yang bisa di-scrape
1.12 WHEN `streamGemini` atau `askGemini` dipanggil dari komponen UI THEN the system mengirim request langsung dari browser ke `generativelanguage.googleapis.com` dengan API key dari bundle, sehingga kuota dapat di-abuse oleh siapa pun yang punya key

### Expected Behavior (Correct)

Apa yang seharusnya terjadi setelah fix:

2.1 WHEN admin membuat user lewat Settings → "Add User" THEN the system SHALL menyimpan hanya `id`, `name`, dan `email` di dokumen `workspaces/default/users/{uid}` (tanpa field `password`)
2.2 WHEN client mana pun membaca dokumen user THEN the system SHALL tidak pernah mengembalikan field `password` (field tersebut tidak boleh ada di dokumen mana pun)
2.3 WHEN Settings page me-render tabel user THEN the system SHALL tidak menampilkan kolom Password atau toggle visibility password — kolom diganti dengan kolom Actions saja
2.4 WHEN user yang sudah authenticated login pertama kali AND profile Firestore-nya belum ada THEN the system SHALL membuat profile dengan `id`, `name`, `email` saja (tanpa field `password`, tanpa nilai hardcoded)
2.5 WHEN migrasi `feature_tracker_db` dari localStorage berjalan THEN the system SHALL tidak menyalin field `password` ke Firestore
2.6 WHEN dokumen user lama di Firestore masih memiliki field `password` THEN the system SHALL menyediakan one-shot migration script yang menghapus field `password` dari semua dokumen di `workspaces/default/users` dan menyertakan instruksi menjalankannya di README spec
2.7 WHEN admin meng-edit email atau password user THEN the system SHALL memanggil endpoint server-side (`/api/admin/update-user`) yang menggunakan Firebase Admin SDK `admin.auth().updateUser(uid, ...)` tanpa membutuhkan plaintext password user yang di-edit
2.8 WHEN admin meng-hapus user THEN the system SHALL memanggil endpoint server-side (`/api/admin/delete-user`) yang menggunakan `admin.auth().deleteUser(uid)`, dan hanya setelah penghapusan Auth berhasil baru menghapus dokumen Firestore profile
2.9 WHEN operasi admin gagal di sisi Auth (update atau delete) THEN the system SHALL tidak menghapus atau mengubah dokumen Firestore profile (mencegah orphan), menampilkan pesan error yang jelas ke admin, dan menjaga state Auth + Firestore tetap konsisten
2.10 WHEN endpoint admin server-side menerima request THEN the system SHALL memverifikasi Firebase ID token dari header `Authorization: Bearer <token>` sebelum melakukan operasi Admin SDK; request tanpa token valid SHALL ditolak dengan HTTP 401 tanpa memanggil Admin SDK
2.11 WHEN Vite mem-bundle aplikasi untuk produksi THEN the system SHALL tidak menyertakan Gemini API key dalam bentuk apa pun di artifact client (tidak ada `VITE_GEMINI_API_KEY` di kode client)
2.12 WHEN `streamGemini` atau `askGemini` dipanggil dari komponen UI THEN the system SHALL mengirim request ke endpoint proxy server-side (`/api/gemini`) yang menyimpan Gemini key sebagai server-only environment variable (tanpa prefix `VITE_`)
2.13 WHEN `/api/gemini` menerima request THEN the system SHALL memverifikasi Firebase ID token dari header `Authorization` sebelum mem-forward request ke Gemini API
2.14 WHEN `/api/gemini` menerima request tanpa ID token atau dengan token tidak valid THEN the system SHALL menolak dengan HTTP 401 dan tidak memanggil Gemini API
2.15 WHEN proxy `/api/gemini` mem-forward streaming response dari Gemini THEN the system SHALL menjaga semantik streaming chunk-by-chunk ke client agar AiAgentPanel tetap menampilkan jawaban real-time

### Unchanged Behavior (Regression Prevention)

Behavior berikut WAJIB tidak berubah setelah fix dirilis:

3.1 WHEN admin membuat user baru lewat "Add User" THEN the system SHALL CONTINUE TO membuat Firebase Auth account dengan email/password yang diinput, menyimpan profile (`id`, `name`, `email`) di Firestore, dan tidak menyebabkan admin yang sedang login keluar dari sesinya
3.2 WHEN admin membuka Settings → User Management THEN the system SHALL CONTINUE TO menampilkan daftar user dengan kolom Name dan Email, plus tombol Edit dan Delete pada setiap baris
3.3 WHEN admin meng-edit hanya display name user (tanpa mengubah email/password) THEN the system SHALL CONTINUE TO meng-update field `name` di Firestore tanpa memerlukan operasi Firebase Auth apa pun
3.4 WHEN admin mencoba menghapus user terakhir yang tersisa THEN the system SHALL CONTINUE TO memblokir aksi dengan toast warning "Cannot delete the last remaining user account"
3.5 WHEN user login lewat LoginPage dengan email + password yang valid THEN the system SHALL CONTINUE TO meng-authenticate lewat `signInWithEmailAndPassword` pada primary auth dan men-trigger `onAuthStateChanged` listener di App.tsx
3.6 WHEN AiAgentPanel memanggil `streamGemini(userMessage, features, types, trainingEntries, mode, chatHistory)` dengan parameter yang sama seperti sebelum fix THEN the system SHALL CONTINUE TO menghasilkan jawaban yang setara secara fungsional (system instruction BRANCH A vs B, mode prompts, history filtering, dan model `gemini-3.1-flash-lite` tetap sama)
3.7 WHEN AiAgentPanel mengirim chat dengan history multi-turn THEN the system SHALL CONTINUE TO menerapkan rule `buildChatHistory` (skip pesan kosong, mulai dari role user pertama) dan men-stream chunk text sesuai urutan
3.8 WHEN aplikasi membaca `VITE_FIREBASE_*` env variables saat init THEN the system SHALL CONTINUE TO meng-init Firebase web SDK seperti semula (Firebase config memang by-design boleh ada di client; proteksi tetap di Security Rules)
3.9 WHEN data di koleksi `features`, `config`, dan `ai-training` dibaca atau ditulis THEN the system SHALL CONTINUE TO bekerja tanpa perubahan (fix ini hanya menyentuh path users + Gemini)
3.10 WHEN feature `subscribeToFeatures`, `subscribeToConfig`, `subscribeToUsers`, dan `subscribeToAiTraining` dipanggil THEN the system SHALL CONTINUE TO mengembalikan unsubscribe function dan men-deliver real-time updates lewat `onSnapshot`
3.11 WHEN auto-seed profile dijalankan untuk user yang baru pertama login THEN the system SHALL CONTINUE TO membuat dokumen profile (hanya saja tanpa field `password`) sehingga user langsung muncul di User Management list
