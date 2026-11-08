# WDE Salesforce Hosted MCP Setup

Tanggal pemeriksaan: 8 November 2026  
Target: WDE Developer Edition, alias Salesforce CLI `hdbsf`

## Ringkasan keputusan

Org WDE dan konektivitas Salesforce CLI sudah terverifikasi. Alias lokal `hdbsf` sudah dibuat. Endpoint resmi `platform/sobject-reads` sudah ditentukan dan dapat dijangkau, tetapi server belum boleh dinyatakan aktif: status Setup belum dapat dibaca melalui UI, dokumentasi resmi menyebut Hosted MCP ditujukan bagi pelanggan dengan Flex Credits dan pemakaian dapat ditagihkan, dan belum ada persetujuan biaya. External Client App juga belum dibuat karena callback URL aktual klien belum tersedia dan pembuatan OAuth client menghasilkan kredensial persisten.

Tidak ada Flow, objek, record, metadata bisnis, integrasi, atau autentikasi existing yang diubah.

## A. Status environment

| Pemeriksaan | Status | Bukti ringkas |
|---|---|---|
| Alias `hdbsf` | PASS | Dibuat lokal dan resolve ke `jto@hdbsf.dev` |
| Autentikasi CLI | PASS | `connectedStatus=Connected` |
| Org ID | PASS | `00Dfj00000eVCOVEA4` |
| Instance URL | PASS | `https://hdbsf-dev-ed.develop.my.salesforce.com` |
| Edition / sandbox | PASS | Developer Edition; `IsSandbox=false` |
| API version | PASS | v68.0 |
| Identitas admin | PASS | User aktif; Profile `System Administrator` |
| Permission admin relevan | PASS | Effective permission set menunjukkan Modify All Data, Customize Application, dan Manage Profiles and Permission Sets |
| Identitas WDE | PASS | Keenam objek target ditemukan di `EntityDefinition` |
| Hosted MCP tersedia di Setup | BLOCKED | Browser/Setup tidak dapat diinspeksi pada sesi ini; tidak ada CLI/API aktivasi yang didokumentasikan |
| Flex Credits/entitlement | BLOCKED | Harus dikonfirmasi pada org/account; pemakaian dapat ditagihkan |

Objek WDE yang dikonfirmasi ada:

- `Sermon_Source__c`
- `Sermon_Segment__c`
- `Transcript_Job__c`
- `Wisdom_Concept__c`
- `Wisdom_Insight__c`
- `WDE_Audience_Signal__c`

## B. Konfigurasi MCP

### Server prioritas

Hanya `platform/sobject-reads` yang direkomendasikan untuk tahap awal. Server ini menyediakan schema discovery, SOQL, SOSL, user context, recent records, dan relationship traversal tanpa operasi insert/update/delete. Semua akses tetap tunduk pada CRUD, FLS, dan sharing user yang melakukan OAuth.

Jangan aktifkan pada tahap ini:

- `platform/sobject-all`
- `platform/sobject-mutations`
- `platform/sobject-deletes`
- server metadata atau API context sampai daftar tools dan dampak permission-nya diperiksa di org

Nama `platform/salesforce-api-context` dan `platform/metadata-experts` berasal dari brief/ekosistem Agentforce Vibes. Referensi Hosted MCP GA terbaru menampilkan katalog server yang dapat berubah. Ketersediaannya harus dibuktikan dari daftar **Setup → API Catalog → MCP Servers** pada org ini; jangan mengasumsikan nama tersebut tersedia hanya dari dokumentasi produk lain.

### Endpoint terverifikasi

Standard Developer Edition:

```text
https://api.salesforce.com/platform/mcp/v1/platform/sobject-reads
```

My Domain Developer Edition:

```text
https://api.salesforce.com/platform/mcp/v1/d/hdbsf-dev-ed/develop/platform/sobject-reads
```

Kedua URL merespons HTTP `401` pada request tanpa token. Ini adalah hasil yang diharapkan untuk endpoint OAuth-protected dan hanya membuktikan DNS/route dapat dijangkau. Hasil tersebut **bukan** bukti server aktif, OAuth valid, atau tool dapat dipanggil.

