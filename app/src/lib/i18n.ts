// UI strings, HR + EN. Wording follows the website (build.py T[...]) so the app and the site say the same thing.
export type Lang = 'hr' | 'en';
export const LANGS: Lang[] = ['hr', 'en'];

const hr = {
  tagline: 'Istraživanje malih dionica',
  tabHome: 'Naslovnica', tabCategories: 'Rubrike', tabSubscription: 'Pretplata', tabMore: 'Više',
  latest: 'Najnovije', allCategories: 'Sve rubrike', articlesCount: (n: number) => `${n} ${n === 1 ? 'članak' : n < 5 ? 'članka' : 'članaka'}`,
  read: 'min čitanja', byline: 'Uredništvo Lupe', published: 'Objavljeno',
  paidBadge: 'Za pretplatnike', free: 'Besplatno',
  sources: 'Izvori', illustration: 'Ilustracija: Lupa',
  notAdvice: 'Lupa objavljuje nezavisna istraživanja i komentare. Ništa ovdje nije investicijski savjet ni preporuka za kupnju ili prodaju vrijednosnih papira. Lupa nije investicijsko društvo ni ovlašteni investicijski savjetnik i nije pod nadzorom HANFA-e.',
  disclaimer: 'Izjava o odgovornosti',
  marketsAsOf: 'Tržišta',
  offlineNote: 'Prikazujemo spremljeni sadržaj — nema veze s internetom.',
  snapshotNote: 'Prikazujemo sadržaj ugrađen u aplikaciju. Povucite prema dolje za osvježavanje.',
  retry: 'Pokušaj ponovno',
  // paywall (same text as the website)
  gateTitle: 'Ostatak ove analize čitaju pretplatnici',
  gateText: 'Pročitali ste uvodni dio. Cijela dubinska analiza — brojke, novac, rizici i zaključak Lupe — dostupna je uz pretplatu na Lupu. Pregledi tržišta i radar ostaju besplatni za sve.',
  gateNext: 'U nastavku',
  gateBtn: 'Pretplati se',
  gateChecking: 'Provjeravamo pretplatu…',
  gateErr: 'Sadržaj trenutačno nije moguće učitati. Pokušajte malo kasnije.',
  gateNotLive: 'Pretplata je aktivna, ali poslužitelj Lupe još ne može provjeriti kupnje iz trgovine. Cijeli tekst pojavit će se čim provjera bude uključena.',
  gateRejected: 'Trgovina nije potvrdila aktivnu pretplatu na ovom računu.',
  restore: 'Vrati kupnje',
  // subscription screen
  planName: 'Pretplata na Lupu', perMonth: 'mjesečno', cancelAny: 'otkažite bilo kada',
  planLead: 'Cijele dubinske analize tvrtki — brojke, novac, rizici i zaključak Lupe.',
  planList: ['Sve analize tvrtki u cijelosti, na hrvatskom i engleskom', 'Pregledi tržišta i radar ostaju besplatni za sve', 'Bez oglasa u analizama za pretplatnike', 'Mjesečna pretplata, otkazivanje bilo kada'],
  subscribeBtn: (price: string) => `Pretplati se — ${price} mjesečno`,
  storeNote: { ios: 'Plaćanje ide preko vašeg Apple ID-a. Podatke o kartici ne unosite u aplikaciju.', android: 'Plaćanje ide preko vašeg Google računa (Google Play). Podatke o kartici ne unosite u aplikaciju.' },
  renewFine: { ios: 'Pretplata se automatski obnavlja svaki mjesec po istoj cijeni dok je ne otkažete. Otkazati možete u postavkama Apple ID-a (Pretplate) najkasnije 24 sata prije kraja tekućeg razdoblja; pristup traje do kraja plaćenog razdoblja.', android: 'Pretplata se automatski obnavlja svaki mjesec po istoj cijeni dok je ne otkažete. Otkazati možete u Google Playu (Plaćanja i pretplate) bilo kada; pristup traje do kraja plaćenog razdoblja.' },
  privacy: 'Pravila privatnosti', terms: 'Uvjeti korištenja',
  active: 'Pretplata je aktivna', activeUntil: (d: string) => `Vrijedi do ${d}`, renews: 'Obnavlja se automatski',
  pending: 'Plaćanje čeka potvrdu trgovine. Pristup se otključava čim trgovina potvrdi kupnju.',
  manage: 'Upravljaj pretplatom ili je otkaži',
  storeUnavailable: 'Trgovina trenutačno nije dostupna. Pretplata se može kupiti u verziji aplikacije instaliranoj iz App Storea ili Google Playa.',
  productMissing: 'Proizvod pretplate još nije objavljen u trgovini. Kupnja će biti moguća nakon što ga Lupa aktivira.',
  restoreNone: 'Na ovom računu trgovine nismo pronašli aktivnu pretplatu na Lupu.',
  restoreOk: 'Pretplata je vraćena.',
  purchaseFailed: 'Kupnja nije uspjela.',
  sameAccount: 'Pretplata vrijedi na svim uređajima prijavljenima istim Apple ID-om ili Google računom — na novom uređaju dodirnite „Vrati kupnje”.',
  // more
  language: 'Jezik', about: 'O nama', contact: 'Kontakt', version: 'Verzija', settings: 'Postavke', legal: 'Pravne informacije',
  website: 'Web stranica Lupe',
  back: 'Natrag', notFound: 'Članak nije pronađen.',
};
type Strings = typeof hr;
const en: Strings = {
  tagline: 'Small-cap research',
  tabHome: 'Home', tabCategories: 'Sections', tabSubscription: 'Subscription', tabMore: 'More',
  latest: 'Latest', allCategories: 'All sections', articlesCount: (n: number) => `${n} ${n === 1 ? 'article' : 'articles'}`,
  read: 'min read', byline: 'Lupa research desk', published: 'Published',
  paidBadge: 'For subscribers', free: 'Free',
  sources: 'Sources', illustration: 'Illustration: Lupa',
  notAdvice: 'Lupa publishes independent research and commentary. Nothing here is investment advice or a recommendation to buy or sell any security. Lupa is not an investment firm or a licensed investment adviser and is not supervised by HANFA.',
  disclaimer: 'Disclaimer',
  marketsAsOf: 'Markets',
  offlineNote: 'Showing saved content — no internet connection.',
  snapshotNote: 'Showing content built into the app. Pull down to refresh.',
  retry: 'Try again',
  gateTitle: 'The rest of this analysis is for subscribers',
  gateText: 'You have read the opening. The full deep dive — the numbers, the cash, the risks and Lupa\'s take — is available with a Lupa subscription. Market wraps and the radar stay free for everyone.',
  gateNext: 'Still to come',
  gateBtn: 'Subscribe',
  gateChecking: 'Checking your subscription…',
  gateErr: 'The article could not be loaded right now. Please try again shortly.',
  gateNotLive: 'Your subscription is active, but Lupa\'s server cannot verify store purchases yet. The full text will appear as soon as verification is switched on.',
  gateRejected: 'The store did not confirm an active subscription on this account.',
  restore: 'Restore purchases',
  planName: 'Lupa subscription', perMonth: 'a month', cancelAny: 'cancel anytime',
  planLead: 'Full company deep dives — the numbers, the cash, the risks and Lupa\'s take.',
  planList: ['Every company deep dive in full, in Croatian and English', 'Market wraps and the radar stay free for everyone', 'No ads in subscriber analyses', 'Monthly plan, cancel anytime'],
  subscribeBtn: (price: string) => `Subscribe — ${price} a month`,
  storeNote: { ios: 'You pay with your Apple ID. You never enter card details in the app.', android: 'You pay with your Google account (Google Play). You never enter card details in the app.' },
  renewFine: { ios: 'The subscription renews automatically every month at the same price until you cancel. Cancel in your Apple ID settings (Subscriptions) at least 24 hours before the end of the current period; access lasts until the end of the paid period.', android: 'The subscription renews automatically every month at the same price until you cancel. Cancel any time in Google Play (Payments & subscriptions); access lasts until the end of the paid period.' },
  privacy: 'Privacy policy', terms: 'Terms of use',
  active: 'Your subscription is active', activeUntil: (d: string) => `Valid until ${d}`, renews: 'Renews automatically',
  pending: 'The payment is waiting for the store to confirm it. Access unlocks as soon as the store confirms the purchase.',
  manage: 'Manage or cancel subscription',
  storeUnavailable: 'The store is not available right now. The subscription can be bought in the app installed from the App Store or Google Play.',
  productMissing: 'The subscription product is not live in the store yet. Purchases open once Lupa activates it.',
  restoreNone: 'We found no active Lupa subscription on this store account.',
  restoreOk: 'Your subscription has been restored.',
  purchaseFailed: 'The purchase did not go through.',
  sameAccount: 'The subscription works on every device signed in with the same Apple ID or Google account — on a new device tap "Restore purchases".',
  language: 'Language', about: 'About', contact: 'Contact', version: 'Version', settings: 'Settings', legal: 'Legal',
  website: 'Lupa website',
  back: 'Back', notFound: 'Article not found.',
};
export const STRINGS: Record<Lang, Strings> = { hr, en };
export type { Strings };

export function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const HR = ['siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja', 'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca'];
  const EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return lang === 'hr' ? `${d.getDate()}. ${HR[d.getMonth()]} ${d.getFullYear()}.` : `${d.getDate()} ${EN[d.getMonth()]} ${d.getFullYear()}`;
}
