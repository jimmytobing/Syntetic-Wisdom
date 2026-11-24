# SADD–WDE — Arsitektur dan Riwayat Implementasi Visual

**Wisdom Discovery Engine · Snapshot 25 November 2026 · Salesforce Developer Edition `hdbsf` · Org `00Dfj00000eVCOVEA4`**

> **Format:** diagram Mermaid yang dirender sebagai gambar langsung di GitHub; sekitar 90% penyajian visual dan 10% narasi Bahasa Indonesia. Warna, panah, dan status menunjukkan alur konseptual; keberadaan source tidak sama dengan aktivasi Org.

## Cara membaca

Diagram **aktif/terpasang**, **Draft**, **historis**, dan **belum terverifikasi** sengaja dibedakan. Metadata Git yang di-merge **tidak** otomatis ter-deploy. Jangan menggunakan diagram sebagai izin menjalankan Salesforce mutation.

## 01 · Lanskap sistem

```mermaid
flowchart LR
  U["Operator dan ChatGPT"] --> G["Issue gateway bfipbf/WDE"]
  G --> A["GitHub Actions tepercaya"]
  A --> S[("Salesforce Developer Edition hdbsf")]
  A --> E["Issue audit di Syntetic-Wisdom"]
  R["Repository Syntetic-Wisdom"] --> A
  R --> CI["CI dan pengujian"]
  Y["YouTube playlist dan komentar"] --> S
  T["Supadata transcript"] --> S
  Q["Groq segmentasi"] --> S
  M["Gemini analisis dan Audio QA"] --> S
  S --> H["Review editorial dan content plan"]
  classDef source fill:#e7f1ff,stroke:#225ea8,color:#123;
  classDef core fill:#fff0d5,stroke:#b46a00,color:#321;
  class G,A,R,CI source;
  class S core;
```

_Batas: GitHub mengelola perubahan dan bukti; pemrosesan bisnis berlangsung di Salesforce Flow._

## 02 · Lapisan tanggung jawab

```mermaid
flowchart TB
  subgraph X["Kendali dan audit"]
    G["bfipbf/WDE: issue, Actions, sync, close"]
    P["Syntetic-Wisdom: source, manifest, tests, audit"]
  end
  subgraph O["Runtime Salesforce hdbsf"]
    D["Discovery, transcript, Stage A/B/C"]
    B["Objek sumber, batch, segmen"]
    I["Audience Intelligence dan HIVE"]
    Q["Gemini Audio QA terpilih"]
  end
  subgraph V["Penyedia eksternal"]
    Y["YouTube"]
    U["Supadata"]
    R["Groq"]
    M["Gemini"]
  end
  G --> O
  P -. "deploy eksplisit lewat commit SHA" .-> G
  Y --> D
  U --> D
  R --> D
  M --> Q
  D --> B
  B --> Q
  B -. "tidak mengisi sinyal audiens" .-> I
  Y --> I
```

_Panah putus-putus menandai batas kebijakan atau proses yang memerlukan tindakan terpisah._

## 03 · Discovery khotbah mingguan

```mermaid
flowchart TD
  START["WDE_Discover_Weekly_Sermon"] --> ORCH["WDE_Orchestrator_Weekly_Sermon"]
  ORCH --> PL["WDEYouTubePlaylist.playlistItems"]
  PL --> VALID{"Video ID valid?"}
  VALID -- "Tidak" --> SKIP["Lewati entri"]
  VALID -- "Ya" --> EXISTS{"External_Video_Id sudah ada?"}
  EXISTS -- "Ya" --> REUSE["Gunakan sumber eksisting"]
  EXISTS -- "Tidak" --> CREATE["Create Sermon_Source__c"]
  CREATE --> RIGHTS["Rights_Status__c dan Ingest_Status__c"]
  RIGHTS --> INGEST["Tahap transcript"]
  REUSE --> END["Tidak membuat duplikat"]
```

_Video baru tidak otomatis berarti ada izin penggunaan ulang konten._

## 04 · Perolehan dan penyimpanan transcript