### External Client App

Nama yang disiapkan:

```text
WDE_AI_MCP_ReadOnly
```

Nilai wajib saat dibuat:

- Enable OAuth: aktif
- OAuth scopes: `mcp_api` dan `refresh_token` / offline access
- OAuth flow: Authorization Code dengan PKCE
- Security: **Issue JSON Web Token (JWT)-based access tokens for named users**
- App authorization: admin-approved/pre-authorized users melalui permission set khusus
- Refresh token validity: 30 hari atau kurang sesuai kebijakan organisasi
- Refresh token rotation: aktif
- Client secret: wajib untuk ChatGPT menurut panduan Salesforce; simpan hanya di secret store klien

Callback URL tidak boleh ditebak:

- Postman desktop: `https://oauth.pstmn.io/v1/callback`
- Postman web: `https://oauth.pstmn.io/v1/browser-callback`
- ChatGPT: salin callback URL yang ditampilkan di **Settings → Apps → Create App → Advanced settings**
- Groq/custom agent: lanjutkan hanya jika runtime klien mendukung OAuth 2.0 Authorization Code + PKCE, penyimpanan client credential yang aman, callback handler, dan refresh-token rotation. Groq API model saja bukan MCP OAuth client lengkap.

Metadata listing tidak menemukan `ExternalClientApplication` di org. Status `WDE_AI_MCP_ReadOnly`: **belum dibuat**.

## C. Hasil validasi

| Tes | Status | Catatan |
|---|---|---|
| Salesforce CLI connectivity | PASS | Alias `hdbsf`, org identity, edition, admin user, dan API v68.0 terverifikasi |
| WDE schema presence via CLI | PASS | Enam dari enam objek target ditemukan melalui Tooling API `EntityDefinition` |
| MCP endpoint format | PASS | Cocok dengan format resmi Developer Edition; standard dan My Domain tersedia |
| Endpoint network reachability | PASS | Kedua endpoint mengembalikan HTTP 401 tanpa credential |
| MCP feature visible in Setup | BLOCKED | UI browser tidak tersedia pada sesi ini |
| Flex Credits / billing approval | BLOCKED | Entitlement belum diverifikasi; potensi tagihan memerlukan persetujuan eksplisit |
| `platform/sobject-reads` activated | NOT TESTED | Tidak diaktifkan dan tidak diklaim aktif |
| External Client App configured | NOT TESTED | Belum dibuat; callback aktual belum dipilih |
| MCP OAuth authentication | NOT TESTED | Consumer key/secret belum ada |
| MCP tool discovery | BLOCKED | Bergantung pada aktivasi dan OAuth |
| MCP read-only schema query | BLOCKED | Bergantung pada aktivasi dan OAuth |
| GitHub comparison readiness | PASS | Remote `origin` tersedia; branch `main`; repo memuat 22 Flow XML, 12 object directories, dan 2 permission-set XML |

## D. Langkah manual yang masih diperlukan

### 1. Konfirmasi entitlement dan server

1. Login ke org `https://hdbsf-dev-ed.develop.my.salesforce.com` sebagai `jto@hdbsf.dev`.
2. Buka **Setup**.
3. Cari **MCP Servers**, lalu buka **API Catalog → MCP Servers**.
4. Catat apakah `platform/sobject-reads` tersedia dan status toggle-nya.
5. Catat apakah `platform/salesforce-api-context` dan `platform/metadata-experts` benar-benar muncul; jangan aktifkan keduanya dulu.
6. Konfirmasi entitlement Flex Credits/Foundations dan mekanisme billing dengan admin/account owner.
7. Hanya setelah persetujuan biaya eksplisit, aktifkan `platform/sobject-reads`; tunggu sampai dua menit dan verifikasi status Active.

Salesforce mendokumentasikan aktivasi server melalui Setup UI. Jangan membuat command CLI/API yang tidak terdokumentasi.

### 2. Buat External Client App

