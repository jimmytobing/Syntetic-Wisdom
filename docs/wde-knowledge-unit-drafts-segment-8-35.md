# Draft knowledge units — Teaching segment 8, source _tYB8TLFizQ

**NOT APPROVED / NOT PUBLISHABLE.** These are editorial hypotheses derived from the previously retrieved `Sermon_Segment__c.Transcript_Text__c` for indices 605–1217 (record #8; 20,138 characters). This aggregated text does **not** prove individual caption boundaries, so exact `evidence[index]` is intentionally **absent**. Each draft must be re-anchored to `Sermon_Source__c.Raw_Transcript_Text__c` and checked against audio before submission to the automated QA gate. Rights_Status was previously `Unknown`; source licensing/permissions require independent verification. No video may be published from this file.

## KU-08-A — Saat cicilan menekan, jangan menyamakan keadaan dengan nilai diri

- **Segment:** 605–1217; exact subrange PENDING
- **Claim (draft):** Tekanan pekerjaan dan cicilan bisa memengaruhi emosi, tetapi respons batin tetap perlu dipilih secara sadar.
- **Source marker (aggregate only):** Pembicara memberi contoh kesulitan membayar cicilan lalu membedakan persoalan di sekitar hidup dari sikap hati.
- **Audience need:** Orang yang cemas menghadapi kewajiban keuangan dan tekanan hidup.
- **Action:** Catat kewajiban yang mendesak, cari bantuan sesuai kondisi nyata, kemudian ambil satu langkah yang dapat dilakukan hari ini.
- **Verification needed:** Jangan mengubah pengajaran rohani menjadi janji finansial. Aplikasi pencatatan kewajiban adalah adaptasi editorial, **bukan** instruksi yang diklaim diucapkan narator.
- **Draft original narration (~45s, verify actual voice timing):**

  > Saat tagihan datang bersamaan dan pekerjaan terasa tidak pasti, tekanan bisa memenuhi pikiran. Situasi itu nyata, dan kita tidak perlu berpura-pura semuanya mudah. Tetapi kita masih punya ruang untuk memilih bagaimana meresponsnya. Daripada membuat keputusan ketika panik, sebutkan dulu persoalan yang paling mendesak. Pisahkan fakta dari ketakutan tentang apa yang mungkin terjadi. Bila perlu, bicarakan dengan orang tepercaya atau pihak yang bisa membantu. Iman bukan alasan untuk mengabaikan tanggung jawab. Hari ini, lakukan satu langkah kecil yang jelas, sambil tetap menjaga sikap hati di tengah keadaan yang belum berubah.

- **Status:** REVISE — caption citations missing; application extrapolation must be labeled; source and human review pending.

## KU-08-B — Menjaga sikap hati sebelum mengambil keputusan dalam krisis

- **Segment:** 605–1217; exact subrange PENDING
- **Claim (draft):** Ketika tekanan meningkat, berhenti sejenak dan menata sudut pandang lebih bijaksana daripada membuat keputusan tergesa-gesa.
- **Source marker (aggregate only):** Dalam penjelasan tentang posisi batin dan doa, pembicara memperingatkan agar tidak mengambil keputusan keliru karena tekanan.
- **Audience need:** Audiens yang sulit menenangkan diri ketika ada ketidakadilan dan persoalan bertubi-tubi.
- **Action:** Sebelum mengambil keputusan yang sulit dibalik, tulis apa yang diketahui, apa yang belum diketahui, dan siapa yang patut dimintai masukan.
- **Verification needed:** Kaitan antara latihan menulis dan teks sumber merupakan *aplikasi original*, bukan kutipan.
- **Draft original narration (~45s, verify actual voice timing):**

  > Ada saatnya keadaan membuat kita ingin langsung bereaksi. Ketika banyak hal terasa tidak adil, keputusan cepat terlihat seperti jalan keluar. Namun tidak semua reaksi terburu-buru membawa kita ke arah yang benar. Menjaga sikap hati bukan berarti menolak kenyataan. Kita dapat mengakui masalah sambil memilih untuk tidak dikendalikan kepanikan. Sebelum membuat keputusan besar, tanyakan: apa yang benar-benar saya ketahui, apa yang masih saya duga, dan kepada siapa saya perlu meminta nasihat? Berdoalah dengan jujur jika itu bagian dari keyakinanmu. Kemudian lakukan langkah yang bertanggung jawab, bukan sekadar langkah yang terasa paling cepat.

- **Status:** REVISE — citation and audio check outstanding; not cleared for publishing.

## Final editorial checklist

- [ ] Retrieve authenticated WDE source field `Raw_Transcript_Text__c` in a bounded, privacy-safe manner; parse as indexed caption entries.
- [ ] Replace aggregate source markers above with exact quote + caption index from **within** source 605–1217.
- [ ] Verify unique topic boundary for each KU, speaker attribution and theological nuance using source audio.
- [ ] Run the two QA test suites and the real candidate JSON through `wde-knowledge-qa.mjs` (expected to fail until citation and human approval fields exist).
- [ ] Manually time narration at target pacing; check video rights and original asset clearance.
- [ ] Only after review mark eligible; never auto-publish or alter existing 12 NeedsReview segments.

**Deployment:** None. Source Flow remains unchanged by this editorial document.