```mermaid
flowchart LR
  SRC["Sermon_Source__c"] --> TJOB["Transcript_Job__c"]
  SRC --> SUP["External Service Supadata"]
  SUP --> RAW["Raw_Transcript_Text__c"]
  RAW --> FORMAT["Caption: index;start_ms;duration_ms;text"]
  FORMAT --> VALID{"Caption konsisten?"}
  VALID -- "Tidak" --> HOLD["Error dan perbaikan sumber"]
  VALID -- "Ya" --> PERSIST["WDE_Persist_Raw_Transcript"]
  PERSIST --> BATCH["WDE_Batch_Run__c"]
  BATCH --> A["Stage A"]
```

_Caption berindeks dipertahankan agar klaim editorial dapat ditelusuri ke sumber._

## 05 · Mesin segmentasi tiga tahap

```mermaid
flowchart LR
  B["WDE_Batch_Run__c"] --> A["Stage A: WDE_Orchestrate_Stage_A"]
  A --> C1["WDE_Semantic_Segmentation_Batch"]
  C1 --> V1{"Boundary Groq valid?"}
  V1 -- "Ya" --> B2["Stage B: WDE_Orchestrate_Stage_B"]
  V1 -- "Tidak" --> ERR["RetryPending / review / failure"]
  B2 --> C2["WDE_Enrich_Approved_Boundaries"]
  C2 --> V2{"Enrichment valid dan nonkosong?"}
  V2 -- "Ya" --> C["Stage C: WDE_Orchestrate_Stage_C"]
  V2 -- "Tidak" --> ERR
  C --> P["WDE_Persist_Reviewed_Segments"]
  P --> S[("Sermon_Segment__c")]
  S --> SUM["Summary: hanya setelah gate QA yang berlaku"]
```

_Setiap tahap memvalidasi kontrak data sebelum melanjutkan; hasil salah tidak dianggap sukses._

## 06 · Batch, retry, dan pemulihan terkendali

```mermaid
flowchart TD
  ENTRY["Tgr_WDE_Run_Stage_A / B / C"] --> GET["Ambil Batch_Run dan status"]
  GET --> CHECK{"Tahap boleh berjalan?"}
  CHECK -- "Tidak" --> STOP["Stop tanpa replay"]
  CHECK -- "Ya" --> CALL["Orchestrator Stage"]
  CALL --> OUT{"Hasil"}
  OUT -- "Valid" --> NEXT["CommitApproved / Completed"]
  OUT -- "429 / format / transient" --> BOUND{"Percobaan di bawah batas?"}
  BOUND -- "Ya" --> RETRY["RetryPending dan Next_Retry_At"]
  BOUND -- "Tidak" --> TERM["Failed / System_Error"]
  OUT -- "Perlu penilaian" --> REVIEW["NeedsReview"]
  RETRY --> SCHEDULE["Tgr_WDE_Retry_Stage_A / recovery terbatas"]
  SCHEDULE --> GET
  NEXT --> ADVANCE["WDE_Auto_Advance_Batch"]
```

_Retry tidak boleh mengulang mutation yang hasil sebelumnya masih ambigu._

## 07 · QA audio bersyarat per segmen

```mermaid
flowchart TD
  S["Sermon_Segment__c hasil Stage C"] --> REQUIRED{"Audio_QA_Required__c = true?"}
  REQUIRED -- "Tidak" --> NOCALL["Tidak ada panggilan Gemini"]
  REQUIRED -- "Ya" --> FRESH{"Closed, PENDING atau RETRY_PENDING, attempts < 3?"}
  FRESH -- "Tidak" --> WAIT["Tidak diproses"]
  FRESH -- "Ya" --> QA["WDE_Verify_Sermon_Segment_Audio"]
  QA --> VIDEO["Gemini original video per Start_Ms / End_Ms"]
  VIDEO --> VERDICT{"Evaluasi"}
  VERDICT -- "PASS" --> PASS["PASS: boleh lanjut sesuai gate"]
  VERDICT -- "FAIL" --> FAIL["FAIL: koreksi terbatas atau tetap FAIL"]
  VERDICT -- "Kesalahan teknis" --> TECH["Retry terbatas lalu SYSTEM_ERROR"]
  TECH --> REC["WDE_Daily_Segment_Audio_QA_Recovery"]
  REC --> FRESH
  PASS --> SUM["Finalisasi summary"]
```

_QA audio bukan sumber Audience Need, HIVE, ataupun izin penggunaan materi._

## 08 · Arti status QA