1. Tentukan klien awal. Rekomendasi: Postman desktop untuk validasi mentah sebelum ChatGPT.
2. Buka **Setup → External Client App Manager → New External Client App**.
3. Isi nama `WDE_AI_MCP_ReadOnly` dan informasi kontak admin.
4. Expand **API (Enable OAuth Settings)** dan aktifkan OAuth.
5. Masukkan callback URL aktual klien.
6. Tambahkan scopes `mcp_api` dan `refresh_token`.
7. Aktifkan JWT-based access tokens for named users dan nonaktifkan opsi keamanan lain yang tidak diperlukan.
8. Create. Propagasi dapat membutuhkan hingga 30 menit.
9. Buat permission set khusus untuk user MCP read-only, atur OAuth Policy agar hanya pre-authorized users, lalu assign hanya ke user yang disetujui.
10. Atur refresh-token expiry/rotation sesuai kebijakan.
11. Ambil consumer key/secret hanya melalui UI dan masukkan langsung ke secret store klien. Jangan menulisnya ke repo, dokumen, terminal output, atau chat.

### 3. Validasi dengan Postman

1. Buat request tipe **MCP**, transport **HTTP**.
2. Gunakan endpoint `platform/sobject-reads` di atas.
3. Authorization: OAuth 2.0, Authorization Code + PKCE; authorization data di request header.
4. Pastikan callback URL sama persis dengan External Client App.
5. Lakukan OAuth sebagai user read-only yang telah disetujui.
6. Jalankan tool discovery.
7. Panggil schema tool tanpa parameter, lalu detail `Sermon_Source__c`.
8. Jalankan query bounded, misalnya setelah nama field dikonfirmasi:

```sql
SELECT Id, Name
FROM Sermon_Source__c
WHERE Id != null
LIMIT 5
```

Jangan menjalankan server mutation/delete dan jangan mengirim query tanpa `WHERE` serta `LIMIT`.

### 4. Hubungkan ChatGPT

1. Di ChatGPT buka **Settings → Apps → Create App**.
2. Isi endpoint `platform/sobject-reads`.
3. Pada **Advanced settings**, pilih user-defined OAuth client dan salin callback URL yang ditampilkan.
4. Tambahkan callback tersebut ke External Client App Salesforce.
5. Masukkan consumer key sebagai OAuth Client ID dan consumer secret sebagai OAuth Client Secret.
6. Nonaktifkan OIDC.
7. Create/connect dan selesaikan OAuth sebagai user read-only.
8. Uji schema discovery dan query bounded yang sama seperti Postman.

## E. Workflow RCA read-only

```text
Deskripsi issue
  → identifikasi record, user, Flow, versi, dan timestamp
  → baca Flow XML serta metadata terkait dari GitHub
  → discover schema live melalui MCP
  → jalankan SOQL bounded dan pemeriksaan permission/FLS yang memang tersedia
  → bandingkan metadata GitHub dengan fakta live-org
  → klasifikasikan bukti, gap, dan hipotesis
  → rekomendasikan remediasi Flow-first tanpa deploy otomatis
```

Aturan bukti:

- XML GitHub tidak membuktikan versi Flow yang aktif di org.
- Schema discovery tidak membuktikan FLS user tertentu tanpa pemeriksaan effective access.
- Tidak adanya record/error tidak membuktikan jalur runtime berhasil.
- Jika log, active version, launcher, permission, atau timestamp tidak tersedia, kesimpulan harus diberi label **hipotesis**.
- Tidak ada deployment, activation Flow, perubahan metadata, atau DML otomatis dari workflow RCA.

## Referensi resmi

- [Salesforce Hosted MCP Servers overview](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/hosted-mcp-servers-overview.html)
- [Activate MCP Servers](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/activate-mcp-servers.html)
- [Create an External Client App](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/create-external-client-app.html)
- [Find Your Server URL](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/server-urls.html)
- [SObject Reads MCP Server](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/sobject-reads.html)
- [Standard MCP Servers Reference](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/servers-reference.html)
- [Configure Postman](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/postman.html)
- [Configure ChatGPT](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/chatgpt.html)

