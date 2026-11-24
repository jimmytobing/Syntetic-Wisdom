# WDE: Rekonsiliasi metadata Git dan Salesforce Org (22 November 2026)

> Status: **PARTIAL / full equivalence UNVERIFIED**. Audit ini adalah snapshot; tidak mengklaim seluruh metadata Org cocok dengan Git. Target: `hdbsf` (Org ID `00Dfj00000eVCOVEA4`). Pembanding: `main`, dengan PR #62 sebagai source pending terpisah. Tidak ada deploy, DML, penghapusan, atau aktivasi Flow dalam audit ini.

## Pembaruan acceptance — 24 November 2026 (scope PR #68)

**Keputusan:** PR #68 adalah *capture source-only* untuk 18 komponen metadata WDE yang **sudah ada di Org**, bukan proyek menyamakan seluruh metadata Org dengan Git. Klaim keseluruhan Org identik dengan Git tetap **UNVERIFIED** dan tidak menjadi acceptance gate bagi snapshot 18 komponen ini. Tidak ada alasan untuk me-*deploy* ulang metadata aktif Org sekadar agar tersimpan di Git.

- **Perkembangan PR lain:** [PR #62](https://github.com/jimmytobing/Syntetic-Wisdom/pull/62) ditutup tanpa merge karena source historis bertumpuk; penggantinya [PR #70](https://github.com/jimmytobing/Syntetic-Wisdom/pull/70) sudah di-merge ke `main` pada commit `1160603624aba9200003c0fc7765091cdf671b9d`. Fondasi Audio QA PR #70 tetap nonaktif dan bukan bagian deploy PR #68.
- **Scope snapshot PR #68:** 3 Flow (1 aktif di Org, 2 Draft), 13 CustomField yang terkait, 1 CustomObject, 1 ValidationRule; 18 metadata total dalam 18 berkas XML. Metadata diambil dari Org, dengan blob Flow dan field berasal dari hasil retrieve yang tercatat pada [audit #67](https://github.com/jimmytobing/Syntetic-Wisdom/issues/67). Dokumen ini mencatat prosedur, bukan izin mengaktifkan QA atau menulis data.
- **Batas risiko:** tidak menyentuh credential/token, PermissionSet berhak luas, field legacy/`*_del`, objek aplikasi lain, perbedaan XML hasil normalisasi, atau `WDE_Batch_Run_Create_Object__c.Draft_Boundaries__c` yang belum dapat diretrieve. Perbedaan ini disimpan sebagai *follow-up*, bukan dipaksa masuk ke PR tanpa penilaian.
- **Pengaman penerimaan:** pengujian statis `tests/salesforce-rca-org-source-reconciliation-68.test.mjs` mempertahankan Flow editorial/QA dalam Draft, permission gate OAuth, dua unique claim key dan validasi journal. Manifest eksplisit `manifest/wde-org-source-reconcile-68.xml` untuk **check-only** jika diperlukan; manifest tersebut bukan instruksi deployment aktual.
- **Deployment:** **tidak diperlukan** untuk menyelesaikan PR #68. Tindakan ini hanya memasukkan *representasi source* metadata Org ke Git. Status *Active* pada XML Orchestrator adalah pantulan kondisi Org, **bukan** aktivasi baru. Keberhasilan CI/merge tidak mengesahkan kelayakan Audio QA runtime.

> Semua pernyataan dan angka inventaris di bawah adalah snapshot historis **22 November 2026**. Referensi PR #62 yang masih Draft di bawah telah digantikan oleh status 24 November di atas. Cakupan rekonsiliasi berikutnya tetap membutuhkan review independen per komponen.

## Metode dan bukti

- Inventaris Git diambil dari pohon GitHub `main` dan branch `feature/wde-gemini-batch-qa-61`.
- Inventaris Org memakai Tooling SOQL melalui gateway [bfipbf/WDE#14](https://github.com/bfipbf/WDE/issues/14), [bukti](https://github.com/jimmytobing/Syntetic-Wisdom/issues/67#issuecomment-7079779389).
- Field dibandingkan dengan `CustomField.TableEnumOrId` pada objek yang terkait, bukan dengan nama objek saja; `Sermon_Segment` memiliki dua record CustomObject di Tooling API, sehingga dipakai record kanonis `01Ifj00000BqV7pEAF`.
- Perbandingan hash XML memanfaatkan retrieve metadata read-only, bukan sekadar perbandingan nama. Perbedaan hash tidak otomatis menandakan perubahan semantik akibat normalisasi XML Salesforce.

## Inventaris sumber dan Org

| Jenis | Git main | Org | Hasil |
|---|---:|---:|---|
| Flow | 47 | 67 | Semua 47 Git ditemukan; 20 hanya ada di Org |
| External Service | 11 | 11 | Git-only `WDE_Supadata_Transcript`, Org/PR-only `WDEGeminiAsync` |
| Named Credential | 4 | 4 | Nama semuanya sama |
| External Credential | 4 | 4 | Nama semuanya sama |
| Custom Object | 14 | 25 nama unik | Semua objek Git ditemukan; 11 tambahan di Org |
| WDE + Salesforce_AI_RCA Permission Set | 10 Git | 13 Org | 4 hanya Org, 1 hanya Git |

Daftar Flow tambahan di Org yang bersifat WDE: `WDE_Delete_Segment_Audio_Async_QA`, `WDE_Get_Editorial_Audio_Context`, `WDE_Get_Segment_Audio_Async_QA`, `WDE_Orchestrator_Weekly_Sermon`, `WDE_QA_OAuth_Commit_Release`, `WDE_Start_Segment_Audio_Async_QA`, dan `WDE_Test_Gemini_Async_Text`. Empat di antaranya berada di PR #62. Flow aplikasi lain di Org tidak otomatis termasuk cakupan source WDE.

## Field drift pada objek WDE

- `Sermon_Segment__c`: 27 field kanonis di Org, 8 dalam `main`; empat field `Audio_QA_Batch_*` ada di PR #62, tetapi belum di `main`. Ada 15 field Org lain yang belum dicakup source, termasuk beberapa legacy/deleted-name. Seluruh field yang ada di `main` ditemukan di Org.
- `Sermon_Source__c`: 13 di Org, 10 di `main`; Org-only `Raw_Transcript_Text`, `Transcript_Caption_Count`, `Transcript_Character_Count`.
- `WDE_Batch_Run__c`: 21 di Org, 20 di `main`; Org-only `Auto_Next_Enabled`.
- `WDE_Batch_Run_Create_Object__c`: 17 di Org, 16 di `main`; Org-only `Draft_Boundaries`.
- `Wisdom_Concept_Evidence__c`: 14 di Org, 10 di `main`; empat tambahan berupa field `*_del` historis.
- `WDE_QA_Release__c`: objek Org-only dengan delapan field, belum ditetapkan sebagai bagian source utama.
- Objek `Transcript_Job`, `WDE_Audience_Need`, `WDE_Audience_Signal`, `WDE_Audience_Trend`, `WDE_Content_Plan`, `Wisdom_Concept`, `Wisdom_Insight`, `Wisdom_Insight_Concept`, dan `Wisdom_Relation` cocok pada inventaris nama field.

## Permission Set

Org-only terhadap `main`: `Salesforce_AI_RCA_Metadata_Access`, `WDE_Audio_QA_Async_Operator` (sudah di PR #62), `WDE_Independent_QA_Evidence_Read`, `WDE_QA_OAuth_Commit`.

Git-only terhadap Org: `WDE_Metadata_Deployment_Access`. Tidak melakukan create, delete, atau reassignment tanpa verifikasi kepemilikan dan dependensi.

## Hasil perbandingan isi

- `WDE_Discover_Weekly_Sermon`: blob Org sama persis dengan `main` (`25b9903c990f3a45dcd116c02f63c675e1030c6b`), berbeda dari versi lama PR #62 yang berstatus Draft dan mempunyai logika playlist lama. Dikoreksi di **commit [790a21b](https://github.com/jimmytobing/Syntetic-Wisdom/commit/790a21b56d60dba9a67656af6122f2e3a9b56f6d)**; dua GitHub CI berhasil. [Bukti retrieve](https://github.com/jimmytobing/Syntetic-Wisdom/issues/67#issuecomment-7079808083).
- `WDE_Orchestrator_Weekly_Sermon`: Flow aktif di Org dipanggil oleh `WDE_Discover_Weekly_Sermon`, tetapi tidak ada di `main`. Source Org ditambahkan pada branch rekonsiliasi dengan blob **`1cc061558ea6b3ebec95e54885bd8c96a0680a90`**, identik dengan Org. [Bukti](https://github.com/jimmytobing/Syntetic-Wisdom/issues/67#issuecomment-7079960356).
- Empat Flow PR #62 hasil retrieve memiliki hash berbeda dari source PR; pada contoh `WDE_Test_Gemini_Async_Text`, perbedaan mencakup normalisasi angka `200` vs `200.0`, urutan elemen XML, dan elemen `areMetricsLoggedToDataCloud` yang diabaikan saat retrieve. Kesetaraan semantik keempat Flow **belum terverifikasi**. [Bukti](https://github.com/jimmytobing/Syntetic-Wisdom/issues/67#issuecomment-7079834180).
- Dari empat Named Credential dan empat External Credential, **4/8 hash identik** dengan Git `main`: `WDE_Supadata_API`, `GeminiExCred`, `GoogleApiExCred`, `WDE_Supadata_Auth`. Empat sisanya berbeda dan membutuhkan evaluasi semantik tanpa mengekspor secret.
- Dari sebelas External Service yang ada di Org, **6 hash identik** dengan Git `main`, empat berbeda, satu belum ada di `main`. Metadata `WDE_Supadata_Transcript` di `main` tidak ditemukan di Org. [Bukti](https://github.com/jimmytobing/Syntetic-Wisdom/issues/67#issuecomment-7079939354).

## Risiko dan gerbang penyelesaian

1. **Jangan merge PR #62 sekarang**: masih Draft, base ke branch lama, audio QA belum berhasil, dan ada drift aktif yang baru diperbaiki di source.
2. Jangan menyamakan hash secara paksa dengan deploy semua metadata. Normalisasi XML Salesforce dan konfigurasi credential dapat menyebabkan false positive.
3. Klasifikasikan field/Flow/permission set Org-only menjadi: dibutuhkan di source WDE, legacy aplikasi lain, atau artefak sementara; tarik ke branch khusus bila disetujui.
4. Lakukan pemeriksaan semantik pada metadata yang berbeda dan validasi `Sf Deploy` terhadap manifest yang sempit hanya jika ada perubahan yang memang memerlukan deploy.
5. Setelah semua cakupan WDE disepakati dan perbedaan selesai, lakukan readback ulang sebelum status SUCCESS diberikan.

## Jejak audit

- Gateway: https://github.com/bfipbf/WDE/issues/14
- Evidence mirror: https://github.com/jimmytobing/Syntetic-Wisdom/issues/67
- PR terpisah untuk rekonsiliasi: https://github.com/jimmytobing/Syntetic-Wisdom/pull/68
- PR async QA belum siap: https://github.com/jimmytobing/Syntetic-Wisdom/pull/62

## Implementasi source-only pada PR #68

Pada branch `feature/wde-org-source-reconcile-20261122`, metadata berikut telah diambil langsung dari Org dan ditambahkan sebagai source, **tanpa deployment balik**:

- Flow aktif `WDE_Orchestrator_Weekly_Sermon`; blob cocok secara byte dengan Org (`1cc061558ea6b3ebec95e54885bd8c96a0680a90`).
- Flow Draft nonaktif `WDE_Get_Editorial_Audio_Context`; blob cocok (`9881fcb0f01e3eab4f02a0bbde4547da374b0b52`).
- Flow Draft nonaktif `WDE_QA_OAuth_Commit_Release`; blob cocok (`49edc2a411f4420772f247fa5485e64546336663`).
- Lima field dari Org: `Sermon_Source__c.Raw_Transcript_Text__c`, `Sermon_Source__c.Transcript_Caption_Count__c`, `Sermon_Source__c.Transcript_Character_Count__c`, `WDE_Batch_Run__c.Auto_Next_Enabled__c`, dan `Sermon_Segment__c.WDE_Stitch_Open__c`. [Bukti retrieve](https://github.com/jimmytobing/Syntetic-Wisdom/issues/67#issuecomment-7080054090).
- Objek `WDE_QA_Release__c`, delapan custom field dan satu validation rule `Require_Actual_QA_Commit` (total 10 file) dari Org, source-only. [Bukti retrieve](https://github.com/jimmytobing/Syntetic-Wisdom/issues/67#issuecomment-7080071874).

`WDE_Batch_Run_Create_Object__c.Draft_Boundaries__c` ditemukan di Tooling SOQL tetapi tidak muncul di daftar file pada retrieve field gabungan; **belum diklaim tersinkron**.

Permset `Salesforce_AI_RCA_Metadata_Access` memiliki metadata sangat besar (termasuk hak object dengan `modifyAllRecords`), sehingga percobaan baca seluruh metadata bersama permset lain melampaui batas output gateway (`ENOBUFS`). Tidak ada hak akses yang diubah; **permission set tidak otomatis diimpor**. [Bukti kegagalan baca](https://github.com/jimmytobing/Syntetic-Wisdom/issues/67#issuecomment-7080088741).

Commit source branch terakhir dan CI harus diverifikasi kembali sebelum merge. Metadata aktivasi, credential, field legacy, permission dan perbedaan XML semantik lain tetap memerlukan keputusan independen. Ini **bukan** deklarasi kesamaan semua metadata Org dan Git.