```mermaid
stateDiagram-v2
  [*] --> PENDING
  PENDING --> PASS: Bukti model memenuhi kontrak
  PENDING --> FAIL: Mismatch atau klaim keliru
  PENDING --> RETRY_PENDING: Gangguan teknis / koreksi
  RETRY_PENDING --> PASS: Verifikasi ulang sukses
  RETRY_PENDING --> FAIL: Verifikasi ulang gagal
  RETRY_PENDING --> SYSTEM_ERROR: Batas upaya tercapai
  PASS --> PENDING: Materi sumber berubah
  FAIL --> PENDING: Materi sumber berubah
  SYSTEM_ERROR --> PENDING: Reset terkendali setelah investigasi
  PASS --> [*]
  FAIL --> [*]
  SYSTEM_ERROR --> [*]
```

_SYSTEM_ERROR tidak boleh disamakan dengan PASS, termasuk ketika ada pengecualian rilis._

## 09 · Fondasi Audio QA foreground (Draft / tidak aktif)

```mermaid
flowchart TD
  HUMAN["Permintaan operator terotorisasi"] -. "manual" .-> RES["WDE_Reserve_Foreground_Audio_QA (Draft)"]
  RES --> PRE{"Segmen, sumber, rights, durasi <= 30 s?"}
  PRE -- "Tidak" --> DENY["Tolak"]
  PRE -- "Ya" --> CLAIM["Create WDE_Audio_QA_Claim__c dengan Claim_Key unik"]
  CLAIM --> UNIQUE{"Create berhasil?"}
  UNIQUE -- "Duplikat" --> DENY2["Stop: tanpa POST"]
  UNIQUE -- "Ya" --> WORK["WDE_Run_Foreground_Audio_QA (Draft)"]
  WORK --> FENCE["RESERVED → CALLING + Fence"]
  FENCE --> CHECK{"Ownership dan fingerprint cocok?"}
  CHECK -- "Tidak" --> STALE["STALE_SOURCE / stop"]
  CHECK -- "Ya" --> GEM["Gemini External Service"]
  GEM --> RECEIPT["Receipt / error / UNKNOWN_DO_NOT_RETRY"]
  NOTE["Tgr_WDE_Audio_QA_Foreground_Claim (Draft, inert)"] -.-> RES
  classDef draft fill:#f3ebff,stroke:#6f42a1,color:#25123a;
  class RES,WORK,NOTE draft;
```

_Fondasi telah masuk main lewat PR #70; aktivasi, assignment runner, dan jaminan exactly-once belum disetujui atau dibuktikan._

## 10 · Gemini analisis sumber ≠ QA segmen

```mermaid
flowchart LR
  Y["URL YouTube publik"] --> LOOK["Cari Sermon_Source berdasarkan Video ID"]
  LOOK --> CACHE{"Gemini_Video_Analysis_JSON__c tersedia?"}
  CACHE -- "Ya" --> RETURN["Kembalikan cache"]
  CACHE -- "Tidak" --> GEM["WDE_Analyze_YouTube_Gemini"]
  GEM --> FIRST["Analisis ringkas 0–20 detik"]
  FIRST --> GATE{"HTTP 200 + STOP + kontrak respons?"}
  GATE -- "Ya" --> STORE["Simpan JSON dan waktu validasi respons"]
  GATE -- "Tidak" --> NO["Tidak menyatakan QA semantik"]
  STORE -. "butuh bukti sumber independen" .-> HUMAN["Verifikasi manusia / bukti caption"]
  RETURN --> HUMAN
```

_Timestamp validasi respons tidak membuktikan akurasi audio, kutipan, atau hak cipta._

## 11 · Pengetahuan dan evidence lineage

```mermaid
flowchart TD
  R["Raw caption terindeks"] --> SEGS["Sermon Segment"]
  SEGS --> EVID["Wisdom_Concept_Evidence__c"]
  EVID --> CONCEPT["Wisdom_Concept__c"]
  CONCEPT --> REL["Wisdom_Relation__c"]
  CONCEPT --> JOIN["Wisdom_Insight_Concept__c"]
  JOIN --> INSIGHT["Wisdom_Insight__c"]
  INSIGHT --> HUMAN{"Review dan Safety_Status?"}
  HUMAN -- "Tidak lolos" --> HOLD["Draft / NeedsEdit / Rejected"]
  HUMAN -- "Approved + Safe" --> PUBLISH["Wisdom_Insight_Publish"]
  QA["scripts/wde-knowledge-qa.mjs"] -. "uji ketepatan indeks dan kutipan" .-> EVID
  QA -. "bukan persetujuan editorial" .-> HUMAN
```

