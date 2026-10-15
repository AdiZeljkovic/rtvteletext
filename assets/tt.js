/* ==========================================================================
   Teletekst RTVFBiH - moderni front
   --------------------------------------------------------------------------
   Cita postojeci FAB export (NNN/NNN_SSSS.htm + pripadajuci .png) i prikazuje
   ga u modernom okviru. Nijedan teletext fajl se ne mijenja - samo se dohvaca,
   dekodira iz windows-1250 i iz njega se izvlaci slika, image mapa i navigacija.
   Zbog toga sve i dalje radi kad FAB sistem prepise stranice novim sadrzajem.
   ========================================================================== */

(function () {
	"use strict";

	/* originalna teletext rezolucija - hotspotovi se skaliraju iz ovih koordinata */
	var BASE_W = 480;
	var BASE_H = 336;

	var HOME = 100;
	var REFRESH_MS = 60000;

	/*
	 * ----------------------------------------------------------------------
	 * MENI I PODNOŽJE – preslikani sa nove stranice rtvfbih.ba
	 * ----------------------------------------------------------------------
	 * Izvor je src/content/site.ts u projektu nove stranice (mainNav, footerNav).
	 * Ako se tamo nešto promijeni, uskladiti i ovdje. Sve putanje su relativne
	 * na SITE – ako nova stranica ode na drugu adresu, mijenja se samo SITE.
	 */
	var SITE = "https://rtvfbih.ba";

	var SITE_NAV = [
		{ label: "O nama", href: "/o-nama", children: [
			{ label: "Historijat", href: "/o-nama", description: "Od transformacije RTVBiH do danas" },
			{ label: "Upravni odbor", href: "/o-nama/upravni-odbor", description: "Članovi i akti Upravnog odbora" },
			{ label: "Organizacija i uredništva", href: "/o-nama/organizacija", description: "Sektori, odjeli i redakcije" }
		]},
		{ label: "Televizija", href: "/televizija", children: [
			{ label: "Federalna televizija", href: "/televizija", description: "Programske cjeline i programska shema" },
			{ label: "Emisije i serije", href: "/televizija/emisije", description: "Emisije, serije i arhiva" },
			{ label: "DVB-T2 prijem", href: "/frekvencije/dvb-t2", description: "Zemaljska digitalna televizija" }
		]},
		{ label: "Radio", href: "/radio" },
		{ label: "Dokumenti", href: "/dokumenti", children: [
			{ label: "Opći akti i izvještaji", href: "/dokumenti", description: "Zakoni, statut, pravilnici, revizije" },
			{ label: "Javne nabavke", href: "/javne-nabavke", description: "Planovi, obavještenja i odluke" },
			{ label: "Obavijesti i konkursi", href: "/obavijesti", description: "Javni konkursi i oglasi" }
		]},
		{ label: "Frekvencije", href: "/frekvencije" },
		{ label: "Marketing", href: "/marketing" },
		{ label: "Kontakt", href: "/kontakt" }
	];

	/* "page" vodi na stranicu teleteksta, "url" je vanjska adresa, "href" je putanja na SITE */
	var FOOTER_NAV = [
		[
			{ title: "Servisi", items: [
				{ label: "Federalna televizija", href: "/televizija" },
				{ label: "Radio Federacije BiH", href: "/radio" },
				{ label: "Emisije i serije", href: "/televizija/emisije" },
				{ label: "Portal federalna.ba", url: "https://federalna.ba" },
				{ label: "Teletekst", page: 100 },
				{ label: "Radio uživo", url: "https://s2.free-shoutcast.com/stream/18170" }
			]}
		],
		[
			{ title: "Institucija", items: [
				{ label: "Historijat", href: "/o-nama" },
				{ label: "Upravni odbor", href: "/o-nama/upravni-odbor" },
				{ label: "Organizacija", href: "/o-nama/organizacija" },
				{ label: "Opći akti i izvještaji", href: "/dokumenti" },
				{ label: "Javne nabavke", href: "/javne-nabavke" }
			]}
		],
		[
			{ title: "Za građane", items: [
				{ label: "Frekvencije i prijem", href: "/frekvencije" },
				{ label: "Marketing i oglašavanje", href: "/marketing" },
				{ label: "Obavijesti i konkursi", href: "/obavijesti" },
				{ label: "Kontakt", href: "/kontakt" }
			]},
			{ title: "Javni RTV sistem BiH", items: [
				{ label: "BHRT", url: "https://www.bhrt.ba" },
				{ label: "RTRS", url: "https://www.rtrs.tv" }
			]}
		]
	];

	/*
	 * Sekcije teleteksta. Stari top.htm / bottomframe.htm su vodili na gomilu
	 * stranica koje su u meduvremenu ugasene (Williams, Lutrija, SMS chat, Mozzart,
	 * Usamljena srca, Stampa...) - ovdje su zadrzane samo stranice koje stvarno
	 * imaju sadrzaj u trenutnom exportu.
	 */
	var SECTIONS = [
		{ label: "Naslovnica",   page: 100 },
		{ label: "Vijesti BiH",  page: 109 },
		{ label: "Svijet",       page: 120 },
		{ label: "Sport",        page: 200 },
		{ label: "TV program",   page: 300 },
		{ label: "Vrijeme",      page: 400 },
		{ label: "Horoskop",     page: 480 },
		{ label: "Kursna lista", page: 499 }
	];

	/*
	 * Kartice ispod ekrana – ostale žive servisne stranice (opisi prema sadržaju stranica).
	 * Vodostaj (493) namjerno nije ovdje: FAB ga ne osvježava, u exportu su podaci iz 2021.
	 */
	var BRZO = [
		{ label: "Stanje na putevima", opis: "Prohodnost puteva i dispečerski centar", page: 406 },
		{ label: "Temperature u BiH", opis: "Izmjerene temperature po gradovima", page: 403 },
		{ label: "Kultura", opis: "Vijesti iz kulture, nauke i umjetnosti", page: 175 },
		{ label: "Religija", opis: "Vijesti iz vjerskih zajednica", page: 190 },
		{ label: "Oglašavanje", opis: "Cjenovnik marketinških usluga teleteksta", page: 415 },
		{ label: "Redakcija teleteksta", opis: "Adresa i kontakt redakcije", page: 443 }
	];


	/* ------------------------------------------------------------- stanje */

	var state = {
		page: HOME,
		sub: 1,
		subs: [1],
		prev: null,
		next: null,
		lastMod: null,
		keybuf: "",
		keyTimer: null,
		pollTimer: null
	};

	var el = {};
	var decoder = new TextDecoder("windows-1250");

	/* ------------------------------------------------------------ pomocno */

	function pad4(n) {
		return String(n).padStart(4, "0");
	}

	/* 310 -> "300/310_0001.htm" */
	function pageFile(page, sub) {
		return String(page).charAt(0) + "00/" + page + "_" + pad4(sub) + ".htm";
	}

	/* iz bilo kojeg href-a izvuci {page, sub}; vraca null za vanjske linkove */
	function parseHref(href) {
		var m = /(?:^|\/)(\d{3})_(\d{4})\.htm(?:[?#].*)?$/.exec(href || "");
		if (!m) return null;
		return { page: parseInt(m[1], 10), sub: parseInt(m[2], 10) };
	}

	function isExternal(href) {
		return /^(https?:|mailto:|tel:)/i.test(href || "");
	}

	/* ----------------------------------------------------- dohvat stranice */

	/*
	 * Fajlovi su u windows-1250, a fetch().text() pretpostavlja UTF-8 -
	 * zato rucno dekodiramo bajtove da dijakritika u alt tekstu ostane ispravna.
	 */
	function fetchPage(page, sub) {
		var url = pageFile(page, sub);
		return fetch(url, { cache: "no-store" }).then(function (res) {
			if (!res.ok) throw new Error("404");
			var lastMod = res.headers.get("Last-Modified");
			return res.arrayBuffer().then(function (buf) {
				return { doc: new DOMParser().parseFromString(decoder.decode(buf), "text/html"),
				         lastMod: lastMod, url: url };
			});
		});
	}

	/* iz dokumenta izvuci sve sto nam treba za prikaz */
	function extract(doc, url) {
		var dir = url.slice(0, url.lastIndexOf("/") + 1);
		var img = doc.querySelector("#FABTTXImage");

		var out = {
			img: null,
			alt: "",
			areas: [],
			subs: [],
			prev: null,
			next: null,
			missing: false
		};

		/*
		 * FAB umjesto ugasene stranice ostavi stub iz missing1.htm ("... ne postoji").
		 * Takvih je u ovom exportu preko 600, pa ih treba prepoznati i prikazati
		 * kao nepostojece, a ne kao prazne.
		 */
		if (!img && /ne\s+postoji/i.test(doc.body ? doc.body.textContent : "")) {
			out.missing = true;
			return out;
		}

		if (img) {
			/* src je relativan na folder stranice */
			out.img = dir + img.getAttribute("src");
			out.alt = (img.getAttribute("alt") || "").replace(/\s+/g, " ").trim();
		}

		/* klikabilne zone iz originalne image mape */
		var areas = doc.querySelectorAll("map area");
		for (var i = 0; i < areas.length; i++) {
			var c = (areas[i].getAttribute("coords") || "").split(",").map(Number);
			var href = areas[i].getAttribute("href") || "";
			if (c.length < 4 || !href) continue;
			/* FAB ponekad generise smece tipa href="http://P" - preskoci */
			if (isExternal(href) && !/^https?:\/\/[\w-]+\.[\w.-]+/i.test(href)) continue;
			out.areas.push({ x: c[0], y: c[1], w: c[2] - c[0], h: c[3] - c[1], href: href });
		}

		/*
		 * Lista podstranica je u <font color="#FE0000"> (template placeholder
		 * %SUBPGLIST%). Trenutna podstranica je obican tekst, ostale su linkovi.
		 */
		var subList = doc.querySelector('font[color="#FE0000"]');
		if (subList) {
			var nums = (subList.textContent || "").match(/\d+/g);
			if (nums) out.subs = nums.map(Number);
		}
		if (!out.subs.length) out.subs = [1];

		/* prethodna / slijedeca stranica - linkovi izvan image mape */
		var anchors = doc.querySelectorAll("body a[href]");
		for (var j = 0; j < anchors.length; j++) {
			var a = anchors[j];
			if (a.closest("map")) continue;
			var txt = (a.textContent || "").trim().toLowerCase();
			var t = parseHref(a.getAttribute("href"));
			if (!t) continue;
			if (txt.indexOf("prethodna") === 0) out.prev = t.page;
			else if (txt.indexOf("slijede") === 0) out.next = t.page;
		}

		return out;
	}

	/* --------------------------------------------------------- renderiranje */

	function render(data) {
		el.screen.classList.remove("is-loading");
		el.inner.innerHTML = "";

		if (!data || !data.img) {
			renderEmpty(!data || data.missing
				? "Ova stranica teleteksta trenutno nije u emitiranju."
				: "Stranica je prazna.");
			return;
		}

		var img = document.createElement("img");
		img.className = "screen__img";
		/* cache-buster vezan za Last-Modified: slika se osvjezi samo kad se stvarno promijeni */
		img.src = data.img + (state.lastMod ? "?v=" + encodeURIComponent(state.lastMod) : "");
		img.alt = data.alt || ("Teletekst stranica " + state.page);
		el.inner.appendChild(img);

		/* hotspotovi - koordinate iz 480x336 pretvorene u postotke pa se skaliraju */
		data.areas.forEach(function (a) {
			var hs = document.createElement("a");
			hs.className = "hotspot";
			hs.style.left   = (a.x / BASE_W * 100) + "%";
			hs.style.top    = (a.y / BASE_H * 100) + "%";
			hs.style.width  = (a.w / BASE_W * 100) + "%";
			hs.style.height = (a.h / BASE_H * 100) + "%";

			var target = parseHref(a.href);
			if (target) {
				hs.href = "#" + target.page + (target.sub > 1 ? "." + target.sub : "");
				hs.title = "Stranica " + target.page;
			} else {
				hs.href = a.href;
				hs.target = "_blank";
				hs.rel = "noopener noreferrer";
				hs.title = a.href;
			}
			/* link bez teksta – čitač ekrana inače ne zna kuda vodi */
			hs.setAttribute("aria-label", hs.title);
			el.inner.appendChild(hs);
		});
	}

	function renderEmpty(message) {
		var box = document.createElement("div");
		box.className = "empty";
		box.innerHTML =
			'<div class="empty__code">' + state.page + "</div>" +
			'<div class="empty__text">' + message + "</div>" +
			(state.page !== HOME ? '<a class="empty__link" href="#' + HOME + '">Naslovnica teleteksta</a>' : "");
		el.inner.appendChild(box);
	}

	/* "Ažurirano 14:32" (danas) ili "Ažurirano 12. 9. u 14:32" – iz Last-Modified zaglavlja */
	function renderUpdated(lastMod) {
		var d = lastMod ? new Date(lastMod) : null;
		if (!d || isNaN(d.getTime())) { el.updated.textContent = ""; return; }
		var sat = d.toLocaleTimeString("bs-BA", { hour: "2-digit", minute: "2-digit" });
		var danas = new Date().toDateString() === d.toDateString();
		el.updated.textContent = "Ažurirano " + (danas ? sat : d.getDate() + ". " + (d.getMonth() + 1) + ". u " + sat);
	}

	/* strelice + padajuci izbornik, za stranice s puno podstranica */
	function renderSubsCompact(subs) {
		var i = subs.indexOf(state.sub);

		function arrow(glyph, target, title) {
			var b = document.createElement("button");
			b.className = "subs__item";
			b.textContent = glyph;
			b.title = title;
			b.disabled = !target;
			if (target) b.onclick = function () { go(state.page, target); };
			return b;
		}

		el.subs.appendChild(arrow("‹", subs[i - 1], "Prethodna podstranica"));

		var sel = document.createElement("select");
		sel.className = "subs__select";
		sel.title = "Podstranica";
		subs.forEach(function (n) {
			var o = document.createElement("option");
			o.value = n;
			o.textContent = n + " / " + subs.length;
			o.selected = n === state.sub;
			sel.appendChild(o);
		});
		sel.onchange = function () { go(state.page, Number(sel.value)); };
		el.subs.appendChild(sel);

		el.subs.appendChild(arrow("›", subs[i + 1], "Slijedeća podstranica"));
	}

	function renderChrome(data) {
		el.pageNum.textContent = state.page + "." + state.sub;

		/* podstranice */
		state.subs = (data && data.subs.length) ? data.subs : [1];
		el.subs.innerHTML = "";
		var subs = (data && data.subs.length > 1) ? data.subs : [];
		el.subs.hidden = subs.length === 0;

		if (subs.length > 9) {
			/* npr. spisak zrtava genocida (599) ima preko 90 podstranica - kompaktna kontrola */
			renderSubsCompact(subs);
		} else {
			subs.forEach(function (n) {
				var b = document.createElement("button");
				b.className = "subs__item" + (n === state.sub ? " is-active" : "");
				b.textContent = n;
				b.onclick = function () { go(state.page, n); };
				el.subs.appendChild(b);
			});
		}

		/* prethodna / slijedeca */
		state.prev = data ? data.prev : null;
		state.next = data ? data.next : null;

		el.prev.disabled = !state.prev;
		el.next.disabled = !state.next;
		el.prevNum.textContent = state.prev || "";
		el.nextNum.textContent = state.next || "";

		/* aktivna sekcija */
		Array.prototype.forEach.call(el.nav.querySelectorAll(".sekcija"), function (a) {
			var aktivna = Number(a.dataset.page) === state.page;
			a.classList.toggle("is-active", aktivna);
			if (aktivna) a.setAttribute("aria-current", "page");
			else a.removeAttribute("aria-current");
		});
	}

	/* ------------------------------------------------------------ navigacija */

	function go(page, sub) {
		page = Number(page);
		sub = Number(sub) || 1;
		if (!(page >= 100 && page <= 899)) return;
		var hash = "#" + page + (sub > 1 ? "." + sub : "");
		if (location.hash === hash) load(page, sub);
		else location.hash = hash;
	}

	function load(page, sub) {
		state.page = page;
		state.sub = sub;
		el.screen.classList.add("is-loading");

		fetchPage(page, sub).then(function (r) {
			state.lastMod = r.lastMod;
			var data = extract(r.doc, r.url);
			render(data);
			renderChrome(data);
			renderUpdated(data.img ? r.lastMod : null);
			document.title = page + "." + sub + " · Teletekst FTV";
		}).catch(function () {
			state.lastMod = null;
			renderUpdated(null);
			el.screen.classList.remove("is-loading");
			el.inner.innerHTML = "";
			renderEmpty("Stranica ne postoji.");
			renderChrome(null);
		});

		schedulePoll();
	}

	function readHash() {
		var m = /^#?(\d{3})(?:[.,](\d{1,4}))?/.exec(location.hash || "");
		if (!m) return { page: HOME, sub: 1 };
		return { page: parseInt(m[1], 10), sub: m[2] ? parseInt(m[2], 10) : 1 };
	}

	function onHashChange() {
		var t = readHash();
		load(t.page, t.sub);
		pokaziEkran();
	}

	/*
	 * Na mobitelu su sekcije i kartice ispod ekrana – nakon izbora stranice
	 * ekran se vrati u vidno polje (ako već nije vidljiv).
	 */
	function pokaziEkran() {
		var r = el.tv.getBoundingClientRect();
		if (r.top < 0 || r.top > window.innerHeight * 0.5) {
			el.tv.scrollIntoView({ block: "start" });
		}
	}

	/* --------------------------------------------- auto-osvjezavanje sadrzaja */

	/*
	 * FAB sistem stalno prepisuje stranice (vijesti, kvote, program). HEAD zahtjev
	 * je jeftin - ako se Last-Modified promijenio, ponovo ucitaj stranicu.
	 */
	function schedulePoll() {
		clearTimeout(state.pollTimer);
		state.pollTimer = setTimeout(poll, REFRESH_MS);
	}

	function poll() {
		if (document.hidden) { schedulePoll(); return; }
		var page = state.page, sub = state.sub;
		fetch(pageFile(page, sub), { method: "HEAD", cache: "no-store" })
			.then(function (res) {
				var lm = res.headers.get("Last-Modified");
				if (res.ok && lm && lm !== state.lastMod && page === state.page && sub === state.sub) {
					load(page, sub);
				} else {
					schedulePoll();
				}
			})
			.catch(schedulePoll);
	}

	/* ---------------------------------------------------------- tipkovnica */

	function onKey(e) {
		if (e.ctrlKey || e.altKey || e.metaKey) return;

		var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

		if (e.key >= "0" && e.key <= "9" && !typing) {
			state.keybuf = (state.keybuf + e.key).slice(-3);
			showKeybuf();
			if (state.keybuf.length === 3) {
				var p = parseInt(state.keybuf, 10);
				clearKeybuf();
				if (p >= 100 && p <= 899) go(p, 1);
			}
			return;
		}

		if (typing) return;

		switch (e.key) {
			case "ArrowLeft":
				if (state.prev) go(state.prev, 1);
				break;
			case "ArrowRight":
				if (state.next) go(state.next, 1);
				break;
			case "ArrowUp":
			case "PageUp":
				stepSub(-1);
				e.preventDefault();
				break;
			case "ArrowDown":
			case "PageDown":
				stepSub(1);
				e.preventDefault();
				break;
			case "Home":
				go(HOME, 1);
				break;
			case "Escape":
				clearKeybuf();
				break;
		}
	}

	function stepSub(delta) {
		var list = state.subs;
		var i = list.indexOf(state.sub);
		if (i === -1) return;
		var next = list[i + delta];
		if (next) go(state.page, next);
	}

	function showKeybuf() {
		el.keybuf.textContent = state.keybuf.padEnd(3, "–");
		el.keybuf.classList.add("is-on");
		clearTimeout(state.keyTimer);
		state.keyTimer = setTimeout(clearKeybuf, 1400);
	}

	function clearKeybuf() {
		state.keybuf = "";
		el.keybuf.classList.remove("is-on");
		clearTimeout(state.keyTimer);
	}

	/* ------------------------------------------------------------- izgradnja */

	var IKONA_DOLJE = '<svg class="ikona" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
	var IKONA_DESNO = '<svg class="ikona" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

	function esc(s) {
		return String(s).replace(/[&<>"]/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
		});
	}

	/* adresa stavke: stranica teleteksta, vanjski URL ili putanja na novoj stranici */
	function adresa(s) {
		if (s.page) return "#" + s.page;
		if (s.url) return s.url;
		return SITE + s.href;
	}
	function vanjska(s) {
		return s.url ? ' target="_blank" rel="noopener"' : "";
	}

	/* sekcije teleteksta (pilule / dvije kolone) */
	function buildNav() {
		el.nav.innerHTML = SECTIONS.map(function (s) {
			return '<li><a class="sekcija" href="#' + s.page + '" data-page="' + s.page + '">' +
				"<span>" + esc(s.label) + "</span>" +
				'<span class="sekcija__broj">' + s.page + "</span></a></li>";
		}).join("");
	}

	/* glavni meni – desktop (padajući izbornici rade na hover i fokus, bez JS-a) */
	function buildSiteNav() {
		el.sitenav.innerHTML = SITE_NAV.map(function (item) {
			if (!item.children) {
				return '<li class="sitenav__item"><a class="sitenav__link" href="' + adresa(item) + '">' + esc(item.label) + "</a></li>";
			}
			return '<li class="sitenav__item">' +
				'<a class="sitenav__link" href="' + adresa(item) + '" aria-haspopup="true">' + esc(item.label) + IKONA_DOLJE + "</a>" +
				'<div class="sitenav__podmeni"><ul>' +
				item.children.map(function (c) {
					return '<li><a href="' + adresa(c) + '"><strong>' + esc(c.label) + "</strong>" +
						(c.description ? "<small>" + esc(c.description) + "</small>" : "") + "</a></li>";
				}).join("") +
				"</ul></div></li>";
		}).join("");
	}

	/* glavni meni – mobitel (numerisane stavke, podmeniji se otvaraju na klik) */
	function buildMobileNav() {
		el.mmeni.innerHTML = SITE_NAV.map(function (item, i) {
			var broj = '<span class="mmeni__broj">' + String(i + 1).padStart(2, "0") + "</span>";
			if (!item.children) {
				return '<li><a class="mmeni__red" href="' + adresa(item) + '">' + broj +
					'<span class="mmeni__naziv">' + esc(item.label) + "</span></a></li>";
			}
			var id = "mpod-" + i;
			return '<li><button class="mmeni__red" type="button" aria-expanded="false" aria-controls="' + id + '">' + broj +
				'<span class="mmeni__naziv">' + esc(item.label) + '</span><span class="mmeni__strelica">' + IKONA_DOLJE + "</span></button>" +
				'<ul class="mmeni__pod" id="' + id + '" hidden>' +
				item.children.map(function (c) {
					return '<li><a href="' + adresa(c) + '"><strong>' + esc(c.label) + "</strong>" +
						(c.description ? "<small>" + esc(c.description) + "</small>" : "") + "</a></li>";
				}).join("") +
				"</ul></li>";
		}).join("");

		el.mmeni.addEventListener("click", function (e) {
			var btn = e.target.closest("button.mmeni__red");
			if (!btn) return;
			var otvoren = btn.getAttribute("aria-expanded") === "true";
			btn.setAttribute("aria-expanded", String(!otvoren));
			document.getElementById(btn.getAttribute("aria-controls")).hidden = otvoren;
		});
	}

	function postaviMeni(otvoren) {
		el.site.classList.toggle("is-open", otvoren);
		el.menuBtn.setAttribute("aria-expanded", String(otvoren));
		el.menuBtn.setAttribute("aria-label", otvoren ? "Zatvori meni" : "Otvori meni");
		el.mmeniPanel.setAttribute("aria-hidden", String(!otvoren));
		el.mmeniPanel.inert = !otvoren;
		/* dok je meni otvoren, stranica ispod se ne skrola */
		document.documentElement.style.overflow = otvoren ? "hidden" : "";
		azurirajZaglavlje();
	}

	/* zaglavlje: prozirno preko tamnog uvoda, bijelo nakon skrolanja (kao na rtvfbih.ba) */
	function azurirajZaglavlje() {
		var solid = window.scrollY > 24 && !el.site.classList.contains("is-open");
		el.site.classList.toggle("is-solid", solid);
	}

	function buildFooter() {
		el.kolone.innerHTML = FOOTER_NAV.map(function (kolona) {
			return "<div>" + kolona.map(function (grupa) {
				return '<div class="podnozje__kolona"><h3>' + esc(grupa.title) + "</h3><ul>" +
					grupa.items.map(function (s) {
						return '<li><a href="' + adresa(s) + '"' + vanjska(s) + (s.page ? ' aria-current="page"' : "") + ">" + esc(s.label) + "</a></li>";
					}).join("") +
					"</ul></div>";
			}).join("") + "</div>";
		}).join("");
	}

	function buildBrzo() {
		el.brzo.innerHTML = BRZO.map(function (s) {
			return '<li><a class="kartica" href="#' + s.page + '">' +
				'<span class="kartica__broj">' + s.page + "</span>" +
				'<span class="kartica__tekst"><strong>' + esc(s.label) + "</strong><small>" + esc(s.opis) + "</small></span>" +
				IKONA_DESNO + "</a></li>";
		}).join("");
	}

	function init() {
		el.site     = document.getElementById("site");
		el.sitenav  = document.getElementById("sitenav");
		el.menuBtn  = document.getElementById("menuBtn");
		el.mmeni    = document.getElementById("mmeniLista");
		el.mmeniPanel = document.getElementById("mobilni-meni");
		el.nav      = document.getElementById("nav");
		el.tv       = document.getElementById("ekran");
		el.screen   = document.getElementById("screen");
		el.inner    = document.getElementById("screenInner");
		el.subs     = document.getElementById("subs");
		el.prev     = document.getElementById("prevBtn");
		el.next     = document.getElementById("nextBtn");
		el.prevNum  = document.getElementById("prevNum");
		el.nextNum  = document.getElementById("nextNum");
		el.pageNum  = document.getElementById("pageNum");
		el.updated  = document.getElementById("updated");
		el.keybuf   = document.getElementById("keybuf");
		el.kolone   = document.getElementById("podnozjeKolone");
		el.brzo     = document.getElementById("brzo");

		/* logo i mrvice vode na naslovnicu nove stranice */
		document.getElementById("logoLink").href = SITE + "/";
		document.getElementById("mrviceHome").href = SITE + "/";
		document.getElementById("godina").textContent = new Date().getFullYear();

		buildSiteNav();
		buildMobileNav();
		buildNav();
		buildFooter();
		buildBrzo();

		el.menuBtn.onclick = function () { postaviMeni(!el.site.classList.contains("is-open")); };
		el.mmeniPanel.addEventListener("click", function (e) {
			if (e.target.closest("a")) postaviMeni(false);
		});
		window.addEventListener("scroll", azurirajZaglavlje, { passive: true });
		window.matchMedia("(min-width: 1280px)").addEventListener("change", function (m) {
			if (m.matches) postaviMeni(false);
		});
		azurirajZaglavlje();

		el.prev.onclick = function () { if (state.prev) go(state.prev, 1); };
		el.next.onclick = function () { if (state.next) go(state.next, 1); };

		document.getElementById("gotoForm").onsubmit = function (e) {
			e.preventDefault();
			var v = document.getElementById("gotoInput");
			var m = /^(\d{3})(?:[.,](\d{1,4}))?$/.exec(v.value.trim());
			if (m) go(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 1);
			v.value = "";
			v.blur();
		};

		window.addEventListener("hashchange", onHashChange);
		document.addEventListener("keydown", function (e) {
			if (e.key === "Escape" && el.site.classList.contains("is-open")) {
				postaviMeni(false);
				el.menuBtn.focus();
				return;
			}
			onKey(e);
		});

		/* prvo učitavanje – bez skrolanja do ekrana */
		var t = readHash();
		load(t.page, t.sub);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
