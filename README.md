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
assets/tt.css       dizajn (svijetla i tamna tema)
assets/tt.js        čitanje FAB exporta, navigacija, teme
images/             logotipi i grafika
100/ … 800/         teletekst stranice: PPP_SSSS.htm + .png
```

Folder odgovara stotini: `100/` drži stranice 100–199, `200/` stranice 200–299
itd. Ime fajla je `PPP_SSSS` — broj stranice i podstranica (`100_0002.htm` je
stranica 100, podstranica 2).

Stari frameset (`index.htm`, `frameset.htm`, `top.htm`, `bottomframe.htm`,
`template.htm`) zadržan je radi reference i nije u upotrebi u novom frontu.

### Mogućnosti

- Deep-linking preko hash rute — `#301`, `#100.2`
- Tastatura: `0–9` broj stranice, `←→` stranica, `↑↓` podstranica, `Home`
- Klikabilni brojevi unutar teleteksta (iz originalne image mape)
- Svijetla i tamna tema; prati sistemsku postavku dok korisnik sam ne prebaci
- Automatsko osvježavanje aktivne stranice svakih 60 s, preko `Last-Modified`
- Responzivno, bez horizontalnog scrolla na telefonu

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

## Što treba dovršiti

Glavni meni je preslikan sa redizajna rtvfbih.ba, ali **putanje nisu potvrđene** —
produkcijski rtvfbih.ba još uvijek vrti stari sajt. Zamijeniti `url` vrijednosti
u `SITE_NAV` na vrhu [`assets/tt.js`](assets/tt.js) kad redizajn ode uživo.

## Napomene

- Serverski logovi i cPanel backup nisu u repozitoriju (`.gitignore`) — logovi
  sadrže IP adrese posjetilaca.
- Teletekst stranice su generisani sadržaj, ne izvorni kod. U repozitoriju su
  kao snimak za razvoj i zastarjet će čim FAB sistem objavi novi izvoz.
