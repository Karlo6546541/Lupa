# Lupa — mobilna aplikacija (iOS + Android, jedan kod)

**Lupa · Istraživanje malih dionica / Small-cap research** — čitač Lupinih analiza za iPhone i Android, s pretplatom
od **7,00 € mjesečno** preko App Storea i Google Playa. Jedan projekt, jedan kod (Expo / React Native), dvije trgovine.

> **Stanje:** aplikacija **još nije u trgovinama**. Kod, Android APK za testiranje i upute su gotovi; za objavu i
> naplatu trebaju Karlovi računi programera (Google Play i Apple) i proizvodi pretplate u njima — vidi „Što Karlo mora napraviti”.

*(English summary at the end.)*

---

## 1. Što aplikacija radi

| Dio | Kako |
|---|---|
| Naslovnica | logo, slogan, HR/EN prekidač, traka s tečajevima (kao na webu), glavni članak, rubrike, najnoviji članci |
| Rubrike | Tržište, Male dionice, Bioinženjering, Kvantno računalstvo, Analize firmi — s brojem članaka |
| Članak | isti HTML i **isti CSS kao web** (okviri s cijenama, sparkline, tablice, „facts”, slike, izvori, izjava o odgovornosti) |
| Besplatno | pregledi tržišta i radar u cijelosti (isto kao web) |
| Za pretplatnike | analize tvrtki: uvod + prvi odjeljak, zatim kartica pretplate s popisom odjeljaka koji slijede (isto kao web) |
| Pretplata | 7 € mj., kupnja u trgovini (Apple ID / Google račun — **bez unosa kartice u aplikaciju**), „Vrati kupnje”, „Upravljaj pretplatom” |
| Jezik | hrvatski i engleski; početno prema jeziku mobitela, pamti se izbor (`lupa-lang`, isti ključ kao na webu) |
| Više | O nama, Izjava o odgovornosti (HANFA), pravila privatnosti, uvjeti, verzija |
| Bez mreže | zadnji preuzeti sadržaj (cache) ili snimka ugrađena u aplikaciju; plaćeni dijelovi uvijek traže mrežu |

Nema analitike, oglasa, praćenja ni korisničkih računa. Članci se prikazuju u WebViewu **s isključenim JavaScriptom**;
svaki dodir na poveznicu obrađuje aplikacija (članak/rubrika → ekran u aplikaciji, vanjske poveznice → preglednik,
poveznice na web-pretplatu → ekran pretplate u aplikaciji, nikad Stripe).

## 2. Tehnologija i zašto

**Expo SDK 58 (React Native 0.88, TypeScript, Expo Router)** + **expo-iap 6.4** (StoreKit 2 na iOS-u, Google Play Billing 9 na Androidu).

- **Jedan kod → obje trgovine.** Isti `src/` gradi iOS i Android aplikaciju; razlike (Apple vs. Google naplata) skriva `expo-iap` iza istog API-ja.
- **iOS bez Maca.** EAS Build (Expo) gradi i potpisuje iOS aplikaciju u oblaku i šalje je u App Store Connect (`eas submit`). Na ovom Linux računalu Android se gradi lokalno.
- **Bez trećih servisa za naplatu** (RevenueCat i sl.): kupnju provjerava Lupin vlastiti server (Vercel funkcije u `../site/api/`).
- Mapa `android/` i `ios/` se **ne uređuje ručno** — generira se iz `app.json` (`npx expo prebuild`).

```
lupa-app/
├── app.json                 # ime, bundle id / package, ikone, splash, plugini, extra.siteUrl + extra.subscriptionProductId
├── eas.json                 # EAS profili: development / preview (APK) / production (AAB + iOS)
├── assets/                  # icon.png, android-icon-*.png, splash-icon.png, mark.png, fonts/ (Newsreader, IBM Plex — SIL OFL)
│   └── feed.snapshot.json   # snimka sadržaja ugrađena u aplikaciju (fallback bez mreže)
├── src/app/                 # ekrani (Expo Router): (tabs)/index, categories, subscription, more; article/[id]; category/[id]; page/[key]
├── src/lib/
│   ├── config.ts            # SITE_URL, API rute, ID proizvoda pretplate, pravne poveznice
│   ├── entitlement.tsx      # SVE oko kupnje: initConnection, fetchProducts, requestPurchase, finishTransaction, restore, provjera na serveru
│   ├── feed.tsx             # učitavanje sadržaja (mreža → cache → ugrađena snimka)
│   ├── articleHtml.ts       # HTML članka s web CSS-om + kartica pretplate
│   ├── links.ts             # usmjeravanje poveznica iz članaka
│   ├── i18n.ts, lang.tsx    # HR/EN tekstovi (isti tekstovi kao web)
│   └── siteCss.generated.ts # kopija web CSS-a (npm run sync-css)
└── tools/                   # make_icons.py, sync-site-css.mjs, build-android-local.sh
```

