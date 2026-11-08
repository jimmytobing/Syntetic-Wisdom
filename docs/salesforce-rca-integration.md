# Integrasi Salesforce RCA Read-Only

## Arsitektur

GitHub Issue terstruktur memicu GitHub Actions hanya setelah label
`salesforce-rca-approved` diberikan. Gate memeriksa actor dan pembuat Issue terhadap
Repository Variable `RCA_ALLOWED_ACTORS`. Script Node.js memilih request REST atau
Tooling API dari allowlist statis, melakukan OAuth 2.0 Client Credentials, lalu
mengembalikan ringkasan tanpa token atau data record mentah.

Tidak ada Apex, LWC, MCP, Codex runtime, OpenAI API, middleware berbayar, operasi
DML, deployment metadata, atau SOQL yang berasal dari teks Issue.

## Konfigurasi GitHub

Repository Variable:

- `RCA_ALLOWED_ACTORS`: daftar login GitHub eksplisit, dipisahkan koma. Untuk PoC
  nilainya hanya `jimmytobing`. Workflow gagal tertutup jika variable kosong.
- `RCA_MODE`: `mock` selama PoC. Nilai selain `mock` atau `live` ditolak.

`RCA_MODE=mock` selalu memaksa mode mock, termasuk jika input manual dispatch
meminta non-mock. Live baru dapat dipilih jika `RCA_MODE=live`, request lolos
actor/author/label/operation gate, dan job memperoleh approval dari GitHub
Environment `salesforce-hdbsf-rca`. Environment juga wajib menyediakan marker
secret `SF_RCA_ENVIRONMENT_READY=salesforce-hdbsf-rca`; tanpa marker ini job live
gagal tertutup sebelum checkout atau autentikasi Salesforce.

GitHub Actions Secrets yang akan dibutuhkan untuk mode live, tetapi belum dibuat:

- `SF_RCA_CLIENT_ID`
- `SF_RCA_CLIENT_SECRET`
- `SF_RCA_LOGIN_URL`
- `SF_RCA_ENVIRONMENT_READY` khusus Environment sebagai fail-closed marker

Permission workflow dibatasi ke `contents: read` dan `issues: write`. Hak tulis
Issue hanya digunakan untuk menambahkan hasil diagnostik tersanitasi.

Semua Salesforce Secrets harus menjadi Environment Secrets, bukan repository
secrets. Job mock tidak mereferensikan Salesforce Secrets.

## Format request Issue

Gunakan template **Salesforce RCA Read-Only**, lalu pilih tepat satu operasi:

- `schema_wde_trend`: membaca describe schema `WDE_Audience_Trend__c`.
- `query_wde_trend_count`: menghitung record tanpa menampilkan record, dengan
  `LIMIT 200` eksplisit.
- `tooling_wde_metadata`: membaca satu `EntityDefinition` melalui Tooling API.

Request baru tidak langsung berjalan. Actor yang terdaftar di
`RCA_ALLOWED_ACTORS` harus menambahkan label `salesforce-rca-approved`.

Untuk `COUNT()`, REST mengembalikan jumlah melalui `totalSize` dan `records`
kosong. Implementasi memvalidasi `totalSize` sebagai integer non-negatif.
`LIMIT 200` tetap ada karena sintaks tersebut didukung pada bentuk khusus
`COUNT()`, tetapi output tidak mengklaim `limitApplied` atau jumlah total di luar
batas query.

## External Client App yang direncanakan

- Nama dan API name: `Salesforce_AI_RCA`.
- Distribution state: `Local`.
- OAuth scope: hanya `Manage user data via APIs (api)`.
- Flow: OAuth 2.0 Client Credentials.
- Run As: dedicated integration user non-admin yang hanya mempunyai API Enabled,
  object Read, field Read, dan akses metadata yang benar-benar diperlukan.
- Tidak memberikan View All Data, Modify All Data, Customize Application,
  Author Apex, Modify Metadata, atau permission administratif lain.