_Sumber bukti dan keputusan manusia tetap dipisahkan dari generasi AI._

## 12 · Audience Intelligence terisolasi dari khotbah

```mermaid
flowchart LR
  COMMENT["Komentar YouTube nyata"] --> FETCH["WDE_Fetch_YouTube_Comments"]
  FETCH --> CLASS["Klasifikasi dengan bukti"]
  CLASS --> SIG["WDE_Audience_Signal__c"]
  SIG --> NEED["WDE_Audience_Need__c"]
  NEED --> TREND["WDE_Audience_Trend__c"]
  TREND --> HIVE["HIVE scoring"]
  SOURCE["Audio, transcript, segment, Gemini video"] -. "TIDAK boleh mengisi sinyal" .-> SIG
  SOURCE -. "TIDAK mengubah skor" .-> HIVE
```

_Peringkat kebutuhan audiens berasal dari komentar; topik khotbah bisa berbeda._

## 13 · HIVE berbasis bukti

```mermaid
flowchart TB
  SIG["Signal terverifikasi dan terdeduplikasi"] --> V["Volume 30%"]
  SIG --> I["Intensity 25%"]
  SIG --> G["Growth 20%"]
  SIG --> R["Recency 15%"]
  SIG --> Q["Quality 10%"]
  V --> CHECK{"5 komponen valid 0–100 dan evidence cukup?"}
  I --> CHECK
  G --> CHECK
  R --> CHECK
  Q --> CHECK
  CHECK -- "Ya" --> SCORE["HIVE = 0.30 V + 0.25 I + 0.20 G + 0.15 R + 0.10 Q"]
  CHECK -- "Tidak" --> INCOMP["Incomplete / Insufficient Data"]
  SCORE --> READY["WDE_Recalculate_HIVE → Ready"]
```

_Nilai tanpa bukti tidak diam-diam ditafsirkan sebagai skor rendah._

## 14 · Content plan dan gerbang publikasi

```mermaid
flowchart TD
  NEED["Audience Need: Ready"] --> SCORE{"HIVE >= 60?"}
  SCORE -- "Tidak" --> DENY["Jangan buat plan"]
  SCORE -- "Ya" --> UNIQUE{"Plan_Key mingguan sudah ada?"}
  UNIQUE -- "Ya" --> EXIST["Gunakan plan yang ada"]
  UNIQUE -- "Tidak" --> FLOW["WDE_Propose_Content_Plan"]
  FLOW --> PLAN[("WDE_Content_Plan__c: Proposed")]
  PLAN --> EDIT["Review manusia: topik, hook, skrip, bukti"]
  EDIT --> RIGHTS{"Review, rights, aset siap?"}
  RIGHTS -- "Belum" --> HOLD["Tahan publikasi"]
  RIGHTS -- "Ya" --> APPROVED["Layak untuk langkah penerbitan terpisah"]
```

_Flow perencanaan tidak membuat video atau memublikasikan konten secara otomatis._

## 15 · Model data operasional

```mermaid
erDiagram
  SERMON_SOURCE ||--o{ TRANSCRIPT_JOB : memicu
  SERMON_SOURCE ||--o{ WDE_BATCH_RUN : diproses
  SERMON_SOURCE ||--o{ SERMON_SEGMENT : sumber
  WDE_BATCH_RUN ||--o{ SERMON_SEGMENT : menghasilkan
  SERMON_SEGMENT ||--o{ WDE_AUDIO_QA_CLAIM : klaim
  WDE_BATCH_RUN ||--o{ WDE_QA_RELEASE : audit
  SERMON_SOURCE ||--o{ WISDOM_CONCEPT : konteks
  SERMON_SEGMENT ||--o{ WISDOM_CONCEPT_EVIDENCE : dasar
  WISDOM_CONCEPT ||--o{ WISDOM_CONCEPT_EVIDENCE : ditopang
  WISDOM_CONCEPT ||--o{ WISDOM_INSIGHT_CONCEPT : dipetakan
  WISDOM_INSIGHT ||--o{ WISDOM_INSIGHT_CONCEPT : dipetakan
  WISDOM_CONCEPT ||--o{ WISDOM_RELATION : relasi
```

