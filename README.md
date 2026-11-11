# Lupa — Istraživanje malih dionica / Small-cap research

Dvojezični (HR/EN) istraživački blog o malim dionicama, bioinženjeringu i kvantnom računalstvu, plus jedna mobilna aplikacija za iOS i Android.

**Živa stranica:** [https://lupa-lovat.vercel.app](https://lupa-lovat.vercel.app)

Pretplata je 7 € mjesečno. Na webu ide preko Stripea (plaćanja još nisu aktivna). U aplikaciji ide preko App Storea i Google Playa kad aplikacija bude u trgovinama.

U kodu **nema** tajnih ključeva (Stripe, trgovine, keystore).

> ⚠️ **Plaćeni tekstovi su u repozitoriju.** Izvorni tekstovi članaka, uključujući one iza pretplate, nalaze se u `site/content/posts/`. Dok je repozitorij javan, svatko ih može pročitati na GitHubu bez pretplate. Repozitorij treba biti **privatan** (GitHub → Settings → General → Danger Zone → Change visibility). Generirana mapa `site/private/` više se ne sprema u git (`.gitignore`).

## Sadržaj repozitorija

| Mapa / datoteka | Što je |
|---|---|
| `site/` | Izvorni kod web stranice (Python generator + Vercel funkcije) |
| `app/` | Expo / React Native aplikacija za iOS i Android |
| [Releases](https://github.com/Karlo6546541/Lupa/releases) | Testni Android APK (`lupa-1.0.0-arm64-test.apk`) |

Testni APK je potpisan debug ključem, samo za arhitekturu arm64, za ručnu instalaciju. **Nije** za Google Play.

## Brzi start — web

```bash
cd site
python3 build.py --base-url https://lupa-lovat.vercel.app
python3 scripts/check_links.py
python3 scripts/check_paywall.py
node --test "tests/*.test.js"
python3 scripts/package_vercel.py
```

Detalje vidi u [`site/README.md`](site/README.md). Objava na Vercel ide uploadom `site.tgz` u projekt `lupa`, s naredbom za izgradnju `tar -xzf site.tgz`.

## Brzi start — aplikacija

```bash
cd app
npm install
npx expo start
```

Lokalni Android APK: `bash tools/build-android-local.sh` (vidi [`app/README.md`](app/README.md)). Mape `android/` i `ios/` se ne čuvaju u gitu; stvara ih `npx expo prebuild`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) na svaki push i pull request gradi stranicu, provjerava poveznice i paywall, pokreće testove API-ja te za aplikaciju radi `npm ci` i `tsc`.

## Licenca

Kod i sadržaj su vlasništvo autora. Članci nisu investicijski savjet.
