/*
 * Svatba (wedding invitation) copy dictionary.
 *
 * HOW TO EDIT: every visible bit of text on the /svatba/ page lives here, as a
 * flat "key": "value" pair, once under `cs` (Czech, the default language),
 * once under `en` (English) and once under `fr` (French). To change a
 * sentence, find its key below and edit the string — you do not need to touch
 * the HTML, CSS or JS. All three dictionaries must carry the exact same set
 * of keys (checked by a small node parity script during development).
 *
 * Keys are dot-separated strings but the object itself is FLAT (no nested
 * objects) — e.g. dict["rsvp.err.name"], not dict.rsvp.err.name.
 *
 * The HTML wires these up with:
 *   data-i18n="key"        -> element.textContent = dict[key]
 *   data-i18n-html="key"   -> element.innerHTML = dict[key]  (for copy with
 *                              <em>, <br> or <a> links baked in)
 *   data-i18n-attr="attr:key,attr2:key2" -> sets those attributes instead
 * A missing key in the active language falls back to the `cs` value.
 *
 * Anything marked with an HTML comment `<!-- TODO Daniel: confirm -->` next
 * to it in index.html is a placeholder guess (times, programme, dress code,
 * gifts, accommodation, RSVP deadline) — edit the `cs`, `en` AND `fr` string
 * here once the real details are known.
 *
 * French typography note: non-breaking spaces (U+202F narrow no-break space)
 * are embedded directly before ; : ? ! as is customary in French.
 */