## 3. Pokretanje

```bash
cd /workspace/lupa-app
npm install                      # (već napravljeno na ovom računalu)
npm run typecheck                # TypeScript provjera
npm run sync-feed                # nova snimka sadržaja iz ../lupa (nakon build.py)
npm run sync-css                 # ako se promijeni web CSS
```

**Android APK lokalno (Linux, bez Android Studija):** `bash tools/build-android-local.sh`
→ `dist/lupa-1.0.0-release-debugsigned.apk`. Potrebni JDK 17 i Android SDK — na ovom računalu su u
`~/opt/jdk-17.0.21+9` i `~/opt/android-sdk`. Taj APK je potpisan *debug* ključem: služi za instalaciju na vlastiti
mobitel (Postavke → dopusti instalaciju iz nepoznatih izvora), **ne za Google Play**.

Napomena: Expo Go **ne** podržava kupnje u aplikaciji (treba nativni modul). Za razvoj koristite `npx expo run:android`
ili EAS „development” build.

### Što radi u APK-u već danas
- čitanje svih besplatnih članaka, teaseri plaćenih, rubrike, HR/EN, stranice O nama / Izjava o odgovornosti;
- sadržaj se uzima iz `https://lupa-lovat.vercel.app/app/v1/feed.json` **kad web bude ponovno objavljen s novim
  koracima** (vidi §7); do tada aplikacija prikazuje snimku ugrađenu u APK (s napomenom „Prikazujemo sadržaj ugrađen u aplikaciju”);
- ekran pretplate se prikazuje, ali gumb „Pretplati se” ostaje neaktivan: na mobitelu bez Google Playa piše da trgovina
  nije dostupna, a na mobitelu s Google Playom da proizvod još nije objavljen — jer `lupa_monthly` još ne postoji u Play Consoleu.

Provjereno 11. 11. 2026. na Android 15 emulatoru (Pixel 6): pokretanje, naslovnica HR/EN, rubrike, besplatni i plaćeni
članak (teaser + kartica pretplate), prijelaz s kartice na ekran pretplate, ekran „Više”. Snimke: `docs/screenshots/`.
Gotovi APK: `dist/lupa-1.0.0-release-debugsigned.apk` (arm64-v8a, armeabi-v7a, x86_64; ~62 MB).

## 4. Kako jedan kod pokriva obje trgovine

| | iOS (App Store) | Android (Google Play) |
|---|---|---|
| Identifikator aplikacije | `ios.bundleIdentifier` = `com.svenda.lupa` | `android.package` = `com.svenda.lupa` |
| Naplata | App Store In-App Purchase, auto-renewable subscription (StoreKit 2) | Google Play Billing, subscription s base planom |
| ID proizvoda | `lupa_monthly` | `lupa_monthly` (base plan `monthly`) |
| Token za server | potpisana transakcija (JWS) → server pita App Store Server API | `purchaseToken` → server pita Google Play Developer API |
| Gradnja | `eas build -p ios` (u oblaku, bez Maca) | lokalno (`tools/build-android-local.sh`) ili `eas build -p android` |
| Objava | `eas submit -p ios` → TestFlight → App Review | `eas submit -p android` → interno/zatvoreno testiranje → produkcija |

> `com.svenda.lupa` je **prijedlog**. Na Google Playu se package name nakon prvog uploada **ne može promijeniti** —
> ako želite drugi (npr. vezan uz domenu Lupe), promijenite ga u `app.json` prije prvog uploada.

## 5. Tijek pretplate u kodu (`src/lib/entitlement.tsx`)

1. Pokretanje: `initConnection()` → `fetchProducts({skus:['lupa_monthly'], type:'subs'})` (lokalizirana cijena iz trgovine) →
   `getAvailablePurchases()` (postoji li već aktivna pretplata).
2. „Pretplati se”: `requestPurchase({type:'subs', request:{apple:{sku}, google:{skus, subscriptionOffers:[{sku, offerToken}]}}})`
   → otvara se **sustavni prozor trgovine** (Face ID / Google lozinka). Aplikacija nikad ne vidi karticu.
