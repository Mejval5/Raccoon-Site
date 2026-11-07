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
    "hero.cta": "Informace",
    "hero.scrollAria": "Přejít na pozvánku",
    "hero.family": "Nečesalovi",

    "card.greeting": "Milí naši,",
    "card.p1": "máme pro vás novinku: bereme se! A moc bychom si přáli, abyste u toho byli s námi.",
    "card.p2": "Čeká nás krásný letní den pod meruňkami: dobré jídlo, pití, hudba a lidi, které máme rádi. Vy přivezte dobrou náladu, o zbytek se postaráme.",

    "card.kdy.label": "Kdy",
    "card.kdy.text": "sobota 19. června 2027, obřad v 11:00",
    "card.kde.label": "Kde",
    "card.kde.text": "Stodola v Meruňkovém sadu, Dolní Kounice, Jihomoravský kraj",
    "card.kde.map1": "Mapy.com",
    "card.kde.map2": "Google Maps",

    "card.program.label": "Program",
    "card.program.text": "V 11:00 si řekneme ano, ve 12:00 si spolu sedneme k obědu. A pak? Bude program, do kterého se můžete zapojit, a k tomu další aktivity, ke kterým se dostanete, pokud budete mít náladu. Potom taneční parket, DJ a skvělá hudba.",


    "card.dress.label": "Dress code",
    "card.dress.text": "Žádný nemáme. Přijďte v tom, v čem se cítíte dobře. Pánové, oblek nechte doma a pojďte víc nalehko. Dámy, kolem stodoly je trávník, tak myslete na vhodnou obuv.",

    "card.kids.label": "Děti",
    "card.kids.text": "Jestli se vám podaří sehnat hlídání, využijte ho a užijte si celý den naplno, od obřadu až po poslední tanec. Žádný zákaz to ale není: když to jinak nejde, děti klidně přibalte, budou vítané.",

    "card.gifts.label": "Dary",
    "card.gifts.text": "Největší radost nám uděláte příspěvkem na stavbu domečku. Na místě bude krabička na obálky i QR kód, ten najdete už tady níže.",

    "card.acc.label": "Ubytování",
    "card.acc.text": "Kdo chce, může přespat pod stanem přímo v sadu.",

    "card.contact.label": "Kontakt",
    "card.contact.text": "S čímkoliv se nám klidně ozvěte:",
    "card.cta": "Potvrdit účast",

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

    "rsvp.err.name": "Zadejte prosím jméno (2 až 120 znaků).",
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
    "rsvp.mail.subject": "Svatba: odpověď",

    "rsvp.captcha.label": "Nejsem robot",
    "rsvp.captcha.verifying": "Ověřujeme…",
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

    "dary.title": "Kam až to dotáhneme?",
    "dary.intro": "Každá koruna ve svatební kasičce nás posune o políčko dál. Tady je náš velmi vážně míněný plán, úroveň po úrovni:",
    "dary.nextLabel": "Další zastávka",
    "dary.reached": "Na tohle už máme",
    "dary.beyond": "A pak už jen kočky až do konce života.",
    "dary.l1.title": "Škrabadlo, které kočky budou ignorovat",
    "dary.l1.text": "Stejně budou drápat gauč.",
    "dary.l2.title": "Nové kostky na Pathfinder",
    "dary.l2.text": "Ty staré házely špatně. Vědecky dokázáno.",
    "dary.l3.title": "Třetí kočka",
    "dary.l3.text": "Dvě kočky jsou přece pořád málo.",
    "dary.l4.title": "Sada na odlévání epoxidu",
    "dary.l4.text": "Pořádné formy a pryskyřice. Kuchyňský stůl si konečně oddychne.",
    "dary.l5.title": "Robotický vysavač na kočičí chlupy",
    "dary.l5.text": "Prohraje, ale bude bojovat statečně.",
    "dary.l6.title": "Meruňkový strom na zahradu",
    "dary.l6.text": "Vlastní meruňky. Jako dnes, jen menší.",
    "dary.l7.title": "Svatební cesta do Japonska",
    "dary.l7.text": "Tady to začíná být vážné.",
    "dary.l8.title": "Vířivka pod meruňkami",
    "dary.l8.text": "Kočky se budou tvářit dotčeně.",
    "dary.l9.title": "Vlastní vinice",
    "dary.l9.text": "Jeden řádek. Ale náš.",
    "dary.l10.title": "Vlastní dům",
    "dary.l10.text": "Se zahradou, dílnou a všemi kočkami. Tady náš plán končí. Zatím.",
    "dary.level": "Úroveň {n}",
    "dary.done": "Splněno",
    "dary.backToNow": "Zpět, kde jsme teď",
    "dary.path.label": "Cesta za dary, úroveň po úrovni",
    "dary.hint": "Posouvejte cestou a prozkoumejte, co nás čeká dál.",
    "dary.status": "Splněno {done} z {total}. Další zastávka: {title}",
    "dary.statusAll": "Splněno všech {total} úrovní.",

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
    "hero.cta": "Details",
    "hero.scrollAria": "Scroll to the invitation",
    "hero.family": "The Nečesals",

    "card.greeting": "Dear all,",
    "card.p1": "we have news: we're getting married! And we'd love you to be there with us.",
    "card.p2": "A beautiful summer day under the apricot trees is waiting for us: good food, drinks, music and the people we love. You bring the good mood, we'll take care of the rest.",

    "card.kdy.label": "When",
    "card.kdy.text": "Saturday 19 June 2027, ceremony at 11:00",
    "card.kde.label": "Where",
    "card.kde.text": "Stodola v Meruňkovém sadu (the Barn in the Apricot Orchard), Dolní Kounice, South Moravia",
    "card.kde.map1": "Mapy.com",
    "card.kde.map2": "Google Maps",

    "card.program.label": "Programme",
    "card.program.text": "At 11:00 we say \"I do\", and at 12:00 we all sit down to lunch. After that there's a programme you can join in with, plus other things to do if you're in the mood. Then the dance floor, a DJ and great music.",


    "card.dress.label": "Dress code",
    "card.dress.text": "There isn't one. Come in whatever you feel good in. Gents, leave the suit at home and dress light. Ladies, there's a lawn around the barn, so choose your shoes with that in mind.",

    "card.kids.label": "Children",
    "card.kids.text": "If you can find a babysitter, do, and enjoy the whole day to the full, from the ceremony to the last dance. It isn't a ban, though: if there's no other way, bring the kids along, they'll be welcome.",

    "card.gifts.label": "Gifts",
    "card.gifts.text": "The best gift would be a contribution towards building our little house. On the day there'll be a box for envelopes and a QR code, which you'll also find further down this page.",

    "card.acc.label": "Accommodation",
    "card.acc.text": "If you like, you can camp overnight right in the orchard.",

    "card.contact.label": "Contact",
    "card.contact.text": "Whatever you need, just get in touch:",
    "card.cta": "RSVP",

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

    "rsvp.err.name": "Please enter a name (2 to 120 characters).",
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

    "dary.title": "How far can we take it?",
    "dary.intro": "Every crown in the wedding kitty moves us one more step along. Here is our very seriously intended plan, level by level:",
    "dary.nextLabel": "Next stop",
    "dary.reached": "Already covered",
    "dary.beyond": "After that, just cats for the rest of our lives.",
    "dary.l1.title": "A scratching post the cats will ignore",
    "dary.l1.text": "They'll claw the sofa anyway.",
    "dary.l2.title": "New Pathfinder dice",
    "dary.l2.text": "The old ones rolled badly. Scientifically proven.",
    "dary.l3.title": "A third cat",
    "dary.l3.text": "Two cats is clearly still not enough.",
    "dary.l4.title": "A proper resin-casting kit",
    "dary.l4.text": "Real moulds and resin. The kitchen table finally gets a break.",
    "dary.l5.title": "A robot vacuum for cat hair",
    "dary.l5.text": "It will lose, but it will fight bravely.",
    "dary.l6.title": "An apricot tree for the garden",
    "dary.l6.text": "Our own apricots. Just like today, only smaller.",
    "dary.l7.title": "Honeymoon in Japan",
    "dary.l7.text": "Okay, now this is getting serious.",
    "dary.l8.title": "A hot tub under the apricot trees",
    "dary.l8.text": "The cats will look thoroughly offended.",
    "dary.l9.title": "Our own vineyard",
    "dary.l9.text": "One row. But ours.",
    "dary.l10.title": "A house of our own",
    "dary.l10.text": "With a garden, a workshop and all the cats. This is where the plan ends. For now.",
    "dary.level": "Level {n}",
    "dary.done": "Done",
    "dary.backToNow": "Back to where we are",
    "dary.path.label": "The gift path, level by level",
    "dary.hint": "Scroll along the path to explore what's still ahead.",
    "dary.status": "{done} of {total} levels done. Next stop: {title}",
    "dary.statusAll": "All {total} levels done.",

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
    "hero.cta": "Infos",
    "hero.scrollAria": "Faire défiler vers le faire-part",
    "hero.family": "Les Nečesal",

    "card.greeting": "Chers tous,",
    "card.p1": "on a une nouvelle à vous annoncer : on se marie ! Et on aimerait beaucoup que vous soyez là avec nous.",
    "card.p2": "Une belle journée d'été nous attend sous les abricotiers : de bons plats, à boire, de la musique et les gens qu'on aime. Apportez votre bonne humeur, on s'occupe du reste.",

    "card.kdy.label": "Quand",
    "card.kdy.text": "samedi 19 juin 2027, cérémonie à 11 h",
    "card.kde.label": "Où",
    "card.kde.text": "Stodola v Meruňkovém sadu (la Grange du verger d'abricotiers), Dolní Kounice, Moravie-du-Sud",
    "card.kde.map1": "Mapy.com",
    "card.kde.map2": "Google Maps",

    "card.program.label": "Programme",
    "card.program.text": "À 11 h, on se dit oui ; à 12 h, on passe tous à table. Ensuite ? Un programme auquel vous pouvez participer, et d'autres activités si le cœur vous en dit. Puis la piste de danse, un DJ et de la bonne musique.",


    "card.dress.label": "Dress code",
    "card.dress.text": "Il n'y en a pas. Venez dans une tenue où vous vous sentez bien. Messieurs, laissez le costume à la maison et venez en plus léger. Mesdames, il y a de la pelouse autour de la grange, pensez-y pour vos chaussures.",

    "card.kids.label": "Enfants",
    "card.kids.text": "Si vous trouvez une baby-sitter, profitez-en et savourez toute la journée, de la cérémonie à la dernière danse. Ce n'est pas une interdiction pour autant : si vous n'avez pas le choix, venez avec les enfants, ils seront les bienvenus.",

    "card.gifts.label": "Cadeaux",
    "card.gifts.text": "Le plus beau cadeau serait une contribution à la construction de notre petite maison. Sur place, il y aura une boîte pour les enveloppes et un QR code, que vous trouverez aussi plus bas sur cette page.",

    "card.acc.label": "Hébergement",
    "card.acc.text": "Si vous le souhaitez, vous pouvez dormir sous tente directement dans le verger.",

    "card.contact.label": "Contact",
    "card.contact.text": "Pour n'importe quelle question, écrivez-nous :",
    "card.cta": "Répondre",

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
    "rsvp.mail.subject": "Mariage : réponse",

    "rsvp.captcha.label": "Je ne suis pas un robot",
    "rsvp.captcha.verifying": "Vérification…",
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

    "dary.title": "Jusqu'où irons-nous ?",
    "dary.intro": "Chaque couronne dans la cagnotte de mariage nous fait avancer d'une case. Voici notre plan, très sérieusement envisagé, niveau par niveau :",
    "dary.nextLabel": "Prochaine étape",
    "dary.reached": "Déjà financé",
    "dary.beyond": "Après ça, plus que des chats jusqu'à la fin de nos jours.",
    "dary.l1.title": "Un griffoir que les chats ignoreront",
    "dary.l1.text": "Ils grifferont le canapé quand même.",
    "dary.l2.title": "De nouveaux dés pour Pathfinder",
    "dary.l2.text": "Les anciens tombaient mal. Scientifiquement prouvé.",
    "dary.l3.title": "Un troisième chat",
    "dary.l3.text": "Deux chats, ça reste clairement insuffisant.",
    "dary.l4.title": "Un vrai kit de moulage en résine",
    "dary.l4.text": "De vrais moules et de la résine. La table de cuisine va enfin souffler.",
    "dary.l5.title": "Un aspirateur robot pour les poils de chat",
    "dary.l5.text": "Il perdra, mais il se battra courageusement.",
    "dary.l6.title": "Un abricotier au jardin",
    "dary.l6.text": "Nos propres abricots. Comme aujourd'hui, en plus petit.",
    "dary.l7.title": "Voyage de noces au Japon",
    "dary.l7.text": "Là, ça commence à devenir sérieux.",
    "dary.l8.title": "Un jacuzzi sous les abricotiers",
    "dary.l8.text": "Les chats prendront un air profondément vexé.",
    "dary.l9.title": "Notre propre vigne",
    "dary.l9.text": "Un seul rang. Mais à nous.",
    "dary.l10.title": "Une maison à nous",
    "dary.l10.text": "Avec un jardin, un atelier et tous les chats. C'est là que le plan s'arrête. Pour l'instant.",
    "dary.level": "Niveau {n}",
    "dary.done": "Atteint",
    "dary.backToNow": "Revenir où nous en sommes",
    "dary.path.label": "Le chemin des cadeaux, niveau par niveau",
    "dary.hint": "Faites défiler le chemin pour découvrir la suite.",
    "dary.status": "{done} niveaux atteints sur {total}. Prochaine étape : {title}",
    "dary.statusAll": "Les {total} niveaux sont atteints.",

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