Org menyediakan satu lisensi `Salesforce Integration` yang belum digunakan dan
profile `Minimum Access - API Only Integrations`. Profile tersebut mewarisi API
Enabled dan API Only, tanpa View All Data, Modify All Data, Author Apex, atau
Customize Application. Belum ada dedicated RCA user; pembuatan user memerlukan
persetujuan terpisah.

Permission Set `Salesforce_AI_RCA_ReadOnly` menambahkan hanya Read pada
`WDE_Audience_Trend__c`. Permission View Setup and Configuration tidak diberikan
karena kebutuhannya belum terbukti dengan user least-privilege.
Tidak ada field-level record permission yang ditambahkan karena tiga operasi
allowlist hanya melakukan describe, aggregate count, dan membaca
`EntityDefinition`; tidak ada nilai field record yang dibaca.

Template External Client App disimpan di `config/salesforce-rca`, bukan folder
deployable, sampai contact email dan dedicated Run As user dikonfirmasi.
`ExtlClntAppGlobalOauthSettings` tidak disimpan di source control karena dapat
memuat consumer credential.

Metadata yang didukung Salesforce adalah `ExternalClientApplication`,
`ExtlClntAppGlobalOauthSettings`, `ExtlClntAppOauthSettings`, dan
`ExtlClntAppConfigurablePolicies`. File OAuth dan policies baru disusun setelah
username Run As serta contact email disetujui. Tidak ada metadata yang dideploy
pada tahap persiapan ini.

## Prosedur OAuth live

1. Workflow mengirim POST ke `/services/oauth2/token` menggunakan
   `grant_type=client_credentials`.
2. Client ID dan secret hanya dibaca dari GitHub Actions Secrets.
3. Access token hanya disimpan di memori proses dan tidak ditulis ke output.
4. Script menerima `instance_url` dari respons OAuth dan hanya mengirim HTTP GET
   ke endpoint yang sudah dipetakan dalam allowlist.
5. Respons mentah diringkas sebelum ditulis ke GitHub Issue.

## Validasi

Status per 8 November 2026:

- Salesforce CLI dan koneksi alias `hdbsf-rca`: PASS.
- Org ID `00Dfj00000eVCOVEA4`, Developer Edition: PASS.
- REST Organization query read-only: PASS.
- Git fetch dan sinkronisasi branch: PASS.
- GitHub CLI login: PASS sebagai `jimmytobing`; akun `098595` tetap tersimpan
  tetapi tidak aktif.
- GitHub API access ke private repository `jimmytobing/Syntetic-Wisdom`: PASS
  dengan permission admin.
- Tiga operasi mock dan penolakan operasi di luar allowlist: PASS secara lokal.
- REST schema, SOQL count WDE, dan Tooling metadata melalui sesi CLI: PASS.
- XML template ECA dikenali oleh Salesforce CLI source converter: PASS secara
  lokal; template belum deployable karena token konfirmasi belum diganti.
- Permission Set XML dan source conversion lokal: PASS.
- OAuth Client Credentials live: NOT TESTED.
- REST, SOQL WDE, dan Tooling melalui External Client App: NOT TESTED.
- Komentar hasil ke GitHub Issue: NOT TESTED.
- Retrieval Issue melalui koneksi GitHub: NOT TESTED.

## Langkah manual/approval berikutnya

1. Berikan akun `098595` akses repository atau login ulang `gh` sebagai akun yang
   mempunyai permission admin/write pada `jimmytobing/Syntetic-Wisdom`.
2. Tentukan dedicated Run As username dan contact email.
3. Review metadata External Client App dan permission set read-only.
4. Berikan persetujuan terpisah untuk deployment metadata ke Developer Org.
5. Setelah fase mock disetujui, simpan tiga GitHub Secrets dan ubah `RCA_MODE`
   ke `live` hanya untuk pengujian OAuth terkontrol.
6. Jalankan mode mock GitHub Actions, lalu validasi OAuth dan API live.
