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
	 * GLAVNI MENI RTVFBiH
	 * ----------------------------------------------------------------------
	 * Preslikan sa redizajna rtvfbih.ba. Trenutni produkcijski rtvfbih.ba jos
	 * uvijek vrti stari sajt, pa PUTANJE NISU POTVRDJENE - zamijeniti "url"
	 * vrijednosti pravima kad redizajn ode uzivo.
	 * Stavke koje imaju "items" dobivaju padajuci izbornik.
	 * Stavke sa "page" vode na stranicu teleteksta (te su provjerene i zive).
	 */
	var SITE_NAV = [
		{ label: "Naslovnica", url: "https://rtvfbih.ba/" },
		{ label: "FTV",        url: "https://www.federalna.ba/" },
		{ label: "TV Program", url: "https://rtvfbih.ba/tv-program" },
		{ label: "Radio FBiH", url: "https://rtvfbih.ba/radio", items: [
			{ label: "O Radiju FBiH", url: "https://rtvfbih.ba/radio" },
			{ label: "Program",       url: "https://rtvfbih.ba/radio/program" },
			{ label: "Frekvencije",   url: "https://rtvfbih.ba/radio/frekvencije" },
			{ label: "Slušaj uživo",  url: "https://rtvfbih.ba/radio/uzivo" }
		]},
		{ label: "Opće informacije", url: "https://rtvfbih.ba/o-nama", items: [
			{ label: "O RTVFBiH",           url: "https://rtvfbih.ba/o-nama" },
			{ label: "Organizacija",        url: "https://rtvfbih.ba/organizacija" },
			{ label: "Dokumenti i propisi", url: "https://rtvfbih.ba/dokumenti" },
			{ label: "Kontakt",             url: "https://rtvfbih.ba/kontakt" }
		]},
		{ label: "Marketing", url: "https://rtvfbih.ba/marketing", items: [
			/* ove tri vode na stvarne, zive stranice teleteksta */
			{ label: "Cjenovnik oglašavanja",   page: 410 },
			{ label: "Cjenovnik teleteksta",    page: 415 },
			{ label: "Politički subjekti",      page: 416 },
			{ label: "Kontakt marketing",       url: "https://rtvfbih.ba/marketing" }
		]},
		{ label: "Javne nabavke", url: "https://rtvfbih.ba/javne-nabavke" },
		{ label: "Teletekst", page: 100, active: true }
	];

	/*
	 * Sekcije i brzi linkovi. Stari top.htm / bottomframe.htm su vodili na gomilu
	 * stranica koje su u meduvremenu ugasene (Williams, Lutrija, SMS chat, Mozzart,
	 * Usamljena srca, Stampa...) - ovdje su zadrzane samo stranice koje stvarno
	 * imaju sadrzaj u trenutnom exportu.
	 */
	/*
	 * Osam stavki - taman toliko da centrirana grupa ne naleti na polje za unos
	 * na uobicajenim rezolucijama. Ostale zive sekcije su u podnozju.
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
			el.inner.appendChild(hs);
		});
	}

	function renderEmpty(message) {
		var box = document.createElement("div");
		box.className = "empty";
		box.innerHTML =
			'<div class="empty__code">' + state.page + "</div>" +
			'<div class="empty__text">' + message + "</div>";
		el.inner.appendChild(box);
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
		Array.prototype.forEach.call(el.nav.children, function (item) {
			item.classList.toggle("is-active", Number(item.dataset.page) === state.page);
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
			document.title = page + "." + sub + " · Teletekst FTV";
		}).catch(function () {
			state.lastMod = null;
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

	function buildNav() {
		SECTIONS.forEach(function (s) {
			var a = document.createElement("a");
			a.className = "nav__item";
			a.href = "#" + s.page;
			a.dataset.page = s.page;
			a.title = "Stranica " + s.page;

			var label = document.createElement("span");
			label.textContent = s.label;
			a.appendChild(label);

			/* broj stranice uz naziv - korisno i vizuelno odvaja ovaj meni od glavnog */
			var num = document.createElement("span");
			num.className = "nav__num";
			num.textContent = s.page;
			a.appendChild(num);

			el.nav.appendChild(a);
		});
	}

	var CARET = '<svg class="sitenav__caret" viewBox="0 0 12 12" fill="none" aria-hidden="true">' +
	            '<path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" stroke-width="1.6" ' +
	            'stroke-linecap="round" stroke-linejoin="round"/></svg>';

	/* glavni meni RTVFBiH, s padajucim izbornicima */
	function buildSiteNav() {
		SITE_NAV.forEach(function (entry) {
			var group = document.createElement("div");
			group.className = "sitenav__group" + (entry.active ? " is-active" : "");

			var link = document.createElement(entry.items ? "button" : "a");
			link.className = "sitenav__link";
			link.textContent = entry.label;

			if (entry.items) {
				link.type = "button";
				link.setAttribute("aria-expanded", "false");
				link.insertAdjacentHTML("beforeend", CARET);
				var menu = buildSiteMenu(entry.items);
				link.onclick = function (e) {
					e.stopPropagation();
					var open = group.classList.contains("is-open");
					closeMenus();
					if (!open) {
						group.classList.add("is-open");
						link.setAttribute("aria-expanded", "true");
						menu.hidden = false;
					}
				};
				group.appendChild(link);
				group.appendChild(menu);
			} else {
				applyTarget(link, entry);
				group.appendChild(link);
			}

			el.sitenav.appendChild(group);
		});

		document.addEventListener("click", closeMenus);
		document.addEventListener("keydown", function (e) {
			if (e.key === "Escape") closeMenus();
		});
	}

	function buildSiteMenu(items) {
		var menu = document.createElement("div");
		menu.className = "sitenav__menu";
		menu.hidden = true;
		items.forEach(function (it) {
			var a = document.createElement("a");
			a.className = "sitenav__item";
			a.textContent = it.label;
			applyTarget(a, it);
			menu.appendChild(a);
		});
		return menu;
	}

	/* stavka vodi ili na stranicu teleteksta (#NNN) ili na vanjski URL */
	function applyTarget(node, entry) {
		if (entry.page) {
			node.href = "#" + entry.page;
			node.title = "Stranica " + entry.page;
		} else {
			node.href = entry.url || "#";
			node.target = "_blank";
			node.rel = "noopener noreferrer";
		}
	}

	function closeMenus() {
		Array.prototype.forEach.call(el.sitenav.children, function (g) {
			g.classList.remove("is-open");
			var btn = g.querySelector(".sitenav__link");
			var menu = g.querySelector(".sitenav__menu");
			if (btn && btn.tagName === "BUTTON") btn.setAttribute("aria-expanded", "false");
			if (menu) menu.hidden = true;
		});
	}

	/* ----------------------------------------------------------------- tema */

	var ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
	               'stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/>' +
	               '<path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4' +
	               'M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>';

	var ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
	                'stroke-linejoin="round"><path d="M20 13.4A8.2 8.2 0 1 1 10.6 4a6.6 6.6 0 0 0 9.4 9.4Z"/></svg>';

	function currentTheme() {
		if (document.documentElement.dataset.theme) return document.documentElement.dataset.theme;
		return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	}

	/*
	 * persist = true samo kad korisnik sam prebaci temu. Da smo pamtili i pri
	 * prvom ucitavanju, izbor bi se "zakljucao" i stranica vise ne bi pratila
	 * sistemsku postavku.
	 */
	function setTheme(theme, persist) {
		document.documentElement.dataset.theme = theme;
		if (persist) {
			try { localStorage.setItem("ttx-theme", theme); } catch (e) {}
		}
		el.themeBtn.innerHTML = theme === "dark" ? ICON_SUN : ICON_MOON;
		el.themeBtn.title = theme === "dark" ? "Svijetla tema" : "Tamna tema";
	}

	function initTheme() {
		setTheme(currentTheme(), false);
		el.themeBtn.onclick = function () {
			setTheme(currentTheme() === "dark" ? "light" : "dark", true);
		};
	}

	function init() {
		el.nav      = document.getElementById("nav");
		el.sitenav  = document.getElementById("sitenav");
		el.themeBtn = document.getElementById("themeBtn");
		el.screen  = document.getElementById("screen");
		el.inner   = document.getElementById("screenInner");
		el.subs    = document.getElementById("subs");
		el.prev    = document.getElementById("prevBtn");
		el.next    = document.getElementById("nextBtn");
		el.prevNum = document.getElementById("prevNum");
		el.nextNum = document.getElementById("nextNum");
		el.pageNum = document.getElementById("pageNum");
		el.keybuf  = document.getElementById("keybuf");

		buildSiteNav();
		buildNav();
		initTheme();

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
		document.addEventListener("keydown", onKey);

		onHashChange();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