3. `purchaseUpdatedListener` → token se šalje na `POST /api/app-entitlement` → server pita Apple/Google →
   `finishTransaction()` (na Androidu = *acknowledge*; bez toga Google nakon 3 dana vraća novac).
4. Otvaranje plaćenog članka: `POST /api/app-article {post, lang, platform, token}` → server ponovno provjerava
   pretplatu kod Applea/Googlea (cache 10 min) i tek tada vraća ostatak teksta. **Plaćeni tekstovi nisu u aplikaciji.**
5. „Vrati kupnje”: `restorePurchases()` + `getAvailablePurchases()` (obvezno za App Review; korisno na novom mobitelu).
6. „Upravljaj pretplatom”: `deepLinkToSubscriptions()` → postavke pretplata u App Storeu / Google Playu (otkazivanje).

Otkazana pretplata vrijedi do kraja plaćenog razdoblja; istekla ili refundirana → server vraća 402 i članak se opet zaključava.

## 6. Serverska provjera (dodano na web projekt `../lupa`, NIJE objavljeno)

Nove datoteke u `/workspace/lupa`:

| Datoteka | Što radi |
|---|---|
| `api/store-verify.js` | provjera kod Googlea (OAuth servisnog računa, RS256 → `purchases.subscriptionsv2.get`, sigurnosni *acknowledge*) i Applea (ES256 JWT → App Store Server API `/inApps/v1/subscriptions/{originalTransactionId}`, produkcija pa sandbox). Bez npm ovisnosti. |
| `api/app-entitlement.js` | `POST {platform, token}` → `{active, expiresAt}` |
| `api/app-article.js` | `POST {post, lang, platform, token}` → ostatak plaćenog članka (isti `private/paid` kao web) |
| `scripts/export_app_feed.py` | piše `dist/app/v1/feed.json` (samo javni sadržaj; plaćeni = isti teaser kao web) |
| `scripts/package_vercel.py` | izmijenjen: pokreće `export_app_feed.py` **prije** `check_paywall.py` (provjera curenja pokriva i JSON), dodaje funkcije `app-entitlement` i `app-article` |

Testirano lokalno: provjera curenja (0 leaks), pakiranje (9 funkcija), odgovori 503 dok ključevi nisu postavljeni, te
Google i Apple tok s lažnim (mock) odgovorima i pravim RS256/ES256 potpisima. **Produkcija nije dirana:** postojeći
`site.tgz` i `.vercel/output` vraćeni su na stanje prije testa; nove rute idu van tek pri sljedećem uobičajenom deployu
(`python3 scripts/package_vercel.py` → upload `site.tgz`). Dok ključevi ne postoje, rute vraćaju `503 store_verification_not_configured`
i ništa ne otključavaju. Web paywall (Stripe) radi isto kao prije.

**Vercel env varijable (postaviti kad budu računi):**

| Ključ | Vrijednost |
|---|---|
| `APP_SUBSCRIPTION_PRODUCT_IDS` | `lupa_monthly` (zadano) |
| `GOOGLE_PLAY_PACKAGE_NAME` | `com.svenda.lupa` |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | JSON ključ servisnog računa (cijeli JSON ili base64), *sensitive* |
| `APPLE_BUNDLE_ID` | `com.svenda.lupa` |
| `APPLE_ISSUER_ID`, `APPLE_KEY_ID` | App Store Connect → Users and Access → Integrations → In-App Purchase |
| `APPLE_PRIVATE_KEY` | sadržaj `.p8` ključa, *sensitive* |
| `APPLE_ENVIRONMENT` | (opcionalno) `production` ili `sandbox`; zadano: prvo produkcija, pa sandbox (App Review kupuje u sandboxu) |

## 7. Što Karlo mora napraviti (redom)

