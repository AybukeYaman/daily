/** All user-facing text in one place (Turkish). Swap this module to localize. */
export const copy = {
  writePrompt: 'Bugün aklında ne var?',
  emptyJournal: 'Henüz bir şey yazmadın. İlk satır her zaman en zorudur.',
  titlePlaceholder: 'Başlık',
  bodyPlaceholder: 'Yazmaya başla…',
  untitled: 'Başlıksız',
  back: 'Geri',
  settings: 'Ayarlar',
  delete: 'Sil',
  deleteConfirmTitle: 'Bu yazı silinsin mi?',
  deleteConfirmBody: 'Silinen yazılar sunucuda saklanır ve geri getirilebilir.',
  cancel: 'Vazgeç',
  conflictCopy: 'Bu, iki cihazda aynı anda düzenlenen bir yazının korunmuş kopyası. Hiçbir şey kaybolmadı.',
  save: { idle: '', saving: 'Kaydediliyor…', saved: 'Kaydedildi', error: 'Kaydedilemedi — tekrar denenecek' },
  sync: {
    'local-only': 'Sadece bu cihazda',
    syncing: 'Eşzamanlanıyor…',
    synced: 'Eşzamanlandı',
    waiting: 'Gönderilmeyi bekliyor',
    offline: 'Çevrimdışı — değişiklikler bu cihazda güvende',
    failed: 'Bazı değişiklikler gönderilemedi',
  },
  account: {
    section: 'Hesap',
    explain: 'Hesap olmadan da yazabilirsin. Hesap yalnızca yedek ve cihazlar arası eşzamanlama içindir.',
    email: 'E-posta',
    password: 'Parola (en az 10 karakter)',
    signIn: 'Giriş yap',
    signUp: 'Hesap oluştur',
    signOut: 'Çıkış yap',
    signedIn: 'Giriş yapıldı',
  },
  syncSection: 'Eşzamanlama',
  syncNow: 'Şimdi eşzamanla',
  retryFailed: 'Tekrar dene',
  pending: (n: number) => `${n} değişiklik bekliyor`,
  lastSynced: (iso: string) => `Son eşzamanlama: ${new Date(iso).toLocaleString('tr-TR')}`,
  words: (n: number) => `${n} kelime`,
} as const;

export const formatDay = (isoDate: string): string =>
  new Date(`${isoDate}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