_Nama entitas disederhanakan dari API `__c`; relasi menunjukkan keterkaitan konseptual, bukan seluruh lookup fisik yang diverifikasi._

## 16 · Model data audiens dan perencanaan

```mermaid
erDiagram
  WDE_AUDIENCE_NEED ||--o{ WDE_AUDIENCE_SIGNAL : memiliki
  WDE_AUDIENCE_NEED ||--o{ WDE_AUDIENCE_TREND : dirangkum
  WDE_AUDIENCE_NEED ||--o{ WDE_CONTENT_PLAN : direncanakan
  SERMON_SOURCE ||--o{ WDE_AUDIENCE_SIGNAL : asal_komentar
  WDE_AUDIENCE_SIGNAL {
    string Signal_Key
    number Signal_Count
    date Signal_Date
  }
  WDE_AUDIENCE_NEED {
    string Need_Key
    number HIVE_Score
    string HIVE_Evaluation_Status
  }
  WDE_CONTENT_PLAN {
    string Plan_Key
    string Status
    date Planning_Period
  }
```

_External key dipakai untuk deduplikasi dan pelacakan sumber._

## 17 · Integrasi dan perimeter kredensial

```mermaid
flowchart TB
  subgraph V["Penyedia / input"]
    Y["YouTube API"]
    SU["Supadata"]
    GR["Groq"]
    GE["Gemini"]
  end
  subgraph N["Metadata Salesforce"]
    YN["WDEYouTubePlaylist / WDEYouTubePublic"]
    SN["WDE_Supadata_API + External Service"]
    GN["WDE_Groq_API + WDEGroqService"]
    MN["GeminiNmCred + WDEGeminiVideo / Interactions"]
  end
  subgraph C["Kontrol"]
    EXT["External Credential + principal"]
    PS["PermissionSet minimal"]
    SRC["Jangan commit secret literal"]
  end
  Y --> YN
  SU --> SN
  GR --> GN
  GE --> MN
  EXT --> SN
  EXT --> GN
  EXT --> MN
  PS --> EXT
  SRC --> EXT
  YN --> SALES[("Salesforce Flow")]
  SN --> SALES
  GN --> SALES
  MN --> SALES
```

_Secret disimpan di konfigurasi aman; pergantian key historis membutuhkan tindakan tersendiri._

## 18 · Satu Issue Chat, tiga jalur Salesforce

```mermaid
flowchart TD
  CHAT["ChatGPT → satu Issue bfipbf/WDE"] --> ROUTE{"Jenis operasi"}
  ROUTE -- "REST / SOQL / Tooling / readback" --> REQ["### Sf Request"]
  ROUTE -- "CLI benar-benar diperlukan" --> BASH["### Sf Bash"]
  ROUTE -- "Metadata validate / deploy" --> DEP["### Sf Deploy"]
  REQ --> API["Salesforce API"]
  BASH --> CLI["Salesforce CLI hdbsf"]
  DEP --> PIN["Commit SHA 40 karakter + manifest eksplisit"]
  PIN --> VERIFY["Preflight org dan candidate"]
  VERIFY --> METADATA["Validate checkOnly atau deploy terotorisasi"]
  API --> AUDIT["Actions evidence"]
  CLI --> AUDIT
  METADATA --> AUDIT
  AUDIT --> MIRROR["Issue audit di Syntetic-Wisdom"]
```

_Mengedit body Issue saat payload deploy aktif dapat memicu ulang Actions; komentar audit tidak boleh dipakai sebagai perintah eksekusi._

## 19 · Jejak audit dari permintaan sampai bukti

```mermaid
sequenceDiagram
  autonumber
  actor C as Operator / ChatGPT
  participant G as bfipbf/WDE Issue
  participant A as GitHub Actions
  participant S as Salesforce hdbsf
  participant M as PRIVATE_REPO mirror
  C->>G: Satu heading dan satu payload
  G->>A: issues.opened / edited
  A->>A: Validasi actor, body, SHA, org
  alt Permintaan Salesforce valid
    A->>S: API atau CLI terarah
    S-->>A: Status dan ID operasi
    A->>M: Komentar evidence tersanitasi
  else Gagal preflight
    A->>M: Error dan alasan yang aman
  end
  C->>M: Audit hasil dan run ID
  C->>G: Readback baru bila dibutuhkan
```