**A. Google Play (Android)**
1. Račun: [play.google.com/console](https://play.google.com/console) → osobni račun, **25 USD jednokratno**, provjera identiteta (osobna iskaznica, adresa, telefon).
   Za aplikaciju koja naplaćuje, Google javno prikazuje adresu programera.
2. **Novi osobni računi**: prije objave u produkciji Google traži **zatvoreno testiranje s najmanje 12 testera kroz 14 dana**. Planirajte to.
3. Payments profile (Play Console → Setup → Payments profile): bankovni račun s IBAN-om (osobni ili račun obrta) za isplate.
4. Create app → „Lupa”, jezik hrvatski, App, Free (aplikacija je besplatna, pretplata je unutar nje).
5. Prvi upload: `eas build -p android --profile production` → `eas submit -p android` (ili ručno upload `.aab` na *Internal testing*).
   Proizvodi pretplate mogu se napraviti tek nakon što je prvi build s Billing bibliotekom uploadan.
6. **Proizvod**: Monetize with Play → Products → Subscriptions → *Create subscription*:
   Product ID **`lupa_monthly`**, naziv „Pretplata na Lupu” → *Add base plan*: Base plan ID **`monthly`**, *Auto-renewing*,
   billing period **1 month**, cijena **7,00 EUR** (Hrvatska; za ostale zemlje „Update prices” / ručno), grace period po želji → *Activate*.
7. Servisni račun za server: Google Cloud konzola → isti projekt → IAM → Service Accounts → *Create* → ključ JSON.
   Play Console → Users and permissions → *Invite* e-mail servisnog računa, prava „View financial data” i „Manage orders and subscriptions”.
   JSON stavite u Vercel `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (nikad u repo).
8. License testing (Setup → License testing): dodajte svoj Gmail → testne kupnje bez naplate (mjesečna pretplata u testu traje 5 min).
9. Store listing: kratki/dugi opis HR+EN, snimke zaslona, ikona 512×512 (`assets/icon.png`), feature graphic 1024×500,
   **Privacy policy URL**, Data safety obrazac, Content rating, Target audience (18+ / financije), Financial features izjava („nije investicijska usluga”).

**B. Apple App Store (iOS)**
1. [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/) → kao **pojedinac**, **99 USD godišnje**, Apple ID s 2FA, pravo ime i adresa. Kao prodavatelj u App Storeu piše vaše ime.
2. EU (Digital Services Act): kao „trader” (prodaje pretplate) u App Store Connectu se upisuju i **javno prikazuju adresa, telefon i e-mail**.
3. App Store Connect → Business → **Paid Apps Agreement**: bankovni račun, porezni obrasci (W-8BEN za nerezidente SAD-a). Bez toga kupnje ne rade ni u testu.
4. Preporuka: prijava u **App Store Small Business Program** (provizija 15 % umjesto 30 % u prvoj godini pretplate, dok je prihod < 1 mil. USD).
5. My Apps → + New App → iOS, ime „Lupa”, jezik hrvatski, Bundle ID `com.svenda.lupa` (EAS ga može sam registrirati), SKU `lupa-ios`.
6. **Proizvod**: Monetization → Subscriptions → *Create subscription group* „Lupa” → *Create* → Reference name „Lupa monthly”,
   Product ID **`lupa_monthly`**, Duration **1 month**, cijena **7,00 €** (EUR price point; Apple prilagođava ostale zemlje),
   lokalizacija HR + EN (naziv „Pretplata na Lupu” / „Lupa subscription”, opis), snimka zaslona ekrana pretplate za review.
7. Ključ za server: Users and Access → Integrations → **In-App Purchase** → *Generate* → preuzmite `.p8` (samo jednom!), zapišite Key ID i Issuer ID → Vercel env (`APPLE_*`).
   (Preporuka za kasnije: App Store Server Notifications V2 URL — nije nužno za MVP jer server pita Apple pri svakom otvaranju, uz cache 10 min.)
8. Sandbox tester: Users and Access → Sandbox → testni Apple ID za testne kupnje.
9. Build i slanje bez Maca:
   ```bash
   npm i -g eas-cli            # ili npx eas-cli@latest
   eas login                   # besplatni Expo račun
   eas init                    # poveže projekt (upiše projectId u app.json)
   eas build -p ios --profile production    # EAS pita Apple ID, sam napravi certifikat i provisioning profile
   eas submit -p ios --latest  # u App Store Connect → TestFlight
   ```
   Zatim u App Store Connectu: snimke zaslona (6,7" i 6,5"; iPad ako ostaje `supportsTablet`), opis, ključne riječi,
   Privacy Policy URL, App Privacy obrazac, Age rating, **pretplatu priložiti uz prvu verziju** → Submit for Review.

**C. Web (Vercel) — kad su ključevi spremni**
1. Postaviti env varijable iz §6 (Production + Preview).
2. `python3 build.py --base-url https://lupa-lovat.vercel.app && python3 scripts/check_links.py && python3 scripts/package_vercel.py` → deploy `site.tgz` (postupak iz README-a weba).
3. Provjera: `https://lupa-lovat.vercel.app/app/v1/feed.json` vraća JSON; `POST /api/app-entitlement` s krivim tokenom vraća 200 `{"active":false}` (a ne 503).

**D. Pravne stranice (blokira objavu u obje trgovine)**
- **Pravila privatnosti** — aplikacija ih otvara na `/hr/privatnost/` i `/en/privacy/` (**još ne postoje**). Sadržaj: nema računa ni analitike; token kupnje šalje se Lupinu serveru samo radi provjere pretplate; Apple/Google obrađuju plaćanje; kontakt.
- **Uvjeti korištenja / prodaje** — `/hr/uvjeti/` i `/en/terms/` (**još ne postoje**); na iOS-u aplikacija zasad vodi na Appleov standardni EULA (dopušteno).
- Stvarni kontakt e-mail umjesto `urednistvo@lupa.example`.
- Pravo na odustanak (EU) za digitalni sadržaj, PDV: kod kupnje u trgovini Apple/Google su prodavatelj prema kupcu i obračunavaju PDV — svejedno potvrditi s računovođom kako to knjižiti u obrtu.

## 8. Poznata ograničenja i preostalo

- **Web i aplikacija ne dijele pretplatu.** Pretplata kupljena u aplikaciji vrijedi na svim uređajima s istim Apple ID-om /
  Google računom, ali ne otključava web; Stripe pretplata s weba ne otključava aplikaciju. Razlog: Lupa nema korisničke račune.
  Put za kasnije: prijava e-mailom (magic link, npr. Resend) + mala baza (npr. Neon/Upstash na Vercelu) koja veže račun ↔ Stripe
  customer ↔ Apple `originalTransactionId` / Google `purchaseToken`, plus App Store Server Notifications i Google RTDN.
  Apple dopušta da se u aplikaciji koristi pretplata kupljena na webu (smjernica 3.1.3(b)) ako se nudi i kupnja u aplikaciji,
  ali aplikacija ne smije upućivati na kupnju na webu — zato aplikacija web-pretplatu uopće ne spominje.
- **Potpisivanje**: lokalni APK je potpisan debug ključem. Za Play: EAS upravlja upload ključem (`eas credentials`), a Play App Signing konačnim ključem.
- **iOS nije gradan na ovom računalu** (nema Xcodea); kod je isti, iOS build ide kroz EAS. Nije testirano na iPhoneu.
- **Kupnje nisu testirane uživo** — mogu se testirati tek kad postoje proizvodi (Play license testing / Apple sandbox).
- **Fontovi u člancima** dolaze s weba (bez mreže članci padaju na Georgia/sustavni font); nativni ekrani koriste ugrađene fontove.
- **Apple smjernica 4.2** (minimalna funkcionalnost): aplikacija ima nativnu navigaciju, rubrike, pretplatu i čitač, ali recenzent može tražiti više „aplikacijskih” značajki (npr. obavijesti o novim analizama, spremanje za kasnije). Kandidati za v1.1.
- Obavijesti (push), pretraživanje, spremanje članaka za čitanje bez mreže — nisu u v1.
- Expo SDK 58 je novija od verzije koju expo-iap službeno navodi kao provjerenu (SDK 57); Android build prolazi, iOS build treba potvrditi na EAS-u.

---

## English summary

One Expo (React Native) codebase builds the **Lupa** app for both the **App Store** and **Google Play**. Bilingual HR/EN reader
that renders articles with the website's own CSS; free posts in full, paid posts as the same teaser as the web. Subscription
**`lupa_monthly`, €7.00/month auto-renewing**, bought through StoreKit 2 / Google Play Billing via `expo-iap` (no card entry in
the app, no Stripe in the store apps), with **Restore purchases** and **Manage subscription**. Paid bodies are never bundled:
the app sends the store token to new Vercel functions (`/api/app-entitlement`, `/api/app-article`, `api/store-verify.js` in
`../lupa`), which verify with the Google Play Developer API / App Store Server API. Those routes and the public JSON feed
(`/app/v1/feed.json`) are implemented and tested locally but **not deployed**; they return 503 until the store keys are set.
Android builds locally (`tools/build-android-local.sh`); iOS builds in the cloud with `eas build -p ios` (no Mac needed).
To ship, Karlo needs a Google Play developer account ($25 one-time, ID verification, 12 testers × 14 days closed test for new
personal accounts) and the Apple Developer Program ($99/year, ID verification), the two `lupa_monthly` products, the server
keys, and privacy-policy/terms pages. Web and app subscriptions are not shared yet (no user accounts).
