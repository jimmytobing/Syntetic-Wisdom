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