_`Actions success` saja bukan bukti Salesforce berhasil; baca hasil operasi dan readback._

## 20 · Source, pengujian, dan deployment

```mermaid
flowchart LR
  DEV["Perubahan source / branch"] --> XML["Flow, objects, credentials, permission sets"]
  DEV --> SCRIPT["scripts dan modul .github/mjs"]
  DEV --> TESTS["tests/*.test.mjs"]
  XML --> MAN["manifest/*.xml"]
  SCRIPT --> UNIT["gw-unit-test / salesforce-rca-ci"]
  TESTS --> UNIT
  UNIT --> REVIEW{"Review dan approval?"}
  REVIEW -- "Belum" --> HOLD["Tahan merge / deploy"]
  REVIEW -- "Ya" --> MERGE["Merge source ke main"]
  MERGE -. "tidak otomatis deploy" .-> SFDEP["Sf Deploy dengan SHA dan manifest"]
  MAN --> SFDEP
  SFDEP --> READBACK["Verifikasi Org + audit"]
```

_Merge dokumentasi atau metadata di GitHub tidak mengubah status Salesforce secara otomatis._

## 21 · Evolusi pekerjaan dan PR penting

```mermaid
flowchart LR
  POC["PoC Issues #1–#8: mock dan RCA"] --> API["REST/Tooling, Metadata read"]
  API --> WF["Gateway Sf Request / Bash / Deploy"]
  WF --> HIV["PR #36: HIVE dan content planning"]
  HIV --> SEG["PR #52: segmentasi dan QA bersyarat"]
  SEG --> DRAFT["PR #62: ditutup tanpa merge"]
  DRAFT --> F70["PR #70: fondasi QA Draft, merged"]
  F70 --> F68["PR #68: snapshot 18 metadata Org, merged"]
  F68 --> SYNC["PR #73 / #74: sinkronisasi penutupan Issue, merged"]
  classDef merged fill:#e4f7e8,stroke:#238043,color:#153c1f;
  classDef closed fill:#f7e4e4,stroke:#b42318,color:#411;
  class HIV,SEG,F70,F68,SYNC merged;
  class DRAFT closed;
```

_Snapshot ini mencerminkan pemeriksaan GitHub 25 November 2026, bukan penegasan semua runtime sudah accepted._

## 22 · Status bukti dan risiko yang harus dipisah

```mermaid
flowchart TB
  S["Source tersimpan di main"] --> Q{"Apa yang sudah dibuktikan?"}
  Q --> A["CI dan XML valid"]
  Q --> B["Metadata validate checkOnly"]
  Q --> C["Metadata ter-deploy"]
  Q --> D["Flow aktif di Org"]
  Q --> E["Runtime dan kualitas hasil teruji"]
  A -. "bukan bukti" .-> C
  B -. "bukan bukti" .-> C
  C -. "bukan bukti" .-> D
  D -. "bukan bukti" .-> E
  E --> PASS["PASS hanya dengan bukti kualitas sesuai scope"]
  G["QA foreground PR #70"] --> STATUS["Source merged; Draft, activation / exactly-once UNVERIFIED"]
  H["Snapshot PR #68"] --> STAT2["18 metadata dari Org; full parity UNVERIFIED"]
  classDef warn fill:#fff1e8,stroke:#b8651b,color:#44210d;
  class STATUS,STAT2 warn;
```

_Pemisahan status mencegah klaim keliru tentang aktivasi, QA, dan kesetaraan Org–Git._

## 23 · Peta komponen repository

```mermaid
flowchart TB
  REPO["Syntetic-Wisdom / main"] --> FORCE["force-app/main/default"]
  REPO --> ACTIONS[".github/workflows"]
  REPO --> MOD[".github/mjs"]
  REPO --> MAN["manifest"]
  REPO --> SCRIPT["scripts"]
  REPO --> TEST["tests"]
  REPO --> DOC["docs"]
  REPO --> SAMPLE["ai-source"]
  FORCE --> FLOW["57 Flow XML"]
  FORCE --> OBJ["15 definisi CustomObject XML + field Sermon_Segment"]
  FORCE --> CONNECT["NamedCredential, ExternalCredential, ExternalService"]
  FORCE --> PERM["PermissionSet"]
  ACTIONS --> SF["sf.yaml"]
  ACTIONS --> JIM["jim.yaml"]
  ACTIONS --> CI["gw-unit-test.yaml, salesforce-rca-ci.yml"]
  ACTIONS --> CLOSE["close.yaml"]
  MAN --> PACK["Manifest scoped untuk tiap release"]
```

