## Rancangan terbaru — dispatch manual setelah klaim unik (24 Nov 2026)

**Menggantikan desain sebelumnya dengan trigger otomatis.** Source sekarang mempertahankan `Tgr_WDE_Audio_QA_Foreground_Claim` hanya sebagai Flow Draft **inert** (tanpa scheduled/async paths dan tanpa subflow). Entry yang direncanakan hanya `WDE_Reserve_Foreground_Audio_QA`. Setelah `Create_Claim` sukses dengan `Claim_Key__c` unik di database, Flow menjalankan `Dispatch_Once` sebagai subflow ke `WDE_Run_Foreground_Audio_QA`. Jalur duplicate-claim Create Records fault **tidak** memanggil provider.

**Komit transaksi sebelum jaringan.** Worker memverifikasi source, durasi maksimal 30 detik, rights dan fingerprint; kemudian menulis `State__c=CALLING` serta `Fence__c=$Flow.InterviewGuid` dengan filter `State__c=RESERVED`. Worker membaca ulang claim dan mensyaratkan token miliknya sebelum `Call_Gemini`. Action External Service memakai `flowTransactionModel=Automatic`, yang menurut [Salesforce Flow transactions](https://help.salesforce.com/s/articleView?id=sf.flow_concepts_transaction.htm&language=en_US&type=5) dapat mengakhiri transaksi DML sebelum callout pada transaksi baru. Pencatatan receipt/fault membutuhkan `State__c=CALLING` dan fence yang sama. Perubahan sumber sebelum/selama callout menjadi `STALE_SOURCE`, timeout ambigu `UNKNOWN_DO_NOT_RETRY`, dan tidak ada QA verdict update atau retry otomatis.

**Dua permission set dipisahkan:** `WDE_Audio_QA_Foreground_Operator` hanya read-only; `WDE_Audio_QA_Foreground_Runner` adalah source izin khusus service identity dan memberi akses Flow granular hanya ke **parent Reserve**, bukan worker langsung. Worker dan Reserve memiliki `isAdditionalPermissionRequiredToRun=true`. Runner permission set **belum di-assign**; perlu review Admin terhadap identitas eksekusi dan granular access sebelum aktivasi. Tidak ada User/Profile/PermissionSetAssignment DML otomatis.

**Batas keamanan yang tetap berlaku:** Alur di atas memberi proteksi aplikasi yang lebih kuat terhadap dua permintaan manual bersamaan dan replay dari awal Flow (Create duplikat ditolak) serta percobaan worker yang dimulai ulang ketika status bukan RESERVED. Namun, **tidak boleh diklaim jaminan exactly-once absolut**: workflow/platform dapat mengalami continuation ambigu di sekitar callout, perubahan kondisi ketika dua worker yang sudah berjalan bersamaan, atau panggilan provider yang sukses tetapi hasilnya hilang. Tidak ada kunci idempotensi `generateContent` yang telah terbukti menjamin deduplikasi di sisi provider. Salesforce Metadata API dan CI tidak mengeksekusi stress test konkurensi atau provider callout. Oleh sebab itu **Flow tetap Draft dan aktivasi memerlukan keputusan risiko yang eksplisit serta review independen**. Jika jaminan at-most-once mutlak diperlukan, tambahkan layanan dispatcher yang menawarkan request-key dedup persisten sebelum jaringan (bukan Apex terselubung), atau pilih tidak mengirim secara otomatis.

Dokumentasi tahap awal di bawah yang menyebut `AsyncAfterCommit` sebagai jalur aktif adalah **historis, diganti dengan rancangan manual di atas**. Tidak mengulang pilot kualitas audio yang telah diterima.

## Review keamanan runtime — 24 November 2026 (activation gate)

**Temuan HIGH / BLOCKER:** `WDE_Audio_QA_Claim__c.Claim_Key__c` bersifat unik sehingga dua operasi **Create Records** dengan segmen sama tidak bisa sama-sama berhasil. Namun trigger `AsyncAfterCommit` dan worker `WDE_Run_Foreground_Audio_QA` tidak menjamin satu **provider POST** apabila eksekusi asynchronous diulang/deliver lebih dari sekali, atau worker invoked langsung lebih dari sekali. Worker membaca `State__c=RESERVED` lalu memanggil `WDEGeminiVideo.analyzeVideo`, sedangkan mutasi status claim terjadi **sesudah** callout. Dua eksekusi bersamaan dapat sama-sama membaca RESERVED. Pemeriksaan filter `State__c=RESERVED` pada `recordUpdates` setelah callout hanya melindungi penulisan hasil, bukan pengiriman ganda. Klaim singleton ≠ provider idempotency. Kondisi timeout ambigu juga dapat meninggalkan RESERVED saat eksekusi mati sebelum fault path; jangan berasumsi semua error menulis `UNKNOWN_DO_NOT_RETRY`.

**Temuan MEDIUM / access:** Permission set `WDE_Audio_QA_Foreground_Operator` sebelumnya mengizinkan create/edit claim. Perubahan source 24 Nov mengubahnya menjadi **read-only**, seluruh field `editable=false`, sehingga user operator tidak diberi jalur langsung mengedit status, fingerprint dan offset. Ini source-only, **belum terpasang di Org**; untuk menjalankan reserve Flow, mode eksekusi, CRUD/FLS source, dan identitas pemanggil perlu review terpisah. Jangan memperluas akses hanya agar Flow bisa dijalankan.

**Temuan MEDIUM / integrity:** `Fingerprint__c` berbentuk string pendek (bukan SHA-256), `Source_Modified__c` dan `Source_Record_Modified__c` berbasis LastModifiedDate. Tidak cukup sebagai otorisasi provider POST atau bukti immutable snapshot. Check POST response `finishReason=STOP` tidak memverifikasi keutuhan audio segmen, dan `MEDIA_UNAVAILABLE` harus fail closed. Hak pemutaran video dan pengiriman potongan transkrip ke layanan eksternal tetap wajib dipastikan.

**Keputusan:** Semua tiga Flow tetap **Draft**. Tambahan `SECURITY_REVIEW_REQUIRED` pada description worker dan trigger serta tes CI melarang hilangnya tanda itu/aktivasi tanpa review. **Jangan deploy/aktifkan** versi perubahan source ini otomatis, jangan memanggil Gemini, dan jangan membuat claim nyata untuk pengujian. Paket pasif versi sebelumnya memang telah dideploy dengan `ActiveVersionId=null` pada ketiga Flow ([readback](https://github.com/jimmytobing/Syntetic-Wisdom/issues/69#issuecomment-7121468579)).

**Jalur penyelesaian tanpa Apex:** desain tambahan yang memisahkan *claim reservation* dari *dispatch right* yang hanya dapat diperoleh satu worker melalui operasi database atomik yang terbukti serta disimpan sebelum jaringan; penyimpanan `CALLING` harus commit dalam transaksi **sebelum** POST. Jika Flow standar tidak dapat melakukan conditional atomic state transition yang mengunci worker untuk mencegah redelivery, perlu meminta persetujuan mekanisme eksternal dengan idempotency key yang benar-benar didukung provider, atau mempertahankan Flow tidak aktif. Tidak boleh menyelesaikan ini dengan Get Records → Decision → Update Records dan mengklaim operasi tersebut atomic. Penanganan outcome tidak pasti harus fail closed dan tanpa retry otomatis. Independent security review wajib sebelum izin aktivasi.

# WDE PR #70 — Rancangan Flow-only foreground Audio QA (review-only)

## Keputusan

**Flow-only** menggantikan rancangan Apex. Tidak diperlukan izin `Author Apex`. PR #70 tetap **Draft** dan tidak mengotorisasi aktivasi, provider POST, atau perubahan verdict Audio QA. Pilot media 30 detik telah diterima pengguna; tidak perlu uji ulang kualitas audio.

Semua operasi Salesforce menggunakan satu [Gateway Issue #15](https://github.com/bfipbf/WDE/issues/15). Flow background sebelumnya telah nonaktif di `hdbsf` dengan `ActiveVersionId=null` ([readback](https://github.com/jimmytobing/Syntetic-Wisdom/issues/69#issuecomment-7095947849)).

## Tiga Flow yang disiapkan (semuanya status Draft)

1. **`WDE_Reserve_Foreground_Audio_QA`** adalah AutoLaunchedFlow manual dengan input `varS_SegmentId`. Memeriksa `Audio_QA_Required__c`, `SYSTEM_ERROR`, stitching closed, transkrip, video ID yang valid dan `PermissionGranted`. Lalu melakukan **Create Records sekali** pada `WDE_Audio_QA_Claim__c` dengan `Claim_Key__c` = ID segmen Salesforce, field `unique=true` dan `externalId=true`. Pembuatan duplikat tertolak di level database, bukan oleh `Get Records`. Kesalahan pembuatan tidak memanggil provider.
2. **`Tgr_WDE_Audio_QA_Foreground_Claim`** adalah **record-triggered create-only after-save** dengan `AsyncAfterCommit` dan filter `State__c=RESERVED`. Karena baris claim unik dibuat sekali, jalur asynchronous tidak dijalankan oleh update record atau percobaan Create duplikat. Tidak ada scheduled repeat, polling, atau retry eksplisit.
3. **`WDE_Run_Foreground_Audio_QA`** adalah worker AutoLaunchedFlow yang membaca klaim, segmen, dan source dengan memeriksa batas **30 detik**, status QA, rights, ID video, offset dan `LastModifiedDate` snapshot kedua record sebelum memanggil `WDEGeminiVideo.analyzeVideo`. HTTP 200, `finishReason=STOP`, teks bounded, dan bukan `MEDIA_UNAVAILABLE` diperlukan untuk menyimpan bukti `RECEIVED`. Setelah callout, versi segmen dan source diperiksa ulang; perubahan menjadi `STALE_SOURCE`. Callout fault menjadi `UNKNOWN_DO_NOT_RETRY`, respons tidak lengkap menjadi `SYSTEM_ERROR`. Hanya baris claim yang dapat ditulis; tidak ada perubahan `Sermon_Segment__c.Audio_QA_Status__c`, `Transcript_Text__c`, atau Audience/HIVE.

**Penting:** Flow metadata dan tes statis tidak menjamin exactly-once delivery pada sistem asynchronous eksternal. Unik DB mencegah dua *pembuatan klaim* per segmen, tetapi kehilangan eksekusi atau replay oleh platform tetap perlu dinilai oleh reviewer. Jika pengiriman ulang async oleh platform tidak dapat dijamin absen, jangan aktifkan worker tanpa fencing/dispatcher terpisah yang dapat dibuktikan. Ketidakpastian provider tidak boleh dianggap gagal lalu di-submit ulang.

### Alasan pembatasan satu klaim per segmen

`Claim_Key__c` menggunakan ID segmen, sehingga semua clip/revisi segmen tersebut memakai satu lifetime claim dan **tidak pernah otomatis membuat klaim baru**. Ini sengaja fail-closed. Untuk menguji segmen lagi di masa depan diperlukan prosedur manual yang berbeda, authorization dan audit. `Fingerprint__c` adalah tanda identitas sumber Flow berukuran 64 karakter **bukan SHA-256**; keutuhan perubahan sumber dibantu oleh `Source_Modified__c` dan `Source_Record_Modified__c`. Waktu perubahan source juga diperiksa setelah callout. Record yang diedit selama pemrosesan tidak boleh menghasilkan verdict.

### Test dan manifest

- `tests/salesforce-rca-audio-flow-only-70.test.mjs` memeriksa kunci unik, async-after-commit, Draft, one callout, hak source, durasi, no-retry, tidak ada Apex atau write verdict.
- `manifest/wde-audio-qa-foreground-schema-70.xml` berisi CustomObject dan 13 field claim.
- `manifest/wde-audio-qa-foreground-flows-70.xml` berisi tiga Flow baru (semua Draft).
- PermissionSet khusus operator tidak memberikan Author Apex atau izin mengubah transkrip/QA verdict.

## Acceptance gates

- [x] Hapus source dan manifest Apex yang belum di-deploy.
- [x] Klaim kunci unik dan tiga Flow Draft dibuat dalam source.
- [x] CI statis repo dijalankan.
- [x] `Sf Deploy mode=validate` skema klaim terbaru: **SUCCESS checkOnly**, 14 komponen, 0 error, deployment `0Affj00000aj1jBCAQ` ([bukti](https://github.com/jimmytobing/Syntetic-Wisdom/issues/69#issuecomment-7121306770)).
- [x] `Sf Deploy mode=validate` gabungan 3 Flow Draft + 13 field + Claim Object + PermissionSet: **SUCCESS checkOnly** pada immutable SHA `967936ef7f9e9ce9182282922b0df4db2717b198`, 18 komponen, 0 error, deployment `0Affj00000aj3D7CAI` ([bukti](https://github.com/jimmytobing/Syntetic-Wisdom/issues/69#issuecomment-7121391336)).
- [x] PermissionSet lolos checkOnly dalam paket gabungan; [ ] review independen CRUD/FLS, identitas eksekusi Flow, dan sharing record sebelum aktivasi. Jangan jadikan field wajib editable secara eksplisit di permission metadata.
- [ ] Review independen pola AsyncAfterCommit untuk mencegah duplicate provider submission dan memastikan bahwa fault ambiguity tetap terminal.
- [ ] Izin terpisah dari pengguna sebelum metadata **deploy aktual**, aktivasi Flow, pemanggilan media, atau perubahan data.
- [ ] Setelah validasi dan approval, lakukan readback Salesforce pada setiap Flow dan rekam ID deployment serta evidence. Tidak otomatis mengubah existing `SYSTEM_ERROR`.

## Legacy dan batas cakupan

PR #62 historis dan PR #70 tetap Draft. Flow async lama `WDE_Start_Segment_Audio_Async_QA` tetap nonaktif, tidak boleh dipanggil. `WDEGeminiAsync` GET/DELETE dipertahankan sebagai manual cleanup; tidak ada submission model background baru. Tidak mengulang quality testing audio sebagaimana diminta pengguna.

## Hasil validasi aktual — 24 November 2026

Pada [Gateway Chat #15](https://github.com/bfipbf/WDE/issues/15), skema baru diperiksa terpisah dengan `checkOnly=true` dan **SUCCESS** (14 komponen), lalu kombinasi objek, permission set dan tiga Flow yang sudah diperbaiki diperiksa dalam satu manifest dengan **SUCCESS** (18 komponen, 0 errors) di immutable SHA `967936ef7f9e9ce9182282922b0df4db2717b198`. Aksi gabungan: [GitHub Actions 45321601866](https://github.com/bfipbf/WDE/actions/runs/45321601866) → [PRIVATE_REPO evidence](https://github.com/jimmytobing/Syntetic-Wisdom/issues/69#issuecomment-7121391336). Kedua validasi bukan deployment aktual; tidak ada Flow baru aktif, record claim dibuat, provider POST, atau perubahan status QA.

Validasi pertama pada Flow saja gagal karena objek klaim masih checkOnly, dan elemen metadata XML perlu pengelompokan. Validasi gabungan pertama juga gagal karena nama rule duplikat dan urutan FLS. Semua masalah metadata tersebut diperbaiki dan validasi kedua gabungan lulus. Ini bukan bukti runtime exactly-once; **jangan aktifkan ketiga Flow sebelum review khusus concurrency/async delivery dan persetujuan deployment mutatif terpisah**. Tidak diperlukan izin `Author Apex`.
