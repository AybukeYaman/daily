# Daily — Yol Haritası

Her faz açıkça açılır ve kapanır. Bir faz, "Definition of Done" sağlanmadan (çalışan iş mantığı, kalıcılık, test, hata durumu) kapanmaz. Yeni faza geçmeden önce bulgular gözden geçirilir.

## Ürün ilkesi: minimal, pratik, keyifli

- Uygulama açılınca **doğrudan yazma**. Hesap zorunlu değil: hesapsız, tamamen offline çalışır. Senkron, Ayarlar'dan giriş yapınca açılır.
- Ekranda yazı baskın. Tek vurgu rengi, bol boşluk, kart yığını yok.
- Her özellik gerçek değer kanıtlamadan eklenmez. Aşağıdaki "Ertelendi" listesi bilinçli bir kapsam kararıdır.

## Fazlar

| Faz | Kapsam | Durum |
|---|---|---|
| 0 | Mimari, ADR'ler, API + senkron sözleşmesi, şema | ✅ Kapandı |
| 1 | Monorepo, NestJS API (auth, yetki, hata, log), Prisma şeması, Expo temeli, tasarım sistemi, ilk testler | 🟡 Kod + testler tamam. Açık: ilk migration'ı senin makinede `prisma migrate dev --name init` ile üretmek (bulut ortamı Prisma engine'ini indiremedi) ve gerçek Postgres'e karşı repository entegrasyon testi |
| 2 | Local-first kalıcılık: SQLite, outbox, autosave, senkron motoru, çakışma koruması, sürüm geçmişi (server) | 🟡 Çekirdek + 9 cihaz⇄sunucu senaryosu yeşil. Açık: gerçek iOS/Android cihazda arka plana alma / öldürme testi |
| 3 | Günlük: zengin metin editörü, arşiv/favori, çöp kutusu + geri alma, arama (Postgres FTS), takvim, sürüm geçmişi UI | ⏳ |
| 4 | El yazısı motoru — önce prototip + ölçüm, sonra entegrasyon | ⏳ |
| 5 | Fotoğraf/video: S3 uyumlu depolama, multipart/resumable upload, küçük resim | ⏳ |
| 6 | Native widget'lar (WidgetKit / Android App Widgets) | ⏳ |
| 7 | Ruh hali, anılar, yazma soruları, hatırlatıcılar, uygulama kilidi, dışa/içe aktarma | ⏳ |
| 8 | QA: regresyon, güvenlik, performans, erişilebilirlik, yedek geri yükleme testi | ⏳ |
| 9 | Üretim: Docker, deployment, PITR yedekleri, izleme, release checklist | ⏳ |

## Faz 4 — El yazısı motoru planı (algoritmalar)

Hedef: 120 Hz'de 8.3 ms, 60 Hz'de 16.7 ms bütçe. İddia değil, ölçüm.

- **Çizim yolu React render döngüsünden ayrı**: `react-native-skia` + Reanimated/Gesture Handler worklet'leri UI thread'de; aktif çizgi `SharedValue` üzerinden Skia `Path`'e yazılır, React state'e dokunmaz.
- **İki katman**: (1) aktif çizgi her frame artımlı uzatılır, (2) bitmiş çizgiler `SkPicture` olarak önbelleğe alınır → frame başına O(aktif nokta), O(toplam çizgi) değil.
- **Yumuşatma**: ardışık noktaların orta noktaları arasında quadratic Bézier (boşluksuz, ek gecikmesiz). Basınç → değişken genişlikli kontur.
- **Kayıtta sadeleştirme**: Ramer–Douglas–Peucker (ε ≈ 0.3 px) — görsel fark yok, nokta sayısı tipik olarak %60–80 azalır.
- **Serileştirme**: koordinatlar 1/10 px'e kuantize, delta + zigzag varint kodlama; basınç/eğim 8 bit. Ham JSON'a göre ~10× küçük. Çizgi bazında artımlı kalıcılık (sadece yeni çizgiler yazılır).
- **Silgi**: uniform grid uzamsal indeks → isabet testi O(k), tüm çizgileri taramak yok.
- **Undo/redo**: çizgi id'leri üzerinden komut yığını — çizgi verisi kopyalanmaz.
- **Palm rejection**: Apple Pencil aktifken `touchType` filtresi; Android'de `TOOL_TYPE_STYLUS`. Gerekirse native modül.
- Prototip gerçek iPad + Android tablette input-to-render gecikmesi ölçülmeden üretime çıkmaz.

## Ertelendi (bilinçli — minimalizm)

Promptta var, ama çekirdek yazma deneyimini kanıtlamadan eklenmeyecek:

- Alışkanlıklar ve hedefler, istatistik ekranı, günlük alıntı widget'ı
- AI modülü (sadece mimari olarak yeri hazır; açık rıza olmadan içerik dışarı çıkmaz)
- 8 widget yerine ilk sürümde 3: **Hızlı Yaz**, **Bugünün Ruh Hali**, **Günün Sorusu**
- Web: Expo web hedefi çalışır kalır, ama öncelik iOS + Android

## Sıradaki adım (Faz 3 açılışı)

Editör kararı: TipTap/ProseMirror tabanlı (DOM component) vs. native `TextInput` + blok modeli. İkisi de gerçek cihazda yazma gecikmesiyle karşılaştırılacak; karar ADR olarak kaydedilecek.
