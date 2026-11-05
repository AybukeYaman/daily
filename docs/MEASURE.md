# Faz 4a — El yazısı ölçüm rehberi (Galaxy S26, parmak)

Amaç: çizim motorunun gerçek cihazda bütçeye sığdığını **ölçerek** göstermek. Hedef cihaz 120 Hz → kare bütçesi **8.3 ms**.

## 0. Release build kur (ölçüm debug'da yapılmaz)

Debug build'de JS yavaştır ve sonuçlar yanıltır.

```bash
# Telefonda: Ayarlar → Telefon hakkında → Yazılım bilgisi → "Yapım numarası"na 7 kez dokun → Geliştirici seçenekleri → USB hata ayıklama: açık
npm install && npm run build:shared
cd apps/mobile
npx expo run:android --variant release
```

Ölçümden önce: Ayarlar → Ekran → **Hareket akıcılığı: Uyarlanabilir/Yüksek** (120 Hz), pil tasarrufu kapalı, telefon şarjda değil (termal kısma olmasın).

Uygulamada: **Ayarlar → Kalem laboratuvarı (deneysel)**.

## 1. Yazılım gecikmesi (laboratuvar ekranı)

1. "Ölçümü sıfırla"ya bas.
2. 30 saniye normal yazı yaz (el yazısı gibi, hızlı ve yavaş karışık).
3. Panelden oku:

| Metrik | Ne demek | Hedef |
|---|---|---|
| Olay → kare p50 / p95 | Dokunma örneğinin UI thread'e gelmesinden bir sonraki karenin başlamasına kadar geçen süre | p95 ≤ **8.3 ms** |
| Ekran Hz | Ölçülen gerçek yenileme hızı | 120 |
| Takılan kare | Bütçenin 1.5 katını aşan kareler (göze görünen takılma) | ≤ **%1** |

Bu sayı dokunmatik panelin ve ekranın kendi gecikmesini **içermez**; o kısım için 3. adım var.

## 2. Dayanıklılık

| Adım | Ne yap | Hedef |
|---|---|---|
| Stres 1.000 / 5.000 | Bas, sonra üstüne yazmaya devam et; 1. adımdaki sayılar bozulmamalı | p95 ≤ 8.3 ms, takılan kare ≤ %1 |
| "Resmi baştan kaydet" süresi | 5.000 çizgide tek seferlik maliyet (geri al / silgi sonrası) | ≤ 50 ms |
| Silgi | 5.000 çizgi üzerinde sil, sürükle | gözle takılma yok |
| Geri al / Yinele | Hızlıca 20 kez | anında |
| Kaydet/yükle | 5.000 çizgi için kodla + çöz | toplam ≤ 150 ms |
| JS heap | 5.000 çizgi sonrası | not al (taban çizgisi) |

## 3. Uçtan uca gecikme (kamera yöntemi)

Gerçek "parmak hareketi → ekranda mürekkep" süresi:

1. Başka bir telefonla **ağır çekim** (240 fps veya üstü) video çek: S26 ekranı ve parmağın birlikte kadrajda olsun.
2. Ekranda parmağını **sabit hızla düz bir çizgi** çizerek kaydır.
3. Videoyu kare kare ilerlet. Parmağın ucu ile mürekkebin ucu arasındaki mesafeyi ve parmağın hızını (piksel/kare) ölç.
4. Gecikme ≈ (parmak ile mürekkep arası mesafe ÷ parmak hızı) × (1000 / kamera fps) ms.

Referans: iyi Android uygulamalarında uçtan uca **30–50 ms** tipiktir; bunun büyük kısmı dokunmatik panel + ekran tarama süresidir, bizim kontrolümüzde olan kısım 1. adımdaki sayıdır.

## 4. Kare analizi (isteğe bağlı, daha derin)

```bash
adb shell dumpsys gfxinfo app.daily.journal reset
# 30 sn yaz
adb shell dumpsys gfxinfo app.daily.journal | head -40
```

"Janky frames" oranı ve 90/95/99. persentil kare süreleri.

## Sonuçları bana nasıl ilet

Laboratuvar panelinin ekran görüntüsü (1. adım ve 5.000 stres sonrası) + varsa kamera ölçümü yeterli. Bütçeyi aşan bir değer olursa hangi adımda olduğunu yaz; kod tarafındaki karşılığı (ör. tail segment sayısı, resim düzleştirme sıklığı) ona göre ayarlanır.

## Bu fazda ölçülemeyenler

Basınç, eğim, palm rejection ve kalemin 240 Hz örneklemesi: iPad Pro M4 + Apple Pencil'e erişim açılınca ayrı ölçülecek. Motor bu verileri şimdiden saklıyor; "Sadece kalem" anahtarı palm rejection'ın ilk sürümü.
