# External Client App metadata staging

Direktori ini berisi template non-deployable untuk `Salesforce_AI_RCA`.
Token berikut wajib diganti hanya setelah dikonfirmasi:

- `__CONFIRMED_CONTACT_EMAIL__`
- `__DEDICATED_RUN_AS_USERNAME__`
- `__RCA_PERMISSION_SET_ID__`

Template sengaja tidak diletakkan di `force-app/main/default`, sehingga Salesforce
CLI tidak dapat mendeploynya secara tidak sengaja. Setelah user dan contact email
disetujui, salin hasil final ke folder metadata resminya dan lakukan check-only.

`ExtlClntAppGlobalOauthSettings` tidak disimpan di repository karena metadata
tersebut dapat memuat consumer key/secret dan dokumentasi Salesforce menyatakan
informasi sensitif itu tidak boleh dimasukkan ke source control. File tersebut
harus dibuat pada tahap deployment terkontrol tanpa pernah menyimpan credential.

Client Credentials Flow memerlukan dua toggle: `isClientCredentialsFlowEnabled`
pada Global OAuth Settings dan pada OAuth Configurable Policies. Template policy
di direktori ini menyiapkan toggle kedua. Toggle global dibuat sebagai file
temporer di luar repository atau melalui Setup UI setelah approval deployment,
kemudian credential langsung dipindahkan ke GitHub Actions Secrets.

Urutan deployment yang direncanakan:

1. Konfirmasi contact email dan buat dedicated Salesforce Integration user.
2. Render template dengan username dan Permission Set ID yang nyata.
3. Jalankan check-only terhadap header, OAuth settings, dan policies.
4. Setelah approval berikutnya, deploy ECA ke Developer Org.
5. Aktifkan Global OAuth Client Credentials secara terkontrol tanpa menyimpan
   consumer key atau secret di repository.
6. Retrieve metadata hasil platform untuk memastikan `oauthLink` dan nama policy
   yang dihasilkan, lalu review sebelum perubahan lanjutan.

Untuk GitHub Free private repository, credential live nantinya disimpan sebagai
Repository Secrets, bukan Environment Secrets. LIVE hanya boleh dijalankan manual
oleh `jimmytobing` dari `refs/heads/main` ketika `RCA_MODE=live`; Issue tetap mock.