_Jumlah file adalah inventaris source pada main, bukan jumlah versi atau komponen aktif dalam Org._

## 24 · Keamanan dan pemulihan

```mermaid
flowchart TD
  START["Operasi memiliki efek samping?"] --> CHANGE{"Source-only atau Salesforce mutation?"}
  CHANGE -- "Source-only" --> CHECK["Review PR, tests, tidak ada credential"]
  CHANGE -- "Salesforce mutation" --> AUTH["Persetujuan eksplisit + org hdbsf"]
  AUTH --> PRE["Readback keadaan awal"]
  PRE --> SCOPE["Manifest/record scope terukur"]
  SCOPE --> EXEC["Gateway trusted dengan run ID"]
  EXEC --> OUT{"Hasil pasti?"}
  OUT -- "Ya" --> POST["Readback dan audit"]
  OUT -- "Tidak / timeout" --> HALT["STOP, investigasi efek sebelumnya"]
  HALT -. "tanpa blind retry" .-> PRE
  CHECK --> MERGE["Commit atau merge source"]
```

_Dilarang menganggap kegagalan jaringan berarti mutasi pasti tidak terjadi._

## 25 · Inventaris Flow: sumber dan pengetahuan

```mermaid
flowchart LR
  ROOT["Inventaris Flow: sumber dan pengetahuan"]
  F0["Panggil_Gemini"]
  F1["Sermon_Source_Create_Transcript_Job"]
  F2["Tgr_Sample"]
  F3["WDE_Discover_Weekly_Sermon"]
  F4["WDE_Orchestrator_Weekly_Sermon"]
  F5["WDE_Persist_Raw_Transcript"]
  F6["WDE_Supadata_Callout_Test"]
  F7["WDE_Analyze_YouTube_Gemini"]
  F8["WDE_Fetch_YouTube_Comments"]
  F9["WDE_Generate_Wisdom_POC"]
  F10["Wisdom_Concept_Review"]
  F11["Wisdom_Insight_Review"]
  F12["Wisdom_Insight_Publish"]
  ROOT --- F0
  ROOT --- F1
  ROOT --- F2
  ROOT --- F3
  ROOT --- F4
  ROOT --- F5
  ROOT --- F6
  ROOT --- F7
  ROOT --- F8
  ROOT --- F9
  ROOT --- F10
  ROOT --- F11
  ROOT --- F12
```

_Indeks source; tidak menyiratkan seluruh Flow aktif atau dipanggil oleh jalur produksi._

## 26 · Inventaris Flow: orchestrator dan batch

```mermaid
flowchart LR
  ROOT["Inventaris Flow: orchestrator dan batch"]
  F0["Tgr_WDE_Auto_Advance_Batch"]
  F1["Tgr_WDE_Create_Next_Batch"]
  F2["Tgr_WDE_Retry_Stage_A"]
  F3["Tgr_WDE_Run_Stage_A"]
  F4["Tgr_WDE_Run_Stage_B"]
  F5["Tgr_WDE_Run_Stage_C"]
  F6["Tgr_WDE_Start_Segmentation_After_Transcript"]
  F7["WDE_Auto_Advance_Batch"]
  F8["WDE_Enrich_Approved_Boundaries"]
  F9["WDE_Orchestrate_Stage_A"]
  F10["WDE_Orchestrate_Stage_B"]
  F11["WDE_Orchestrate_Stage_C"]
  F12["WDE_Persist_Reviewed_Segments"]
  F13["WDE_Recover_Groq_Format_Batch_53"]
  F14["WDE_Recover_Partial_Segmentation"]
  F15["WDE_Recover_Verified_Stage_C"]
  F16["WDE_Semantic_Review_Batch"]
  F17["WDE_Semantic_Review_Batch_v2"]
  F18["WDE_Semantic_Segmentation_Batch"]
  F19["WDE_Semantic_Segmentation_POC"]
  ROOT --- F0
  ROOT --- F1
  ROOT --- F2
  ROOT --- F3
  ROOT --- F4
  ROOT --- F5
  ROOT --- F6
  ROOT --- F7
  ROOT --- F8
  ROOT --- F9
  ROOT --- F10
  ROOT --- F11
  ROOT --- F12
  ROOT --- F13
  ROOT --- F14
  ROOT --- F15
  ROOT --- F16
  ROOT --- F17
  ROOT --- F18
  ROOT --- F19
```

