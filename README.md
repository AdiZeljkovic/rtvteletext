# Teletekst RTVFBiH

Modernizirani web front za teletekst Radiotelevizije Federacije BiH
([teletext.rtvfbih.ba](https://teletext.rtvfbih.ba)).

Stari sajt je frameset iz ranih 2000-ih. Ovaj repozitorij sadrži novi front
(`index-new.html` + `assets/`) koji prikazuje **isti, nepromijenjeni** teletekst
sadržaj u modernom omotaču, te kompletan snimak postojećeg sajta radi razvoja.

---

## Brzi start

Potreban je HTTP server — `file://` ne radi jer front dohvaća stranice preko
`fetch()`.

```bash
python -m http.server 8099
```

Zatim otvoriti <http://127.0.0.1:8099/index-new.html>.

---

## Kako radi

Teletekst stranice generiše **FAB teletext sistem** (F.A. Bernhard, verzija
10.0.0.191) — isti sistem koji emituje teletekst na FTV. Njegov HTML-export
modul svaku stranicu renderuje kao PNG 480×336 i omota je u `.htm` sa image
mapom za klikabilne brojeve stranica.

Novi front **ne mijenja nijedan teletekst fajl.** Umjesto toga:

1. dohvati postojeći `NNN/NNN_SSSS.htm`,
2. dekodira ga iz `windows-1250` (`TextDecoder`),
3. izvuče PNG, image mapu i navigaciju iz HTML-a,
4. iscrta to u modernom rasporedu.

Zbog toga sve nastavlja raditi kad FAB sistem prepiše stranice novim sadržajem —
nema koraka izgradnje ni sinkronizacije.

### Struktura

```
index-new.html      novi front
assets/tt.css       dizajn (u stilu nove stranice rtvfbih.ba)
assets/tt.js        čitanje FAB exporta, navigacija, meni i podnožje
assets/brand/       logo F25, znak „F“ i pozadinska tekstura (sa rtvfbih.ba)
images/             grafika starog frameseta
100/ … 800/         teletekst stranice: PPP_SSSS.htm + .png
```

### Dizajn

Izgled je preslikan sa nove stranice rtvfbih.ba (projekat `nova stranica/rtvfbih`):
ista paleta (navy `#0B2540`, plava `#2B8DDE`, nebo `#87C6DD`), fontovi Montserrat i
Inter, zaglavlje s logom F25 i istim menijem, tamni uvod s teksturom i tamno
podnožje. Samo svijetla tema, kao na stranici.

Meni i podnožje su u `SITE_NAV` i `FOOTER_NAV` na vrhu [`assets/tt.js`](assets/tt.js),
preslikani iz `src/content/site.ts` nove stranice. Sve putanje idu na `SITE`
(`https://rtvfbih.ba`) – ako nova stranica ode na drugu adresu, mijenja se samo ta
jedna vrijednost. Kartice „Servisne informacije“ su u `BRZO`.

### Objava (FTP)

Na server teletext.rtvfbih.ba se šalju samo `index-new.html` i cijeli folder
`assets/`. Teletekst stranice (`100/` … `800/`) i dalje piše FAB sistem i ne diraju se.
Front mora biti na istoj domeni kao FAB fajlovi (čita ih preko `fetch()`).
Pri svakoj objavi izmjena u `assets/` promijeniti `?v=` uz `tt.css` i `tt.js` u
`index-new.html` (npr. na datum objave) – inače posjetioci mogu dobiti stari fajl iz keša.
Dok se ne odluči drugačije, stari frameset ostaje na `index.html`; novi front se
uključuje preimenovanjem `index-new.html` u `index.html` (stari sačuvati kao kopiju).

Folder odgovara stotini: `100/` drži stranice 100–199, `200/` stranice 200–299
itd. Ime fajla je `PPP_SSSS` — broj stranice i podstranica (`100_0002.htm` je
stranica 100, podstranica 2).

Stari frameset (`index.htm`, `frameset.htm`, `top.htm`, `bottomframe.htm`,
`template.htm`) zadržan je radi reference i nije u upotrebi u novom frontu.

### Mogućnosti

- Deep-linking preko hash rute — `#301`, `#100.2`
- Tastatura: `0–9` broj stranice, `←→` stranica, `↑↓` podstranica, `Home`
- Klikabilni brojevi unutar teleteksta (iz originalne image mape)
- Automatsko osvježavanje aktivne stranice svakih 60 s, preko `Last-Modified`;
  iznad ekrana piše kad je stranica zadnji put ažurirana
- Responzivno, bez horizontalnog scrolla (provjereno do 320 px); na telefonu je
  ekran odmah ispod naslova, a izbor sekcije vraća ekran u vidno polje
- Pristupačnost: klikabilni brojevi imaju `aria-label`, link „Preskoči na
  teletekst“, meni radi tastaturom, poštuje se `prefers-reduced-motion`

---

## Stanje sadržaja

Od 800 mogućih brojeva stranica, **194 ima stvarni sadržaj.** Ostalo su prazni
rezervisani brojevi ili stranice koje su ugašene — FAB u tom slučaju ostavlja
stub „Stranica ne postoji" (613 takvih), a kod 285 njih zaostane i stara PNG
slika koju ništa više ne referencira.

Cijeli opseg `700–799` (Mozzart) je ugašen, kao i većina linkova iz stare donje
trake: Williams, BET-live, Lutrija BiH, BET-SHOP, Derby, Millennium, Formula,
SMS chat, Mali oglasi, Usamljena srca, Kulinarstvo, Sanovnik, Štampa. Navigacija
u novom frontu vodi samo na stranice koje su žive.

Stranica 493 (Vodostaj) postoji, ali FAB je ne osvježava – u exportu su podaci
od 8. 4. 2021. Zato nije među karticama.

## Što treba dovršiti

Linkovi menija vode na putanje nove stranice rtvfbih.ba. Dok nova stranica ne ode
uživo na `SITE`, ti linkovi na produkciji vode na stari sajt.

## Napomene

- Serverski logovi i cPanel backup nisu u repozitoriju (`.gitignore`) — logovi
  sadrže IP adrese posjetilaca.
- Teletekst stranice su generisani sadržaj, ne izvorni kod. U repozitoriju su
  kao snimak za razvoj i zastarjet će čim FAB sistem objavi novi izvoz.