window.SVATBA_I18N = {
  cs: {
    "meta.title": "Tereza & Daniel · Svatební pozvánka",

    "lang.cs": "CS",
    "lang.en": "EN",
    "lang.fr": "FR",

    "hero.kicker": "Svatební oznámení",
    "hero.date": "19. 6. 2027",
    "hero.place": "<span class=\"place-a\">Stodola v Meruňkovém sadu</span><span class=\"place-sep\"> · </span><span class=\"place-b\">Dolní Kounice</span>",
    "hero.cta": "Potvrdit účast",
    "hero.scrollAria": "Přejít na pozvánku",
    "hero.family": "Nečesalovi",

    "card.greeting": "Milí naši,",
    "card.p1": "s radostí v srdci vám oznamujeme, že jsme se rozhodli jít spolu dál – tentokrát už jako manželé. Bude nám ctí, když tento den prožijete s námi.",
    "card.p2": "Strávíme spolu dlouhý letní den pod korunami meruňkových stromů – s dobrým jídlem, vínem a lidmi, které máme rádi. Stačí přinést dobrou náladu, o všechno ostatní se postaráme.",

    "card.kdy.label": "Kdy",
    "card.kdy.text": "sobota 19. června 2027, obřad ve 14:00", // TODO Daniel: confirm ceremony time
    "card.kde.label": "Kde",
    "card.kde.text": "Stodola v Meruňkovém sadu, Dolní Kounice, Jihomoravský kraj",
    "card.kde.map1": "Mapy.com",
    "card.kde.map2": "Google Maps",

    "card.program.label": "Program",
    "card.program.item1": "14:00 &ndash; obřad", // TODO Daniel: confirm programme
    "card.program.item2": "15:00 &ndash; přípitek a focení",
    "card.program.item3": "17:00 &ndash; hostina",
    "card.program.item4": "20:00 &ndash; první tanec a zábava do rána",

    "card.dress.label": "Dress code",
    "card.dress.text": "Žádný nemáme. Přijďte v tom, v čem se vám dobře tančí.",

    "card.kids.label": "Děti",
    "card.kids.text": "Budeme rádi, když si tenhle den užijete naplno s námi a své ratolesti necháte doma v klidu vychillovat.",

    "card.gifts.label": "Dary",
    "card.gifts.text": "Největší radost nám uděláte příspěvkem do společné kasičky. Na místě najdete obálku i QR kód pro platbu.",

    "card.acc.label": "Ubytování",
    "card.acc.text": "Kdo chce, může přespat pod stanem přímo v sadu. Na konci večera zajistíme rozvoz do Brna a okolí.",

    "card.contact.label": "Kontakt",
    "card.contact.text": "S čímkoliv se na nás neváhejte obrátit:",

    "countdown.heading": "Odpočet do svatby",

    "rsvp.title": "Dejte nám vědět",
    "rsvp.deadline": "Odpovězte nám prosím do 30. 4. 2027.", // TODO Daniel: confirm RSVP deadline

    "rsvp.name": "Jméno",
    "rsvp.name.placeholder": "Jméno a příjmení",
    "rsvp.email": "E-mail",
    "rsvp.email.placeholder": "vas@email.cz",
    "rsvp.attending": "Přijdete?",
    "rsvp.yes": "Přijdu",
    "rsvp.no": "Bohužel nepřijdu",
    "rsvp.party": "Kdo přijde s vámi?",
    "rsvp.party.placeholder": "např. jméno partnera nebo partnerky",
    "rsvp.note": "Dotazy",
    "rsvp.note.placeholder": "Chcete se na něco zeptat? Napište nám.",
    "rsvp.submit": "Odeslat odpověď",

    "rsvp.err.name": "Zadejte prosím jméno (2–120 znaků).",
    "rsvp.err.email": "Zadejte prosím platný e-mail (max. 200 znaků).",
    "rsvp.err.attending": "Zvolte prosím, zda přijdete.",
    "rsvp.err.party": "Text je příliš dlouhý (max. 300 znaků).",
    "rsvp.err.note": "Text je příliš dlouhý (max. 1000 znaků).",
    "rsvp.err.summary": "Zkontrolujte prosím zvýrazněná pole.",
    "rsvp.err.captcha": "Ověření se nezdařilo, zkuste to prosím znovu.",

    "rsvp.sending": "Odesíláme…",
    "rsvp.fail": "Odpověď se nám nepodařilo odeslat.",
    "rsvp.fail.invalid": "Zkontrolujte prosím zadané údaje.",
    "rsvp.fail.mail": "Napište nám prosím e-mailem",
    "rsvp.mail.subject": "Svatba – odpověď",

    "rsvp.captcha.label": "Nejsem robot",
    "rsvp.captcha.verifying": "Ověřujeme…",
    "rsvp.captcha.verified": "Ověřeno",
    "rsvp.captcha.error": "Ověření se nezdařilo, zkuste to prosím znovu.",
    "rsvp.captcha.expired": "Platnost ověření vypršela, zkuste to prosím znovu.",
    "rsvp.captcha.wait": "Ještě ověřujeme, že nejste robot…",

    "rsvp.thanks.yes.title": "Děkujeme!",
    "rsvp.thanks.yes.text": "Moc se na vás těšíme 19. června 2027 ve Stodole v Meruňkovém sadu. Kdyby se něco změnilo, ozvěte se nám kdykoliv.",
    "rsvp.thanks.no.title": "Děkujeme za odpověď",
    "rsvp.thanks.no.text": "Je nám líto, že s námi neoslavíte, ale moc si vážíme, že jste nám dali vědět. Budeme na vás myslet.",

    "cd.d.one": "den",
    "cd.d.few": "dny",
    "cd.d.other": "dní",
    "cd.h.one": "hodina",
    "cd.h.few": "hodiny",
    "cd.h.other": "hodin",
    "cd.m.one": "minuta",
    "cd.m.few": "minuty",
    "cd.m.other": "minut",
    "cd.s.one": "sekunda",
    "cd.s.few": "sekundy",
    "cd.s.other": "sekund",
    "cd.apricots.one": "Neboli {n} meruňka, když si každou hodinu dáme jednu.",
    "cd.apricots.few": "Neboli {n} meruňky, když si každou hodinu dáme jednu.",
    "cd.apricots.other": "Neboli {n} meruněk, když si každou hodinu dáme jednu.",
    "cd.done": "Už jsme svoji!",

    "dary.demo": "Ukázka · zkuste posunout meruňku",
    "dary.title": "Kam až to dotáhneme?",
    "dary.intro": "Každá koruna ve svatební kasičce nás posune o kousek dál. Tady je náš velmi vážně míněný plán:",
    "dary.raised": "vybráno",
    "dary.slider.label": "Vybraná částka",
    "dary.previewTag": "náhled",
    "dary.none": "Zatím jen sen. Posuňte meruňku doprava.",
    "dary.nextLabel": "Další zastávka",
    "dary.reached": "Na tohle už máme",
    "dary.next": "Chybí ještě {amount}",
    "dary.beyond": "A pak už jen kočky až do konce života.",
    "dary.m1.title": "Škrabadlo, které kočky budou ignorovat",
    "dary.m1.text": "Stejně budou drápat gauč.",
    "dary.m2.title": "Kočičí pamlsky na rok",
    "dary.m2.text": "Aby kočka konečně přestala soudit náš životní styl.",
    "dary.m3.title": "Nové kostky na Pathfinder",
    "dary.m3.text": "Ty staré házely špatně. Vědecky dokázáno.",
    "dary.m4.title": "Sada na odlévání epoxidu",
    "dary.m4.text": "Pořádné formy a pryskyřice. Kuchyňský stůl si konečně oddychne.",
    "dary.m5.title": "Třetí kočka",
    "dary.m5.text": "Dvě kočky jsou přece pořád málo.",
    "dary.m6.title": "Zahradní sekačka",
    "dary.m6.text": "Aby sad nezarostl dřív, než v něm stihneme postavit stan.",
    "dary.m7.title": "Dílna, kde nebude všude pryskyřice",
    "dary.m7.text": "Brusky, frézy a místo pro všechny ty rozdělané projekty.",
    "dary.m8.title": "Týden u moře",
    "dary.m8.text": "Grilované ryby, slaná voda a dva spálené nosy.",
    "dary.m9.title": "Robotický vysavač na kočičí chlupy",
    "dary.m9.text": "Prohraje, ale bude bojovat statečně.",
    "dary.m10.title": "Meruňkový strom na zahradu",
    "dary.m10.text": "Vlastní meruňky. Jako dnes, jen menší.",
    "dary.m11.title": "Svatební cesta do Japonska",
    "dary.m11.text": "Tady to začíná být vážné.",
    "dary.m12.title": "Chata u Brna",
    "dary.m12.text": "Tedy… aspoň dveře.",
    "dary.m13.title": "Čtvrtá kočka",
    "dary.m13.text": "Tentokrát s rodokmenem. A omluvou sousedům.",
    "dary.m14.title": "Vířivka pod meruňkami",
    "dary.m14.text": "Kočky se budou tvářit dotčeně.",
    "dary.m15.title": "Svatba je zaplacená",
    "dary.m15.text": "Tuhle hostinu jste si právě zaplatili sami. Děkujeme!",
    "dary.m16.title": "…a k těm dveřím i zdi",
    "dary.m16.text": "Dveře už máme, teď ještě něco, co podrží střechu.",
    "dary.m17.title": "Vlastní vinice",
    "dary.m17.text": "Jeden řádek. Ale náš.",
    "dary.m18.title": "…a střecha",
    "dary.m18.text": "Aby na kočky nepršelo.",
    "dary.m19.title": "…a garáž na dílnu",
    "dary.m19.text": "Aby pryskyřice konečně opustila dům.",
    "dary.m20.title": "Chata u Brna. Celá.",
    "dary.m20.text": "I se sekačkou a všemi čtyřmi kočkami. Na dům to chce ještě pár milionů.",

    "dary.contribute.title": "Jak přispět",
    "dary.contribute.account": "Číslo účtu",
    "dary.contribute.copy": "Kopírovat",
    "dary.contribute.copied": "Zkopírováno!",
    "dary.contribute.envelope": "Obálky s darem jsou vítány i přímo na svatbě.",
    "dary.contribute.qrAlt": "QR kód pro platbu darem",
    "dary.live.toast": "Právě přibyl dar!",

    

    "footer.text": "Těšíme se na vás!",
    "footer.home": "raccoon.website",

    "locked.title": "Tato stránka je jen pro pozvané.",
    "locked.text": "Otevřete prosím odkaz, který jste od nás dostali.",
    "locked.back": "Zpět na raccoon.website"
  },

  en: {
    "meta.title": "Tereza & Daniel · Wedding Invitation",

    "lang.cs": "CS",
    "lang.en": "EN",
    "lang.fr": "FR",

    "hero.kicker": "Wedding announcement",
    "hero.date": "19 June 2027",
    "hero.place": "<span class=\"place-a\">Stodola v Meruňkovém sadu</span><span class=\"place-sep\"> · </span><span class=\"place-b\">Dolní Kounice, Czechia</span>",
    "hero.cta": "RSVP",
    "hero.scrollAria": "Scroll to the invitation",
    "hero.family": "The Nečesals",

    "card.greeting": "Dear ones,",
    "card.p1": "With joy in our hearts we're letting you know that we've decided to keep going together – this time as a married couple. It would mean the world to have you with us on this day.",
    "card.p2": "We'll spend a long summer day together under the apricot trees, with good food, good wine and the people we love. Just bring your good mood – we'll take care of everything else.",

    "card.kdy.label": "When",
    "card.kdy.text": "Saturday 19 June 2027, ceremony at 2:00 PM", // TODO Daniel: confirm ceremony time
    "card.kde.label": "Where",
    "card.kde.text": "Stodola v Meruňkovém sadu (a barn in an apricot orchard), Dolní Kounice, South Moravia, Czechia",
    "card.kde.map1": "Mapy.com",
    "card.kde.map2": "Google Maps",

    "card.program.label": "Programme",
    "card.program.item1": "2:00 PM &ndash; ceremony", // TODO Daniel: confirm programme
    "card.program.item2": "3:00 PM &ndash; toast &amp; photos",
    "card.program.item3": "5:00 PM &ndash; dinner",
    "card.program.item4": "8:00 PM &ndash; first dance &amp; party till dawn",

    "card.dress.label": "Dress code",
    "card.dress.text": "There isn't one. Come in whatever you can dance in comfortably.",

    "card.kids.label": "Kids",
    "card.kids.text": "We'd love for you to enjoy the day fully with us, so let the little ones have a relaxing night at home.",

    "card.gifts.label": "Gifts",
    "card.gifts.text": "The best gift would be a contribution to our shared kitty. You'll find an envelope and a QR code for payment on the day.",

    "card.acc.label": "Accommodation",
    "card.acc.text": "If you'd like, you can camp overnight right in the orchard. At the end of the evening we'll arrange a ride back to Brno and the surrounding area.",

    "card.contact.label": "Contact",
    "card.contact.text": "Reach out any time, about anything:",

    "countdown.heading": "Countdown to the wedding",

    "rsvp.title": "Let us know",
    "rsvp.deadline": "Please reply by 30 April 2027.", // TODO Daniel: confirm RSVP deadline

    "rsvp.name": "Name",
    "rsvp.name.placeholder": "First and last name",
    "rsvp.email": "E-mail",
    "rsvp.email.placeholder": "you@email.com",
    "rsvp.attending": "Will you attend?",
    "rsvp.yes": "I'll be there",
    "rsvp.no": "Sadly, I can't make it",
    "rsvp.party": "Who's coming with you?",
    "rsvp.party.placeholder": "e.g. your partner's name",
    "rsvp.note": "Questions",
    "rsvp.note.placeholder": "Got a question for us? Write it here.",
    "rsvp.submit": "Send reply",

    "rsvp.err.name": "Please enter a name (2–120 characters).",
    "rsvp.err.email": "Please enter a valid e-mail (max 200 characters).",
    "rsvp.err.attending": "Please choose whether you'll attend.",
    "rsvp.err.party": "That's too long (max 300 characters).",
    "rsvp.err.note": "That's too long (max 1000 characters).",
    "rsvp.err.summary": "Please check the highlighted fields.",
    "rsvp.err.captcha": "Verification failed, please try again.",

    "rsvp.sending": "Sending…",
    "rsvp.fail": "We couldn't send your reply.",
    "rsvp.fail.invalid": "Please check the details you entered.",
    "rsvp.fail.mail": "Please e-mail us instead",
    "rsvp.mail.subject": "Wedding RSVP",

    "rsvp.captcha.label": "I'm not a robot",
    "rsvp.captcha.verifying": "Verifying…",
    "rsvp.captcha.verified": "Verified",
    "rsvp.captcha.error": "Verification failed, please try again.",
    "rsvp.captcha.expired": "Verification expired, please try again.",
    "rsvp.captcha.wait": "We're still checking you're not a robot…",

    "rsvp.thanks.yes.title": "Thank you!",
    "rsvp.thanks.yes.text": "We can't wait to see you on 19 June 2027 at Stodola v Meruňkovém sadu. If anything changes, just reach out any time.",
    "rsvp.thanks.no.title": "Thanks for letting us know",
    "rsvp.thanks.no.text": "We're sorry you won't be celebrating with us, but we're really grateful you told us. We'll be thinking of you.",

    "cd.d.one": "day",
    "cd.d.few": "days",
    "cd.d.other": "days",
    "cd.h.one": "hour",
    "cd.h.few": "hours",
    "cd.h.other": "hours",
    "cd.m.one": "minute",
    "cd.m.few": "minutes",
    "cd.m.other": "minutes",
    "cd.s.one": "second",
    "cd.s.few": "seconds",
    "cd.s.other": "seconds",
    "cd.apricots.one": "Or {n} apricot, if we eat one every hour.",
    "cd.apricots.few": "Or {n} apricots, if we eat one every hour.",
    "cd.apricots.other": "Or {n} apricots, if we eat one every hour.",
    "cd.done": "We just got married!",

    "dary.demo": "Preview · try dragging the apricot",
    "dary.title": "How far can we take it?",
    "dary.intro": "Every crown in the wedding kitty gets us a little further. Here is our very seriously intended plan:",
    "dary.raised": "raised",
    "dary.slider.label": "Amount raised",
    "dary.previewTag": "preview",
    "dary.none": "Just a dream for now. Drag the apricot to the right.",
    "dary.nextLabel": "Next stop",
    "dary.reached": "Already covered",
    "dary.next": "{amount} to go",
    "dary.beyond": "After that, just cats for the rest of our lives.",
    "dary.m1.title": "A scratching post the cats will ignore",
    "dary.m1.text": "They'll claw the sofa anyway.",
    "dary.m2.title": "Cat treats for a year",
    "dary.m2.text": "So the cat finally stops judging our life choices.",
    "dary.m3.title": "New Pathfinder dice",
    "dary.m3.text": "The old ones rolled badly. Scientifically proven.",
    "dary.m4.title": "A proper resin-casting kit",
    "dary.m4.text": "Real moulds and resin. The kitchen table finally gets a break.",
    "dary.m5.title": "A third cat",
    "dary.m5.text": "Two cats is clearly still not enough.",
    "dary.m6.title": "A garden lawnmower",
    "dary.m6.text": "So the orchard doesn't grow wild before we even get the tent up.",
    "dary.m7.title": "A workshop without resin on everything",
    "dary.m7.text": "Sanders, routers, and room for every half-finished project.",
    "dary.m8.title": "A week by the sea",
    "dary.m8.text": "Grilled fish, salt water, and two sunburnt noses.",
    "dary.m9.title": "A robot vacuum for cat hair",
    "dary.m9.text": "It will lose, but it will fight bravely.",
    "dary.m10.title": "An apricot tree for the garden",
    "dary.m10.text": "Our own apricots. Just like today, only smaller.",
    "dary.m11.title": "Honeymoon in Japan",
    "dary.m11.text": "Okay, now this is getting serious.",
    "dary.m12.title": "A cabin near Brno",
    "dary.m12.text": "Well… at least the door.",
    "dary.m13.title": "A fourth cat",
    "dary.m13.text": "This one with a pedigree. And an apology to the neighbours.",
    "dary.m14.title": "A hot tub under the apricot trees",
    "dary.m14.text": "The cats will look thoroughly offended.",
    "dary.m15.title": "The wedding is paid for",
    "dary.m15.text": "You just paid for this whole party yourselves. Thank you!",
    "dary.m16.title": "…and some walls for that door",
    "dary.m16.text": "We have the door. Now something to hold up the roof.",
    "dary.m17.title": "Our own vineyard",
    "dary.m17.text": "One row. But ours.",
    "dary.m18.title": "…and a roof",
    "dary.m18.text": "So it doesn't rain on the cats.",
    "dary.m19.title": "…and a garage for the workshop",
    "dary.m19.text": "So the resin can finally leave the house.",
    "dary.m20.title": "The cabin near Brno. All of it.",
    "dary.m20.text": "Lawnmower and all four cats included. A real house will take a few more million.",

    "dary.contribute.title": "How to contribute",
    "dary.contribute.account": "Account number",
    "dary.contribute.copy": "Copy",
    "dary.contribute.copied": "Copied!",
    "dary.contribute.envelope": "Envelopes are welcome at the wedding too.",
    "dary.contribute.qrAlt": "QR code for a gift payment",
    "dary.live.toast": "A gift just arrived!",

    

    "footer.text": "We can't wait to see you!",
    "footer.home": "raccoon.website",

    "locked.title": "This page is for invited guests only.",
    "locked.text": "Please open the link you received from us.",
    "locked.back": "Back to raccoon.website"
  },

  fr: {
    "meta.title": "Tereza & Daniel · Faire-part de mariage",

    "lang.cs": "CS",
    "lang.en": "EN",
    "lang.fr": "FR",

    "hero.kicker": "Faire-part de mariage",
    "hero.date": "19 juin 2027",
    "hero.place": "<span class=\"place-a\">Stodola v Meruňkovém sadu</span><span class=\"place-sep\"> · </span><span class=\"place-b\">Dolní Kounice, Tchéquie</span>",
    "hero.cta": "Répondre",
    "hero.scrollAria": "Faire défiler vers le faire-part",
    "hero.family": "Les Nečesal",

    "card.greeting": "Chers proches,",
    "card.p1": "C'est avec le cœur rempli de joie que nous vous annonçons notre décision de poursuivre notre chemin ensemble – cette fois en tant qu'époux. Votre présence à nos côtés en ce jour nous honorerait profondément.",
    "card.p2": "Nous passerons ensemble une longue journée d'été sous les abricotiers, avec de bons plats, du bon vin et les personnes que nous aimons. Apportez simplement votre bonne humeur – nous nous occupons du reste.",

    "card.kdy.label": "Quand",
    "card.kdy.text": "samedi 19 juin 2027, cérémonie à 14 h 00", // TODO Daniel: confirm ceremony time
    "card.kde.label": "Où",
    "card.kde.text": "Stodola v Meruňkovém sadu (une grange dans un verger d'abricotiers), Dolní Kounice, Moravie du Sud, Tchéquie",
    "card.kde.map1": "Mapy.com",
    "card.kde.map2": "Google Maps",

    "card.program.label": "Programme",
    "card.program.item1": "14 h 00 &ndash; cérémonie", // TODO Daniel: confirm programme
    "card.program.item2": "15 h 00 &ndash; toast et photos",
    "card.program.item3": "17 h 00 &ndash; dîner",
    "card.program.item4": "20 h 00 &ndash; ouverture du bal et fête jusqu'au matin",

    "card.dress.label": "Tenue",
    "card.dress.text": "Aucun. Venez dans une tenue qui vous permette de danser à l'aise.",

    "card.kids.label": "Enfants",
    "card.kids.text": "Nous serions ravis que vous profitiez pleinement de cette journée avec nous — laissez donc vos bambins passer une soirée tranquille à la maison.",

    "card.gifts.label": "Cadeaux",
    "card.gifts.text": "Le plus beau des cadeaux sera une contribution à notre cagnotte commune. Vous trouverez sur place une enveloppe et un QR code pour régler.",

    "card.acc.label": "Hébergement",
    "card.acc.text": "Si vous le souhaitez, vous pourrez dormir sous tente directement dans le verger. En fin de soirée, nous organiserons des navettes vers Brno et ses environs.",

    "card.contact.label": "Contact",
    "card.contact.text": "N'hésitez pas à nous contacter, pour quoi que ce soit :",

    "countdown.heading": "Compte à rebours avant le mariage",

    "rsvp.title": "Faites-nous signe",
    "rsvp.deadline": "Merci de nous répondre avant le 30 avril 2027.", // TODO Daniel: confirm RSVP deadline

    "rsvp.name": "Nom",
    "rsvp.name.placeholder": "Prénom et nom",
    "rsvp.email": "E-mail",
    "rsvp.email.placeholder": "vous@email.fr",
    "rsvp.attending": "Serez-vous présent ?",
    "rsvp.yes": "Je serai présent(e)",
    "rsvp.no": "Malheureusement, je ne pourrai pas venir",
    "rsvp.party": "Qui vous accompagnera ?",
    "rsvp.party.placeholder": "p. ex. le prénom de votre conjoint(e)",
    "rsvp.note": "Questions",
    "rsvp.note.placeholder": "Une question pour nous ? Écrivez-la ici.",
    "rsvp.submit": "Envoyer la réponse",

    "rsvp.err.name": "Merci d'indiquer un nom (2 à 120 caractères).",
    "rsvp.err.email": "Merci d'indiquer une adresse e-mail valide (200 caractères maximum).",
    "rsvp.err.attending": "Merci de préciser si vous serez présent.",
    "rsvp.err.party": "C'est trop long (300 caractères maximum).",
    "rsvp.err.note": "C'est trop long (1000 caractères maximum).",
    "rsvp.err.summary": "Merci de vérifier les champs surlignés.",
    "rsvp.err.captcha": "La vérification a échoué, veuillez réessayer.",

    "rsvp.sending": "Envoi en cours…",
    "rsvp.fail": "Nous n'avons pas réussi à envoyer votre réponse.",
    "rsvp.fail.invalid": "Merci de vérifier les informations saisies.",
    "rsvp.fail.mail": "Merci de nous écrire par e-mail",
    "rsvp.mail.subject": "Mariage – réponse",

    "rsvp.captcha.label": "Je ne suis pas un robot",
    "rsvp.captcha.verifying": "Vérification…",
    "rsvp.captcha.verified": "Vérifié",
    "rsvp.captcha.error": "Échec de la vérification, veuillez réessayer.",
    "rsvp.captcha.expired": "La vérification a expiré, veuillez réessayer.",
    "rsvp.captcha.wait": "Nous vérifions encore que vous n'êtes pas un robot…",

    "rsvp.thanks.yes.title": "Merci !",
    "rsvp.thanks.yes.text": "Nous avons hâte de vous voir le 19 juin 2027 à Stodola v Meruňkovém sadu. Si quoi que ce soit change, n'hésitez pas à nous contacter à tout moment.",
    "rsvp.thanks.no.title": "Merci de nous avoir répondu",
    "rsvp.thanks.no.text": "Nous sommes désolés que vous ne puissiez pas célébrer avec nous, mais nous vous sommes très reconnaissants de nous avoir prévenus. Nous penserons à vous.",

    "cd.d.one": "jour",
    "cd.d.few": "jours",
    "cd.d.other": "jours",
    "cd.h.one": "heure",
    "cd.h.few": "heures",
    "cd.h.other": "heures",
    "cd.m.one": "minute",
    "cd.m.few": "minutes",
    "cd.m.other": "minutes",
    "cd.s.one": "seconde",
    "cd.s.few": "secondes",
    "cd.s.other": "secondes",
    "cd.apricots.one": "Soit {n} abricot, si nous en mangeons un par heure.",
    "cd.apricots.few": "Soit {n} abricots, si nous en mangeons un par heure.",
    "cd.apricots.other": "Soit {n} abricots, si nous en mangeons un par heure.",
    "cd.done": "Nous sommes mariés !",

    "dary.demo": "Aperçu · essayez de faire glisser l'abricot",
    "dary.title": "Jusqu'où irons-nous ?",
    "dary.intro": "Chaque couronne dans la cagnotte de mariage nous fait avancer un peu plus. Voici notre plan, très sérieusement envisagé :",
    "dary.raised": "collectés",
    "dary.slider.label": "Montant collecté",
    "dary.previewTag": "aperçu",
    "dary.none": "Pour l'instant, ce n'est qu'un rêve. Faites glisser l'abricot vers la droite.",
    "dary.nextLabel": "Prochaine étape",
    "dary.reached": "Déjà financé",
    "dary.next": "Encore {amount}",
    "dary.beyond": "Après ça, plus que des chats jusqu'à la fin de nos jours.",
    "dary.m1.title": "Un griffoir que les chats ignoreront",
    "dary.m1.text": "Ils grifferont le canapé quand même.",
    "dary.m2.title": "Des friandises pour chat pendant un an",
    "dary.m2.text": "Pour que le chat arrête enfin de juger notre mode de vie.",
    "dary.m3.title": "De nouveaux dés pour Pathfinder",
    "dary.m3.text": "Les anciens tombaient mal. Scientifiquement prouvé.",
    "dary.m4.title": "Un vrai kit de moulage en résine",
    "dary.m4.text": "De vrais moules et de la résine. La table de cuisine va enfin souffler.",
    "dary.m5.title": "Un troisième chat",
    "dary.m5.text": "Deux chats, ça reste clairement insuffisant.",
    "dary.m6.title": "Une tondeuse de jardin",
    "dary.m6.text": "Pour que le verger ne soit pas envahi avant même qu'on ait monté la tente.",
    "dary.m7.title": "Un atelier sans résine partout",
    "dary.m7.text": "Ponceuses, défonceuses, et de la place pour tous les projets en cours.",
    "dary.m8.title": "Une semaine au bord de la mer",
    "dary.m8.text": "Poisson grillé, eau salée et deux nez coup de soleil.",
    "dary.m9.title": "Un aspirateur robot pour les poils de chat",
    "dary.m9.text": "Il perdra, mais il se battra courageusement.",
    "dary.m10.title": "Un abricotier au jardin",
    "dary.m10.text": "Nos propres abricots. Comme aujourd'hui, en plus petit.",
    "dary.m11.title": "Voyage de noces au Japon",
    "dary.m11.text": "Là, ça commence à devenir sérieux.",
    "dary.m12.title": "Un chalet près de Brno",
    "dary.m12.text": "Enfin… au moins la porte.",
    "dary.m13.title": "Un quatrième chat",
    "dary.m13.text": "Celui-ci avec pedigree. Et des excuses aux voisins.",
    "dary.m14.title": "Un jacuzzi sous les abricotiers",
    "dary.m14.text": "Les chats prendront un air profondément vexé.",
    "dary.m15.title": "Le mariage est payé",
    "dary.m15.text": "Vous venez de payer cette fête vous-mêmes. Merci !",
    "dary.m16.title": "…et des murs pour cette porte",
    "dary.m16.text": "On a la porte. Maintenant il faut de quoi tenir le toit.",
    "dary.m17.title": "Notre propre vigne",
    "dary.m17.text": "Un seul rang. Mais à nous.",
    "dary.m18.title": "…et un toit",
    "dary.m18.text": "Pour qu'il ne pleuve pas sur les chats.",
    "dary.m19.title": "…et un garage pour l'atelier",
    "dary.m19.text": "Pour que la résine quitte enfin la maison.",
    "dary.m20.title": "Le chalet près de Brno. En entier.",
    "dary.m20.text": "Tondeuse et quatre chats compris. Pour une vraie maison, il faudra encore quelques millions.",

    "dary.contribute.title": "Comment participer",
    "dary.contribute.account": "Numéro de compte",
    "dary.contribute.copy": "Copier",
    "dary.contribute.copied": "Copié !",
    "dary.contribute.envelope": "Les enveloppes sont aussi les bienvenues le jour du mariage.",
    "dary.contribute.qrAlt": "QR code pour un don",
    "dary.live.toast": "Un cadeau vient d'arriver !",

    

    "footer.text": "Nous avons hâte de vous voir !",
    "footer.home": "raccoon.website",

    "locked.title": "Cette page est réservée aux invités.",
    "locked.text": "Merci d'ouvrir le lien que vous avez reçu de notre part.",
    "locked.back": "Retour à raccoon.website"
  }
};