_Indeks source; tidak menyiratkan seluruh Flow aktif atau dipanggil oleh jalur produksi._

## 27 · Inventaris Flow: audio dan quality gate

```mermaid
flowchart LR
  ROOT["Inventaris Flow: audio dan quality gate"]
  F0["Tgr_WDE_Audio_QA_Foreground_Claim"]
  F1["Tgr_WDE_Auto_Finalize_Summary"]
  F2["Tgr_WDE_Auto_Segment_Audio_QA"]
  F3["Tgr_WDE_Reset_Segment_Audio_QA"]
  F4["WDE_Audio_QA_Decide_Retry"]
  F5["WDE_Daily_Segment_Audio_QA_Recovery"]
  F6["WDE_Delete_Segment_Audio_Async_QA"]
  F7["WDE_Finalize_Segment_Summary"]
  F8["WDE_Get_Editorial_Audio_Context"]
  F9["WDE_Get_Segment_Audio_Async_QA"]
  F10["WDE_QA_OAuth_Commit_Release"]
  F11["WDE_Reserve_Foreground_Audio_QA"]
  F12["WDE_Run_Foreground_Audio_QA"]
  F13["WDE_Start_Segment_Audio_Async_QA"]
  F14["WDE_Verify_Isolated_Test5_Segment"]
  F15["WDE_Verify_Sermon_Segment_Audio"]
  F16["WDE_Verify_YouTube_Gemini_Audio"]
  ROOT --- F0
  ROOT --- F1
  ROOT --- F2
  ROOT --- F3
  ROOT --- F4
  ROOT --- F5
  ROOT --- F6
  ROOT --- F7
  ROOT --- F8
  ROOT --- F9
  ROOT --- F10
  ROOT --- F11
  ROOT --- F12
  ROOT --- F13
  ROOT --- F14
  ROOT --- F15
  ROOT --- F16
```

_Indeks source; tidak menyiratkan seluruh Flow aktif atau dipanggil oleh jalur produksi._

## 28 · Inventaris Flow: audiens dan eksperimen

```mermaid
flowchart LR
  ROOT["Inventaris Flow: audiens dan eksperimen"]
  F0["WDE_Daily_HIVE_Planning"]
  F1["WDE_Propose_Content_Plan"]
  F2["WDE_Recalculate_HIVE"]
  F3["WDE_Test_Audience_Context_AB"]
  F4["WDE_Test_Audio_QA_Recovery"]
  F5["WDE_Test_Gemini_Async_Text"]
  F6["WDE_Test_Gemini_Auth"]
  ROOT --- F0
  ROOT --- F1
  ROOT --- F2
  ROOT --- F3
  ROOT --- F4
  ROOT --- F5
  ROOT --- F6
```

_Indeks source; tidak menyiratkan seluruh Flow aktif atau dipanggil oleh jalur produksi._

## Bukti utama

[Gateway Chat #21](https://github.com/bfipbf/WDE/issues/21) · [PR #52](https://github.com/jimmytobing/Syntetic-Wisdom/pull/52) · [PR #70](https://github.com/jimmytobing/Syntetic-Wisdom/pull/70) · [PR #68](https://github.com/jimmytobing/Syntetic-Wisdom/pull/68) · [PR #73](https://github.com/jimmytobing/Syntetic-Wisdom/pull/73) · [PR #74](https://github.com/jimmytobing/Syntetic-Wisdom/pull/74) · [Audit metadata](docs/wde-org-git-reconciliation-2026-11-22.md) · [Desain QA Draft](docs/wde-audio-qa-flow-only-70.md) · [HIVE](docs/wde-hive-content-planning.md) · [Gateway deploy](docs/sf-deploy.md).

**Batas bukti:** Full Org–Git equivalence, aktivasi QA foreground, dan keakuratan seluruh segmen audio tetap **UNVERIFIED** kecuali ada bukti tersendiri. Tidak ada deployment atau perubahan Salesforce saat dokumen ini ditulis.
