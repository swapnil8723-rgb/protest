// The About and Privacy pages in every language (src/components/InfoPage.astro renders them).
// Privacy lists what the site really collects: change it together with worker/report.ts,
// worker/promo.ts, src/scripts/live.ts or the analytics setup, and bump INFO_UPDATED.
// Placeholders: {email} {publisher} {how} {privacy} {add} {kryvault} are links,
// {countries} = countries tracked, {min} = RULES.minPublishers.
import type { Lang } from './index.ts';

export type InfoKey = 'about' | 'privacy';
export interface InfoSection {
  id: string;
  h: string;
  p?: string[]; // HTML
  list?: string[]; // HTML
  after?: string[]; // HTML, below the list
}
export interface InfoContent {
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  intro: string;
  sections: InfoSection[];
  updated: string; // label before the date
}

/** The day a person last checked each page against what the site does. */
export const INFO_UPDATED: Record<InfoKey, string> = { about: '2026-11-11', privacy: '2026-11-11' };

const en: Record<InfoKey, InfoContent> = {
  about: {
    title: 'About LOUD: who runs the protest tracker and how it works',
    description: 'LOUD (protesttracker.online) is an independent protest tracker published by FinTrack AI Solutions. Who runs it, how pages are made, how it is paid for and how to reach us.',
    eyebrow: 'Who is behind this',
    h1: 'About LOUD',
    intro: 'LOUD is an independent, neutral tracker of protests, strikes and demonstrations. Every page says why people are protesting, what they want, how the authorities answered and whether it is still on, with a link to every source. It started in October 2026 and follows {countries} countries in six languages.',
    sections: [
      {
        id: 'who',
        h: 'Who runs LOUD',
        p: [
          'LOUD is built, run and paid for by {publisher}, a company that makes websites and automation software.',
          'LOUD is not connected to any government, political party, campaign group or protest organiser. We do not organise, promote or oppose any protest.',
        ],
      },
      {
        id: 'how',
        h: 'How pages are made',
        p: [
          'LOUD is produced by software, and we say so plainly. A program reads news reports every 4 hours. An AI model writes a short, original summary only when at least {min} independent newsrooms report the same protest. Fixed rules, not the AI, set the status, the confidence score and Serious Mode.',
          'We maintain those rules, answer correction requests and take down anything that breaks them. The full method, the confidence formula and what we can miss are on {how}.',
        ],
      },
      {
        id: 'standards',
        h: 'What we hold ourselves to',
        list: [
          '<strong>Neutral wording.</strong> The protesters’ demands and the official response, each with its sources.',
          '<strong>City-level places only.</strong> No meeting points, routes or live movement.',
          '<strong>No names or faces</strong> of ordinary participants, or of people who were hurt, detained or killed.',
          '<strong>Original text only.</strong> We link to the reporting and never copy articles or photos.',
          '<strong>No jokes when people are hurt.</strong> Those pages switch to a calm grey layout.',
        ],
      },
      {
        id: 'funding',
        h: 'How LOUD is paid for',
        p: [
          'LOUD is free to read. Its publisher pays for it. The bar at the bottom of some pages promotes {kryvault}, a product from the same owner; it never shows on Serious pages or on the report form.',
          'LOUD has no other advertisers, sponsors or outside funders, and nobody can pay to add, change or remove a protest.',
        ],
      },
      {
        id: 'contact',
        h: 'Corrections and contact',
        p: [
          'Found an error, or are you named on a page and want that changed? Email {email} with the page link. We fix confirmed errors quickly, and the page’s "updated" time changes when we do.',
          'The same address is for press, data and privacy questions. What we collect is on {privacy}.',
        ],
      },
    ],
    updated: 'Last checked',
  },
  privacy: {
    title: 'Privacy: what LOUD collects and what it does not',
    description: 'LOUD has no accounts, no cookies and no ad tracking. What our visit counts, the report form and email collect, who handles it, and your rights.',
    eyebrow: 'The short version: very little',
    h1: 'Privacy',
    intro: 'You can read LOUD without an account, and we set no cookies. This page lists everything that is collected when you use protesttracker.online, why, and who handles it.',
    sections: [
      {
        id: 'who',
        h: 'Who is responsible',
        p: ['LOUD is published by {publisher}, which decides how the data described here is used. Questions and requests go to {email}.'],
      },
      {
        id: 'reading',
        h: 'When you read the site',
        list: [
          '<strong>No cookies, no accounts, no advertising trackers.</strong> We do not build profiles, and we do not sell or share data for advertising.',
          '<strong>Visit counts.</strong> We use Cloudflare Web Analytics. It loads a small script from Cloudflare and records the page, the site you came from, your country, browser and device type, and how fast the page loaded. It sets no cookies and does not follow you across sites.',
          '<strong>Server logs.</strong> The site is hosted on Cloudflare. Like every web host, it processes your IP address and browser details to deliver pages and stop attacks. We do not use these logs to identify readers.',
          '<strong>Two settings saved in your browser.</strong> Light or dark theme, and whether you closed the KryVault bar (remembered for 30 days). They stay on your device and are not sent to us.',
          '<strong>The KryVault bar.</strong> A click or a close adds one to a daily total per country. No IP address, cookie or ID is stored with it. KryVault is a separate site with its own privacy policy.',
          '<strong>Fonts and maps</strong> come from our own domain, not from other companies.',
        ],
      },
      {
        id: 'report',
        h: 'When you add a protest',
        p: ['The form on {add} does not ask for your name, email or phone number. Please do not put personal details about yourself or anyone else in it.'],
        list: [
          'What you type (headline, city, date, why, demands, organisers and an optional link) is kept in a private database on Cloudflare until it has been checked, usually within a few hours, and is then deleted from that inbox.',
          'To limit how many reports one person can send in a day, we keep a short one-way code made from your IP address. It changes every day and is deleted with the report. We do not keep the IP address itself.',
          'An AI service (currently Google’s Gemini) checks the report and rewrites it in neutral words. If it passes, the rewritten text and your link are shown publicly, labelled as an unverified reader report. Your own wording is not published.',
          'Reports that mention deaths, injuries or arrests stay hidden until newsrooms confirm them. Reader reports that newsrooms never confirm leave the site after the protest ends.',
        ],
      },
      {
        id: 'email',
        h: 'When you email us',
        p: ['We receive your email address and what you write, and use them only to answer you and correct the site. Mail to our address is passed on by Cloudflare to our mailbox.'],
      },
      {
        id: 'people',
        h: 'People named on protest pages',
        p: [
          'LOUD summarises published news reports. Our rule is to name only organisations, parties, elected officials and official spokespeople, never ordinary participants or people who were hurt, detained or killed.',
          'If you find your name on LOUD and think it should not be there, email {email} with the page link. We will review it quickly.',
        ],
      },
      {
        id: 'processors',
        h: 'Who handles the data',
        list: [
          '<strong>Cloudflare:</strong> hosting, visit counts, the report inbox and mail forwarding.',
          '<strong>GitHub:</strong> stores the site’s code and the published protest data, and runs the program that builds them.',
          '<strong>Google (Gemini):</strong> writes summaries from news reports and checks reader reports.',
        ],
        after: ['These companies may process data outside your country, including in the United States. We do not sell personal data.'],
      },
      {
        id: 'rights',
        h: 'Your rights',
        p: ['We hold almost nothing that identifies you. If you have emailed us, or believe a page contains your personal data, you can ask for a copy, a correction or deletion at {email}; we answer within 30 days. If you live in the EU or the UK, you can also object to the processing and complain to your data protection authority.'],
      },
      {
        id: 'changes',
        h: 'Changes',
        p: ['If what we collect changes, we update this page and the date below.'],
      },
    ],
    updated: 'Last updated',
  },
};

const fr: Record<InfoKey, InfoContent> = {
  about: {
    title: 'À propos de LOUD : qui gère ce suivi des manifestations et comment il fonctionne',
    description: 'LOUD (protesttracker.online) est un suivi indépendant des manifestations, publié par FinTrack AI Solutions. Qui le gère, comment les pages sont faites, qui paie et comment nous écrire.',
    eyebrow: 'Qui est derrière',
    h1: 'À propos de LOUD',
    intro: 'LOUD est un suivi indépendant et neutre des manifestations, des grèves et des rassemblements. Chaque page dit pourquoi les gens manifestent, ce qu’ils demandent, ce que les autorités ont répondu et si c’est toujours en cours, avec un lien vers chaque source. Le site a démarré en octobre 2026 et suit {countries} pays en six langues.',
    sections: [
      {
        id: 'who',
        h: 'Qui gère LOUD',
        p: [
          'LOUD est conçu, géré et financé par {publisher}, une entreprise qui crée des sites web et des logiciels d’automatisation.',
          'LOUD n’est lié à aucun gouvernement, parti politique, groupe militant ou organisateur de manifestation. Nous n’organisons, ne soutenons et ne combattons aucune manifestation.',
        ],
      },
      {
        id: 'how',
        h: 'Comment les pages sont faites',
        p: [
          'LOUD est produit par un logiciel, et nous le disons clairement. Un programme lit la presse toutes les 4 heures. Un modèle d’IA rédige un court résumé original seulement quand au moins {min} rédactions indépendantes rapportent la même manifestation. Des règles fixes, et non l’IA, décident du statut, du score de confiance et du Mode sérieux.',
          'Nous tenons ces règles à jour, répondons aux demandes de correction et retirons tout ce qui les enfreint. La méthode complète, la formule de confiance et ce qui peut nous échapper sont sur {how}.',
        ],
      },
      {
        id: 'standards',
        h: 'Ce que nous nous imposons',
        list: [
          '<strong>Des mots neutres.</strong> Les demandes des manifestants et la réponse officielle, chacune avec ses sources.',
          '<strong>La ville, pas plus précis.</strong> Ni point de rendez-vous, ni parcours, ni déplacement en direct.',
          '<strong>Ni noms ni visages</strong> des participants ordinaires, ni des personnes blessées, arrêtées ou tuées.',
          '<strong>Du texte original uniquement.</strong> Nous renvoyons vers les articles ; nous ne copions ni texte ni photo.',
          '<strong>Pas de blague quand des gens sont blessés.</strong> Ces pages passent à une mise en page grise et sobre.',
        ],
      },
      {
        id: 'funding',
        h: 'Qui paie LOUD',
        p: [
          'LOUD est gratuit. C’est son éditeur qui le finance. La barre en bas de certaines pages fait la promotion de {kryvault}, un produit du même propriétaire ; elle n’apparaît jamais sur les pages en Mode sérieux ni sur le formulaire de signalement.',
          'LOUD n’a aucun autre annonceur, sponsor ou financeur extérieur, et personne ne peut payer pour ajouter, modifier ou retirer une manifestation.',
        ],
      },
      {
        id: 'contact',
        h: 'Corrections et contact',
        p: [
          'Tu as repéré une erreur, ou ton nom figure sur une page et tu veux que cela change ? Écris à {email} avec le lien de la page. On corrige vite les erreurs vérifiées, et l’heure de « mise à jour » de la page change quand on le fait.',
          'La même adresse sert pour la presse, les données et la vie privée. Ce que nous collectons est détaillé sur {privacy}.',
        ],
      },
    ],
    updated: 'Dernière vérification',
  },
  privacy: {
    title: 'Confidentialité : ce que LOUD collecte, et ce qu’il ne collecte pas',
    description: 'LOUD n’a ni compte, ni cookie, ni traceur publicitaire. Ce que collectent la mesure d’audience, le formulaire et les e-mails, qui traite ces données, et tes droits.',
    eyebrow: 'En bref : très peu de choses',
    h1: 'Confidentialité',
    intro: 'Tu peux lire LOUD sans compte, et nous ne déposons aucun cookie. Cette page liste tout ce qui est collecté quand tu utilises protesttracker.online, pourquoi, et qui s’en occupe.',
    sections: [
      {
        id: 'who',
        h: 'Qui est responsable',
        p: ['LOUD est publié par {publisher}, qui décide de l’usage des données décrites ici. Questions et demandes : {email}.'],
      },
      {
        id: 'reading',
        h: 'Quand tu lis le site',
        list: [
          '<strong>Ni cookies, ni comptes, ni traceurs publicitaires.</strong> Nous ne créons pas de profils, et nous ne vendons ni ne partageons de données à des fins publicitaires.',
          '<strong>Mesure d’audience.</strong> Nous utilisons Cloudflare Web Analytics. Il charge un petit script depuis Cloudflare et enregistre la page, le site d’où tu viens, ton pays, ton navigateur et ton type d’appareil, ainsi que la vitesse de chargement. Il ne dépose aucun cookie et ne te suit pas d’un site à l’autre.',
          '<strong>Journaux du serveur.</strong> Le site est hébergé chez Cloudflare. Comme tout hébergeur, il traite ton adresse IP et les informations de ton navigateur pour afficher les pages et bloquer les attaques. Nous n’utilisons pas ces journaux pour identifier les lecteurs.',
          '<strong>Deux réglages gardés dans ton navigateur.</strong> Le thème clair ou sombre, et le fait d’avoir fermé la barre KryVault (retenu 30 jours). Ils restent sur ton appareil et ne nous sont pas envoyés.',
          '<strong>La barre KryVault.</strong> Un clic ou une fermeture ajoute un au total du jour pour ton pays. Aucune adresse IP, aucun cookie ni identifiant n’est enregistré avec. KryVault est un site distinct, avec sa propre politique de confidentialité.',
          '<strong>Les polices et les cartes</strong> viennent de notre propre domaine, pas d’autres entreprises.',
        ],
      },
      {
        id: 'report',
        h: 'Quand tu ajoutes une manifestation',
        p: ['Le formulaire sur {add} ne demande ni ton nom, ni ton e-mail, ni ton numéro de téléphone. N’y mets pas d’informations personnelles, sur toi ou sur quelqu’un d’autre.'],
        list: [
          'Ce que tu écris (titre, ville, date, raisons, demandes, organisateurs et un lien facultatif) est gardé dans une base privée chez Cloudflare jusqu’à sa vérification, en général quelques heures, puis supprimé de cette boîte.',
          'Pour limiter le nombre de signalements par personne et par jour, nous gardons un court code à sens unique calculé à partir de ton adresse IP. Il change chaque jour et il est supprimé avec le signalement. Nous ne gardons pas l’adresse IP elle-même.',
          'Un service d’IA (actuellement Gemini, de Google) vérifie le signalement et le réécrit en termes neutres. S’il passe, le texte réécrit et ton lien sont affichés publiquement, avec la mention « signalement de lecteur non vérifié ». Ta formulation d’origine n’est pas publiée.',
          'Les signalements qui parlent de morts, de blessés ou d’arrestations restent masqués tant que des rédactions ne les confirment pas. Ceux que les rédactions ne confirment jamais quittent le site une fois la manifestation terminée.',
        ],
      },
      {
        id: 'email',
        h: 'Quand tu nous écris',
        p: ['Nous recevons ton adresse e-mail et ton message, et nous ne nous en servons que pour te répondre et corriger le site. Les messages envoyés à notre adresse sont transmis par Cloudflare à notre boîte.'],
      },
      {
        id: 'people',
        h: 'Les personnes nommées sur les pages',
        p: [
          'LOUD résume des articles de presse déjà publiés. Notre règle : ne nommer que des organisations, des partis, des élus et des porte-parole officiels, jamais des participants ordinaires ni des personnes blessées, arrêtées ou tuées.',
          'Si tu trouves ton nom sur LOUD et que tu penses qu’il ne devrait pas y être, écris à {email} avec le lien de la page. Nous regarderons vite.',
        ],
      },
      {
        id: 'processors',
        h: 'Qui traite les données',
        list: [
          '<strong>Cloudflare :</strong> hébergement, mesure d’audience, boîte des signalements et transfert des e-mails.',
          '<strong>GitHub :</strong> stocke le code du site et les données publiées sur les manifestations, et fait tourner le programme qui les produit.',
          '<strong>Google (Gemini) :</strong> rédige les résumés à partir des articles et vérifie les signalements des lecteurs.',
        ],
        after: ['Ces entreprises peuvent traiter des données hors de ton pays, notamment aux États-Unis. Nous ne vendons aucune donnée personnelle.'],
      },
      {
        id: 'rights',
        h: 'Tes droits',
        p: ['Nous ne détenons presque rien qui t’identifie. Si tu nous as écrit, ou si tu penses qu’une page contient tes données personnelles, tu peux en demander une copie, la correction ou la suppression à {email} ; nous répondons sous 30 jours. Si tu vis dans l’UE ou au Royaume-Uni, tu peux aussi t’opposer au traitement et saisir ton autorité de protection des données (la CNIL en France).'],
      },
      {
        id: 'changes',
        h: 'Modifications',
        p: ['Si ce que nous collectons change, nous mettons à jour cette page et la date ci-dessous.'],
      },
    ],
    updated: 'Dernière mise à jour',
  },
};

const de: Record<InfoKey, InfoContent> = {
  about: {
    title: 'Über LOUD: Wer den Protest-Tracker betreibt und wie er arbeitet',
    description: 'LOUD (protesttracker.online) ist ein unabhängiger Protest-Tracker von FinTrack AI Solutions. Wer ihn betreibt, wie die Seiten entstehen, wer bezahlt und wie du uns erreichst.',
    eyebrow: 'Wer dahintersteht',
    h1: 'Über LOUD',
    intro: 'LOUD ist ein unabhängiger, neutraler Tracker für Proteste, Streiks und Demos. Jede Seite sagt, warum Menschen protestieren, was sie fordern, wie die Behörden reagiert haben und ob es noch läuft, mit einem Link zu jeder Quelle. LOUD ist im Oktober 2026 gestartet und verfolgt {countries} Länder in sechs Sprachen.',
    sections: [
      {
        id: 'who',
        h: 'Wer LOUD betreibt',
        p: [
          'LOUD wird von {publisher} entwickelt, betrieben und bezahlt, einem Unternehmen, das Websites und Automatisierungssoftware baut.',
          'LOUD ist mit keiner Regierung, Partei, Kampagnengruppe und keinem Protestveranstalter verbunden. Wir organisieren, bewerben oder bekämpfen keinen Protest.',
        ],
      },
      {
        id: 'how',
        h: 'Wie die Seiten entstehen',
        p: [
          'LOUD wird von Software erstellt, und das sagen wir offen. Ein Programm liest alle 4 Stunden Nachrichten. Ein KI-Modell schreibt nur dann eine kurze, eigene Zusammenfassung, wenn mindestens {min} unabhängige Redaktionen über denselben Protest berichten. Feste Regeln, nicht die KI, bestimmen Status, Vertrauenswert und den Ernst-Modus.',
          'Wir pflegen diese Regeln, beantworten Korrekturwünsche und nehmen herunter, was gegen sie verstößt. Die ganze Methode, die Formel für den Vertrauenswert und was uns entgehen kann, stehen unter {how}.',
        ],
      },
      {
        id: 'standards',
        h: 'Woran wir uns halten',
        list: [
          '<strong>Neutrale Sprache.</strong> Die Forderungen der Protestierenden und die offizielle Reaktion, jeweils mit Quellen.',
          '<strong>Nur die Stadt.</strong> Keine Treffpunkte, Routen oder Live-Bewegungen.',
          '<strong>Keine Namen oder Gesichter</strong> von gewöhnlichen Teilnehmenden oder von Menschen, die verletzt, festgenommen oder getötet wurden.',
          '<strong>Nur eigener Text.</strong> Wir verlinken die Berichte und kopieren weder Artikel noch Fotos.',
          '<strong>Keine Witze, wenn Menschen zu Schaden kommen.</strong> Diese Seiten wechseln in ein ruhiges, graues Layout.',
        ],
      },
      {
        id: 'funding',
        h: 'Wer LOUD bezahlt',
        p: [
          'LOUD ist kostenlos. Der Herausgeber bezahlt es. Die Leiste am unteren Rand mancher Seiten wirbt für {kryvault}, ein Produkt desselben Inhabers; auf Seiten im Ernst-Modus und im Meldeformular erscheint sie nie.',
          'LOUD hat keine anderen Werbekunden, Sponsoren oder Geldgeber, und niemand kann dafür bezahlen, dass ein Protest hinzugefügt, geändert oder entfernt wird.',
        ],
      },
      {
        id: 'contact',
        h: 'Korrekturen und Kontakt',
        p: [
          'Fehler entdeckt, oder steht dein Name auf einer Seite und du möchtest das ändern? Schreib an {email} mit dem Link zur Seite. Wir korrigieren bestätigte Fehler schnell, und die „aktualisiert“-Zeit der Seite ändert sich dann.',
          'Dieselbe Adresse gilt für Presse-, Daten- und Datenschutzanfragen. Was wir erheben, steht unter {privacy}.',
        ],
      },
    ],
    updated: 'Zuletzt geprüft',
  },
  privacy: {
    title: 'Datenschutz: Was LOUD erhebt und was nicht',
    description: 'LOUD hat keine Konten, keine Cookies und kein Werbe-Tracking. Was Besuchszählung, Meldeformular und E-Mail erfassen, wer die Daten verarbeitet und welche Rechte du hast.',
    eyebrow: 'Kurz gesagt: sehr wenig',
    h1: 'Datenschutz',
    intro: 'Du kannst LOUD ohne Konto lesen, und wir setzen keine Cookies. Diese Seite listet alles auf, was bei der Nutzung von protesttracker.online erfasst wird, warum, und wer damit umgeht.',
    sections: [
      {
        id: 'who',
        h: 'Wer verantwortlich ist',
        p: ['LOUD wird von {publisher} herausgegeben. Das Unternehmen entscheidet, wie die hier beschriebenen Daten verwendet werden. Fragen und Anträge: {email}.'],
      },
      {
        id: 'reading',
        h: 'Wenn du die Seite liest',
        list: [
          '<strong>Keine Cookies, keine Konten, keine Werbe-Tracker.</strong> Wir erstellen keine Profile und verkaufen oder teilen keine Daten für Werbung.',
          '<strong>Besuchszählung.</strong> Wir nutzen Cloudflare Web Analytics. Es lädt ein kleines Skript von Cloudflare und erfasst die Seite, die Website, von der du kommst, dein Land, Browser und Gerätetyp sowie die Ladezeit. Es setzt keine Cookies und verfolgt dich nicht über mehrere Websites.',
          '<strong>Server-Protokolle.</strong> Die Seite liegt bei Cloudflare. Wie jeder Webhoster verarbeitet Cloudflare deine IP-Adresse und Browserangaben, um Seiten auszuliefern und Angriffe abzuwehren. Wir nutzen diese Protokolle nicht, um Leserinnen und Leser zu identifizieren.',
          '<strong>Zwei Einstellungen in deinem Browser.</strong> Helles oder dunkles Design, und ob du die KryVault-Leiste geschlossen hast (30 Tage gemerkt). Sie bleiben auf deinem Gerät und werden nicht an uns gesendet.',
          '<strong>Die KryVault-Leiste.</strong> Ein Klick oder das Schließen erhöht eine Tagessumme pro Land um eins. Dabei wird keine IP-Adresse, kein Cookie und keine Kennung gespeichert. KryVault ist eine eigene Website mit eigener Datenschutzerklärung.',
          '<strong>Schriften und Karten</strong> kommen von unserer eigenen Domain, nicht von anderen Unternehmen.',
        ],
      },
      {
        id: 'report',
        h: 'Wenn du einen Protest meldest',
        p: ['Das Formular unter {add} fragt nicht nach Name, E-Mail oder Telefonnummer. Bitte trag dort keine persönlichen Angaben über dich oder andere ein.'],
        list: [
          'Was du eingibst (Überschrift, Stadt, Datum, Gründe, Forderungen, Veranstalter und ein freiwilliger Link), liegt in einer privaten Datenbank bei Cloudflare, bis es geprüft ist, meist innerhalb weniger Stunden, und wird dann aus diesem Eingang gelöscht.',
          'Um die Zahl der Meldungen pro Person und Tag zu begrenzen, speichern wir einen kurzen Einweg-Code, der aus deiner IP-Adresse berechnet wird. Er wechselt täglich und wird mit der Meldung gelöscht. Die IP-Adresse selbst speichern wir nicht.',
          'Ein KI-Dienst (derzeit Gemini von Google) prüft die Meldung und formuliert sie neutral um. Besteht sie die Prüfung, werden der neue Text und dein Link öffentlich gezeigt, gekennzeichnet als ungeprüfte Lesermeldung. Dein eigener Wortlaut wird nicht veröffentlicht.',
          'Meldungen über Tote, Verletzte oder Festnahmen bleiben verborgen, bis Redaktionen sie bestätigen. Lesermeldungen, die keine Redaktion bestätigt, verschwinden nach dem Ende des Protests von der Seite.',
        ],
      },
      {
        id: 'email',
        h: 'Wenn du uns schreibst',
        p: ['Wir erhalten deine E-Mail-Adresse und deine Nachricht und nutzen beides nur, um dir zu antworten und die Seite zu korrigieren. E-Mails an unsere Adresse leitet Cloudflare an unser Postfach weiter.'],
      },
      {
        id: 'people',
        h: 'Menschen, die auf Protestseiten genannt werden',
        p: [
          'LOUD fasst veröffentlichte Nachrichten zusammen. Unsere Regel: Wir nennen nur Organisationen, Parteien, gewählte Amtsträger und offizielle Sprecher, nie gewöhnliche Teilnehmende oder Menschen, die verletzt, festgenommen oder getötet wurden.',
          'Wenn du deinen Namen auf LOUD findest und meinst, er gehöre dort nicht hin, schreib an {email} mit dem Link zur Seite. Wir prüfen das schnell.',
        ],
      },
      {
        id: 'processors',
        h: 'Wer die Daten verarbeitet',
        list: [
          '<strong>Cloudflare:</strong> Hosting, Besuchszählung, Eingang für Meldungen und E-Mail-Weiterleitung.',
          '<strong>GitHub:</strong> speichert den Code der Seite und die veröffentlichten Protestdaten und führt das Programm aus, das sie erstellt.',
          '<strong>Google (Gemini):</strong> schreibt Zusammenfassungen aus Nachrichten und prüft Lesermeldungen.',
        ],
        after: ['Diese Unternehmen können Daten außerhalb deines Landes verarbeiten, auch in den USA. Wir verkaufen keine personenbezogenen Daten.'],
      },
      {
        id: 'rights',
        h: 'Deine Rechte',
        p: ['Wir haben fast nichts, was dich identifiziert. Wenn du uns geschrieben hast oder meinst, dass eine Seite deine personenbezogenen Daten enthält, kannst du unter {email} eine Kopie, eine Berichtigung oder die Löschung verlangen; wir antworten innerhalb von 30 Tagen. Wenn du in der EU oder im Vereinigten Königreich lebst, kannst du der Verarbeitung außerdem widersprechen und dich bei deiner Datenschutzbehörde beschweren.'],
      },
      {
        id: 'changes',
        h: 'Änderungen',
        p: ['Wenn sich ändert, was wir erheben, aktualisieren wir diese Seite und das Datum unten.'],
      },
    ],
    updated: 'Zuletzt aktualisiert',
  },
};

const es: Record<InfoKey, InfoContent> = {
  about: {
    title: 'Sobre LOUD: quién lleva el rastreador de protestas y cómo funciona',
    description: 'LOUD (protesttracker.online) es un rastreador de protestas independiente, publicado por FinTrack AI Solutions. Quién lo lleva, cómo se hacen las páginas, quién lo paga y cómo escribirnos.',
    eyebrow: 'Quién está detrás',
    h1: 'Sobre LOUD',
    intro: 'LOUD es un rastreador independiente y neutral de protestas, huelgas y manifestaciones. Cada página dice por qué protesta la gente, qué pide, qué respondieron las autoridades y si sigue en marcha, con un enlace a cada fuente. Empezó en octubre de 2026 y sigue {countries} países en seis idiomas.',
    sections: [
      {
        id: 'who',
        h: 'Quién lleva LOUD',
        p: [
          'LOUD lo crea, lo mantiene y lo paga {publisher}, una empresa que hace sitios web y software de automatización.',
          'LOUD no está vinculado a ningún gobierno, partido político, grupo de campaña ni organizador de protestas. No organizamos, promovemos ni combatimos ninguna protesta.',
        ],
      },
      {
        id: 'how',
        h: 'Cómo se hacen las páginas',
        p: [
          'LOUD lo produce un programa, y lo decimos claramente. Un programa lee las noticias cada 4 horas. Un modelo de IA escribe un resumen breve y original solo cuando al menos {min} redacciones independientes informan de la misma protesta. Unas reglas fijas, y no la IA, deciden el estado, la puntuación de confianza y el Modo serio.',
          'Mantenemos esas reglas, respondemos a las peticiones de corrección y retiramos lo que las incumpla. El método completo, la fórmula de confianza y lo que se nos puede escapar están en {how}.',
        ],
      },
      {
        id: 'standards',
        h: 'A qué nos comprometemos',
        list: [
          '<strong>Lenguaje neutral.</strong> Las demandas de los manifestantes y la respuesta oficial, cada una con sus fuentes.',
          '<strong>Solo la ciudad.</strong> Sin puntos de encuentro, recorridos ni movimientos en directo.',
          '<strong>Sin nombres ni caras</strong> de participantes corrientes, ni de personas heridas, detenidas o fallecidas.',
          '<strong>Solo texto original.</strong> Enlazamos a las noticias y nunca copiamos artículos ni fotos.',
          '<strong>Sin bromas cuando hay personas heridas.</strong> Esas páginas pasan a un diseño gris y sobrio.',
        ],
      },
      {
        id: 'funding',
        h: 'Quién paga LOUD',
        p: [
          'LOUD es gratis. Lo paga su editor. La barra al pie de algunas páginas promociona {kryvault}, un producto del mismo propietario; nunca aparece en las páginas en Modo serio ni en el formulario de avisos.',
          'LOUD no tiene otros anunciantes, patrocinadores ni financiadores externos, y nadie puede pagar para añadir, cambiar o quitar una protesta.',
        ],
      },
      {
        id: 'contact',
        h: 'Correcciones y contacto',
        p: [
          '¿Has visto un error, o tu nombre aparece en una página y quieres que se cambie? Escribe a {email} con el enlace de la página. Corregimos rápido los errores verificados, y la hora de "actualizado" de la página cambia cuando lo hacemos.',
          'La misma dirección sirve para prensa, datos y privacidad. Lo que recogemos está en {privacy}.',
        ],
      },
    ],
    updated: 'Última revisión',
  },
  privacy: {
    title: 'Privacidad: qué recoge LOUD y qué no',
    description: 'LOUD no tiene cuentas, cookies ni rastreo publicitario. Qué recogen el recuento de visitas, el formulario de avisos y el correo, quién trata los datos y cuáles son tus derechos.',
    eyebrow: 'En pocas palabras: muy poco',
    h1: 'Privacidad',
    intro: 'Puedes leer LOUD sin cuenta, y no ponemos cookies. Esta página enumera todo lo que se recoge cuando usas protesttracker.online, por qué, y quién lo gestiona.',
    sections: [
      {
        id: 'who',
        h: 'Quién es el responsable',
        p: ['LOUD lo publica {publisher}, que decide cómo se usan los datos descritos aquí. Preguntas y solicitudes: {email}.'],
      },
      {
        id: 'reading',
        h: 'Cuando lees el sitio',
        list: [
          '<strong>Sin cookies, sin cuentas, sin rastreadores publicitarios.</strong> No creamos perfiles, y no vendemos ni compartimos datos con fines publicitarios.',
          '<strong>Recuento de visitas.</strong> Usamos Cloudflare Web Analytics. Carga un pequeño script desde Cloudflare y registra la página, el sitio desde el que llegas, tu país, navegador y tipo de dispositivo, y la velocidad de carga. No pone cookies ni te sigue de un sitio a otro.',
          '<strong>Registros del servidor.</strong> El sitio está alojado en Cloudflare. Como cualquier alojamiento web, trata tu dirección IP y los datos de tu navegador para servir las páginas y frenar ataques. No usamos esos registros para identificar a los lectores.',
          '<strong>Dos ajustes guardados en tu navegador.</strong> El tema claro u oscuro, y si cerraste la barra de KryVault (se recuerda 30 días). Se quedan en tu dispositivo y no se nos envían.',
          '<strong>La barra de KryVault.</strong> Un clic o un cierre suma uno a un total diario por país. No se guarda con ello ninguna dirección IP, cookie ni identificador. KryVault es un sitio aparte, con su propia política de privacidad.',
          '<strong>Las fuentes y los mapas</strong> salen de nuestro propio dominio, no de otras empresas.',
        ],
      },
      {
        id: 'report',
        h: 'Cuando añades una protesta',
        p: ['El formulario de {add} no pide tu nombre, correo ni teléfono. Por favor, no escribas en él datos personales tuyos ni de otras personas.'],
        list: [
          'Lo que escribes (titular, ciudad, fecha, motivos, demandas, organizadores y un enlace opcional) se guarda en una base de datos privada en Cloudflare hasta que se revisa, normalmente en unas horas, y después se borra de esa bandeja.',
          'Para limitar cuántos avisos puede enviar una persona al día, guardamos un código corto e irreversible calculado a partir de tu dirección IP. Cambia cada día y se borra junto con el aviso. No guardamos la dirección IP.',
          'Un servicio de IA (actualmente Gemini, de Google) revisa el aviso y lo reescribe con palabras neutrales. Si pasa, el texto reescrito y tu enlace se muestran públicamente, con la etiqueta de aviso de lector sin verificar. Tu redacción original no se publica.',
          'Los avisos que mencionan muertes, heridos o detenciones permanecen ocultos hasta que las redacciones los confirman. Los avisos que ninguna redacción confirma salen del sitio cuando la protesta termina.',
        ],
      },
      {
        id: 'email',
        h: 'Cuando nos escribes',
        p: ['Recibimos tu dirección de correo y tu mensaje, y solo los usamos para responderte y corregir el sitio. Cloudflare reenvía a nuestro buzón el correo que llega a nuestra dirección.'],
      },
      {
        id: 'people',
        h: 'Personas nombradas en las páginas',
        p: [
          'LOUD resume noticias ya publicadas. Nuestra regla es nombrar solo a organizaciones, partidos, cargos electos y portavoces oficiales, nunca a participantes corrientes ni a personas heridas, detenidas o fallecidas.',
          'Si encuentras tu nombre en LOUD y crees que no debería estar, escribe a {email} con el enlace de la página. Lo revisaremos pronto.',
        ],
      },
      {
        id: 'processors',
        h: 'Quién trata los datos',
        list: [
          '<strong>Cloudflare:</strong> alojamiento, recuento de visitas, bandeja de avisos y reenvío de correo.',
          '<strong>GitHub:</strong> guarda el código del sitio y los datos publicados de las protestas, y ejecuta el programa que los genera.',
          '<strong>Google (Gemini):</strong> escribe los resúmenes a partir de las noticias y revisa los avisos de lectores.',
        ],
        after: ['Estas empresas pueden tratar datos fuera de tu país, también en Estados Unidos. No vendemos datos personales.'],
      },
      {
        id: 'rights',
        h: 'Tus derechos',
        p: ['Casi no tenemos nada que te identifique. Si nos has escrito, o crees que una página contiene tus datos personales, puedes pedir una copia, una corrección o el borrado en {email}; respondemos en un plazo de 30 días. Si vives en la UE o en el Reino Unido, también puedes oponerte al tratamiento y reclamar ante tu autoridad de protección de datos.'],
      },
      {
        id: 'changes',
        h: 'Cambios',
        p: ['Si cambia lo que recogemos, actualizamos esta página y la fecha de abajo.'],
      },
    ],
    updated: 'Última actualización',
  },
};

const hi: Record<InfoKey, InfoContent> = {
  about: {
    title: 'LOUD के बारे में: यह प्रोटेस्ट ट्रैकर कौन चलाता है और कैसे काम करता है',
    description: 'LOUD (protesttracker.online) एक स्वतंत्र प्रोटेस्ट ट्रैकर है, जिसे FinTrack AI Solutions प्रकाशित करता है। इसे कौन चलाता है, पेज कैसे बनते हैं, ख़र्च कौन उठाता है और हमसे संपर्क कैसे करें।',
    eyebrow: 'इसके पीछे कौन है',
    h1: 'LOUD के बारे में',
    intro: 'LOUD विरोध प्रदर्शनों, हड़तालों और धरनों का एक स्वतंत्र और निष्पक्ष ट्रैकर है। हर पेज बताता है कि लोग क्यों विरोध कर रहे हैं, क्या चाहते हैं, प्रशासन ने क्या जवाब दिया और क्या यह अब भी जारी है, और हर बात के साथ स्रोत का लिंक होता है। यह अक्टूबर 2026 में शुरू हुआ और छह भाषाओं में {countries} देशों पर नज़र रखता है।',
    sections: [
      {
        id: 'who',
        h: 'LOUD कौन चलाता है',
        p: [
          'LOUD को {publisher} ने बनाया है, वही इसे चलाती है और इसका ख़र्च उठाती है। यह एक कंपनी है जो वेबसाइट और ऑटोमेशन सॉफ़्टवेयर बनाती है।',
          'LOUD का किसी सरकार, राजनीतिक दल, अभियान समूह या प्रदर्शन के आयोजक से कोई संबंध नहीं है। हम किसी प्रदर्शन का आयोजन, प्रचार या विरोध नहीं करते।',
        ],
      },
      {
        id: 'how',
        h: 'पेज कैसे बनते हैं',
        p: [
          'LOUD को सॉफ़्टवेयर तैयार करता है, और हम यह साफ़ बताते हैं। एक प्रोग्राम हर 4 घंटे में ख़बरें पढ़ता है। AI मॉडल छोटा, मौलिक सार तभी लिखता है जब कम से कम {min} स्वतंत्र न्यूज़रूम उसी प्रदर्शन की ख़बर दें। स्थिति, भरोसे का स्कोर और गंभीर मोड तय नियमों से तय होते हैं, AI से नहीं।',
          'हम इन नियमों को सँभालते हैं, सुधार के अनुरोधों का जवाब देते हैं और नियम तोड़ने वाली हर चीज़ हटाते हैं। पूरा तरीका, भरोसे का फ़ॉर्मूला और हमसे क्या छूट सकता है, यह सब {how} पर है।',
        ],
      },
      {
        id: 'standards',
        h: 'हम किन बातों का पालन करते हैं',
        list: [
          '<strong>निष्पक्ष भाषा।</strong> प्रदर्शनकारियों की माँगें और आधिकारिक जवाब, दोनों अपने स्रोतों के साथ।',
          '<strong>सिर्फ़ शहर का नाम।</strong> इकट्ठा होने की जगह, रास्ता या लाइव हलचल नहीं।',
          '<strong>कोई नाम या चेहरा नहीं</strong> आम प्रदर्शनकारियों का, या घायल, हिरासत में लिए गए या मारे गए लोगों का।',
          '<strong>सिर्फ़ मौलिक पाठ।</strong> हम ख़बरों का लिंक देते हैं; लेख या तस्वीरें कभी कॉपी नहीं करते।',
          '<strong>जब लोग घायल हों तो कोई मज़ाक नहीं।</strong> ऐसे पेज शांत, स्लेटी लेआउट में दिखते हैं।',
        ],
      },
      {
        id: 'funding',
        h: 'LOUD का ख़र्च कौन उठाता है',
        p: [
          'LOUD पढ़ना मुफ़्त है। इसका ख़र्च इसका प्रकाशक उठाता है। कुछ पेजों के नीचे की पट्टी {kryvault} का प्रचार करती है, जो उसी मालिक का उत्पाद है; यह गंभीर मोड वाले पेजों और रिपोर्ट फ़ॉर्म पर कभी नहीं दिखती।',
          'LOUD का कोई और विज्ञापनदाता, प्रायोजक या बाहरी फ़ंड देने वाला नहीं है, और कोई भी पैसे देकर कोई प्रदर्शन जुड़वा, बदलवा या हटवा नहीं सकता।',
        ],
      },
      {
        id: 'contact',
        h: 'सुधार और संपर्क',
        p: [
          'कोई ग़लती दिखी, या किसी पेज पर आपका नाम है और आप उसे बदलवाना चाहते हैं? पेज के लिंक के साथ {email} पर ईमेल करें। हम पुष्ट ग़लतियाँ जल्दी ठीक करते हैं, और तब पेज का "अपडेट" समय बदल जाता है।',
          'प्रेस, डेटा और निजता से जुड़े सवालों के लिए भी यही पता है। हम क्या जानकारी लेते हैं, यह {privacy} पर है।',
        ],
      },
    ],
    updated: 'पिछली जाँच',
  },
  privacy: {
    title: 'गोपनीयता: LOUD क्या जानकारी लेता है और क्या नहीं',
    description: 'LOUD में कोई अकाउंट, कुकी या विज्ञापन ट्रैकिंग नहीं है। विज़िट की गिनती, रिपोर्ट फ़ॉर्म और ईमेल से क्या जानकारी मिलती है, उसे कौन सँभालता है, और आपके अधिकार।',
    eyebrow: 'संक्षेप में: बहुत कम',
    h1: 'गोपनीयता',
    intro: 'आप बिना अकाउंट के LOUD पढ़ सकते हैं, और हम कोई कुकी नहीं लगाते। यह पेज बताता है कि protesttracker.online इस्तेमाल करने पर क्या-क्या जानकारी ली जाती है, क्यों, और उसे कौन सँभालता है।',
    sections: [
      {
        id: 'who',
        h: 'ज़िम्मेदार कौन है',
        p: ['LOUD को {publisher} प्रकाशित करती है, और वही तय करती है कि यहाँ बताई गई जानकारी का उपयोग कैसे हो। सवाल और अनुरोध: {email}।'],
      },
      {
        id: 'reading',
        h: 'जब आप साइट पढ़ते हैं',
        list: [
          '<strong>कोई कुकी, अकाउंट या विज्ञापन ट्रैकर नहीं।</strong> हम प्रोफ़ाइल नहीं बनाते, और विज्ञापन के लिए डेटा न बेचते हैं, न साझा करते हैं।',
          '<strong>विज़िट की गिनती।</strong> हम Cloudflare Web Analytics इस्तेमाल करते हैं। यह Cloudflare से एक छोटी स्क्रिप्ट लोड करता है और पेज, आप जिस साइट से आए, आपका देश, ब्राउज़र और डिवाइस का प्रकार, और पेज खुलने की गति दर्ज करता है। यह कोई कुकी नहीं लगाता और अलग-अलग साइटों पर आपका पीछा नहीं करता।',
          '<strong>सर्वर लॉग।</strong> साइट Cloudflare पर होस्ट है। हर वेब होस्ट की तरह, वह पेज पहुँचाने और हमले रोकने के लिए आपका IP पता और ब्राउज़र की जानकारी प्रोसेस करता है। हम इन लॉग से पाठकों की पहचान नहीं करते।',
          '<strong>आपके ब्राउज़र में सहेजी दो सेटिंग।</strong> हल्की या गहरी थीम, और आपने KryVault की पट्टी बंद की या नहीं (30 दिन याद रहती है)। ये आपके डिवाइस पर रहती हैं और हमें नहीं भेजी जातीं।',
          '<strong>KryVault की पट्टी।</strong> क्लिक करने या बंद करने पर देश के हिसाब से दिन के कुल योग में एक जुड़ता है। इसके साथ कोई IP पता, कुकी या आईडी नहीं रखी जाती। KryVault एक अलग साइट है और उसकी अपनी गोपनीयता नीति है।',
          '<strong>फ़ॉन्ट और नक़्शे</strong> हमारे अपने डोमेन से आते हैं, दूसरी कंपनियों से नहीं।',
        ],
      },
      {
        id: 'report',
        h: 'जब आप कोई प्रदर्शन जोड़ते हैं',
        p: ['{add} का फ़ॉर्म आपका नाम, ईमेल या फ़ोन नंबर नहीं माँगता। कृपया इसमें अपनी या किसी और की निजी जानकारी न लिखें।'],
        list: [
          'आप जो लिखते हैं (शीर्षक, शहर, तारीख़, कारण, माँगें, आयोजक और वैकल्पिक लिंक) वह जाँच होने तक Cloudflare के एक निजी डेटाबेस में रहता है, आम तौर पर कुछ घंटे, और फिर उस इनबॉक्स से मिटा दिया जाता है।',
          'एक व्यक्ति दिन में कितनी रिपोर्ट भेज सकता है, यह सीमित करने के लिए हम आपके IP पते से बना एक छोटा, एकतरफ़ा कोड रखते हैं। यह हर दिन बदलता है और रिपोर्ट के साथ मिट जाता है। हम IP पता नहीं रखते।',
          'एक AI सेवा (फ़िलहाल Google की Gemini) रिपोर्ट जाँचती है और उसे निष्पक्ष शब्दों में दोबारा लिखती है। जाँच में पास होने पर दोबारा लिखा गया पाठ और आपका लिंक सार्वजनिक रूप से दिखते हैं, "पाठक की रिपोर्ट, अभी पुष्टि नहीं" के लेबल के साथ। आपके अपने शब्द प्रकाशित नहीं होते।',
          'जिन रिपोर्टों में मौत, चोट या गिरफ़्तारी की बात हो, वे तब तक छिपी रहती हैं जब तक न्यूज़रूम पुष्टि न करें। जिन रिपोर्टों की न्यूज़रूम कभी पुष्टि नहीं करते, वे प्रदर्शन ख़त्म होने के बाद साइट से हट जाती हैं।',
        ],
      },
      {
        id: 'email',
        h: 'जब आप हमें ईमेल करते हैं',
        p: ['हमें आपका ईमेल पता और आपका संदेश मिलता है, और हम इनका उपयोग सिर्फ़ आपको जवाब देने और साइट सुधारने के लिए करते हैं। हमारे पते पर आया मेल Cloudflare हमारे मेलबॉक्स तक पहुँचाता है।'],
      },
      {
        id: 'people',
        h: 'प्रदर्शन के पेजों पर जिन लोगों के नाम हैं',
        p: [
          'LOUD प्रकाशित ख़बरों का सार देता है। हमारा नियम है कि सिर्फ़ संगठनों, दलों, निर्वाचित प्रतिनिधियों और आधिकारिक प्रवक्ताओं के नाम लिए जाएँ; आम प्रदर्शनकारियों या घायल, हिरासत में लिए गए या मारे गए लोगों के नाम कभी नहीं।',
          'अगर आपको LOUD पर अपना नाम दिखे और आपको लगे कि वह वहाँ नहीं होना चाहिए, तो पेज के लिंक के साथ {email} पर ईमेल करें। हम जल्दी देखेंगे।',
        ],
      },
      {
        id: 'processors',
        h: 'जानकारी कौन सँभालता है',
        list: [
          '<strong>Cloudflare:</strong> होस्टिंग, विज़िट की गिनती, रिपोर्ट का इनबॉक्स और मेल आगे भेजना।',
          '<strong>GitHub:</strong> साइट का कोड और प्रकाशित प्रदर्शन डेटा रखता है, और उन्हें बनाने वाला प्रोग्राम चलाता है।',
          '<strong>Google (Gemini):</strong> ख़बरों से सार लिखता है और पाठकों की रिपोर्ट जाँचता है।',
        ],
        after: ['ये कंपनियाँ आपके देश के बाहर, अमेरिका में भी, डेटा प्रोसेस कर सकती हैं। हम निजी डेटा नहीं बेचते।'],
      },
      {
        id: 'rights',
        h: 'आपके अधिकार',
        p: ['हमारे पास ऐसा लगभग कुछ नहीं है जिससे आपकी पहचान हो। अगर आपने हमें ईमेल किया है, या आपको लगता है कि किसी पेज पर आपकी निजी जानकारी है, तो आप {email} पर उसकी प्रति, सुधार या उसे मिटाने की माँग कर सकते हैं; हम 30 दिन के भीतर जवाब देते हैं। अगर आप यूरोपीय संघ या ब्रिटेन में रहते हैं, तो आप प्रोसेसिंग पर आपत्ति भी कर सकते हैं और अपने डेटा संरक्षण प्राधिकरण से शिकायत कर सकते हैं।'],
      },
      {
        id: 'changes',
        h: 'बदलाव',
        p: ['अगर हमारी ली जाने वाली जानकारी बदलती है, तो हम यह पेज और नीचे की तारीख़ अपडेट करते हैं।'],
      },
    ],
    updated: 'पिछला अपडेट',
  },
};

const mr: Record<InfoKey, InfoContent> = {
  about: {
    title: 'LOUD विषयी: हा आंदोलन ट्रॅकर कोण चालवते आणि तो कसा काम करतो',
    description: 'LOUD (protesttracker.online) हा एक स्वतंत्र आंदोलन ट्रॅकर आहे; तो FinTrack AI Solutions प्रकाशित करते. तो कोण चालवते, पाने कशी तयार होतात, खर्च कोण करते आणि आमच्याशी संपर्क कसा साधायचा.',
    eyebrow: 'यामागे कोण आहे',
    h1: 'LOUD विषयी',
    intro: 'LOUD हा आंदोलने, संप आणि निदर्शनांचा स्वतंत्र आणि निःपक्ष ट्रॅकर आहे. प्रत्येक पान सांगते की लोक आंदोलन का करत आहेत, त्यांना काय हवे आहे, प्रशासनाने काय उत्तर दिले आणि ते अजून सुरू आहे का, आणि प्रत्येक गोष्टीसोबत स्रोताची लिंक असते. तो ऑक्टोबर 2026 मध्ये सुरू झाला आणि सहा भाषांमध्ये {countries} देशांवर लक्ष ठेवतो.',
    sections: [
      {
        id: 'who',
        h: 'LOUD कोण चालवते',
        p: [
          'LOUD {publisher} या कंपनीने तयार केला आहे; तीच तो चालवते आणि त्याचा खर्च करते. ही कंपनी वेबसाइट आणि ऑटोमेशन सॉफ्टवेअर बनवते.',
          'LOUD चा कोणत्याही सरकारशी, राजकीय पक्षाशी, मोहीम गटाशी किंवा आंदोलनाच्या आयोजकांशी संबंध नाही. आम्ही कोणतेही आंदोलन आयोजित करत नाही, त्याचा प्रचार करत नाही आणि त्याला विरोधही करत नाही.',
        ],
      },
      {
        id: 'how',
        h: 'पाने कशी तयार होतात',
        p: [
          'LOUD सॉफ्टवेअरद्वारे तयार होतो, आणि हे आम्ही स्पष्ट सांगतो. एक प्रोग्राम दर 4 तासांनी बातम्या वाचतो. किमान {min} स्वतंत्र न्यूजरूम एकाच आंदोलनाची बातमी देतात तेव्हाच AI मॉडेल छोटा, स्वतःचा सारांश लिहिते. स्थिती, विश्वासाचा स्कोअर आणि गंभीर मोड ठरावीक नियमांनी ठरतात, AI ने नाही.',
          'आम्ही हे नियम सांभाळतो, दुरुस्तीच्या विनंत्यांना उत्तर देतो आणि नियम मोडणारी प्रत्येक गोष्ट काढून टाकतो. संपूर्ण पद्धत, विश्वासाचे सूत्र आणि आमच्याकडून काय सुटू शकते हे सर्व {how} वर आहे.',
        ],
      },
      {
        id: 'standards',
        h: 'आम्ही कोणत्या गोष्टी पाळतो',
        list: [
          '<strong>निःपक्ष भाषा.</strong> आंदोलकांच्या मागण्या आणि अधिकृत उत्तर, दोन्ही त्यांच्या स्रोतांसह.',
          '<strong>फक्त शहराचे नाव.</strong> जमण्याचे ठिकाण, मार्ग किंवा थेट हालचाल नाही.',
          '<strong>नावे किंवा चेहरे नाहीत</strong> सामान्य आंदोलकांचे, किंवा जखमी, ताब्यात घेतलेल्या किंवा मृत्युमुखी पडलेल्या लोकांचे.',
          '<strong>फक्त स्वतःचा मजकूर.</strong> आम्ही बातम्यांची लिंक देतो; लेख किंवा फोटो कधीही कॉपी करत नाही.',
          '<strong>लोक जखमी झाले असतील तेव्हा विनोद नाही.</strong> अशी पाने शांत, राखाडी मांडणीत दिसतात.',
        ],
      },
      {
        id: 'funding',
        h: 'LOUD चा खर्च कोण करते',
        p: [
          'LOUD वाचणे विनामूल्य आहे. त्याचा खर्च त्याचा प्रकाशक करतो. काही पानांच्या तळाशी असलेली पट्टी {kryvault} ची जाहिरात करते; ते त्याच मालकाचे उत्पादन आहे. ही पट्टी गंभीर मोडच्या पानांवर आणि अहवाल फॉर्मवर कधीही दिसत नाही.',
          'LOUD ला दुसरा कोणताही जाहिरातदार, प्रायोजक किंवा बाहेरचा निधी देणारा नाही, आणि पैसे देऊन कोणीही एखादे आंदोलन जोडू, बदलू किंवा काढू शकत नाही.',
        ],
      },
      {
        id: 'contact',
        h: 'दुरुस्त्या आणि संपर्क',
        p: [
          'काही चुकीचे दिसले, किंवा एखाद्या पानावर तुमचे नाव आहे आणि ते बदलायचे आहे? पानाच्या लिंकसह {email} वर ईमेल करा. आम्ही खात्री झालेल्या चुका लवकर दुरुस्त करतो, आणि तेव्हा पानाची "अपडेट" वेळ बदलते.',
          'माध्यमे, डेटा आणि गोपनीयतेच्या प्रश्नांसाठीही हाच पत्ता आहे. आम्ही कोणती माहिती घेतो ते {privacy} वर आहे.',
        ],
      },
    ],
    updated: 'शेवटची तपासणी',
  },
  privacy: {
    title: 'गोपनीयता: LOUD कोणती माहिती घेतो आणि कोणती नाही',
    description: 'LOUD वर खाते, कुकी किंवा जाहिरात ट्रॅकिंग नाही. भेटींची मोजणी, अहवाल फॉर्म आणि ईमेलमधून कोणती माहिती मिळते, ती कोण हाताळते, आणि तुमचे अधिकार.',
    eyebrow: 'थोडक्यात: फारच थोडी',
    h1: 'गोपनीयता',
    intro: 'तुम्ही खात्याशिवाय LOUD वाचू शकता, आणि आम्ही कोणतीही कुकी ठेवत नाही. protesttracker.online वापरताना कोणती माहिती घेतली जाते, का, आणि ती कोण हाताळते, हे सर्व या पानावर आहे.',
    sections: [
      {
        id: 'who',
        h: 'जबाबदार कोण आहे',
        p: ['LOUD {publisher} प्रकाशित करते, आणि येथे सांगितलेली माहिती कशी वापरायची हे तीच ठरवते. प्रश्न आणि विनंत्या: {email}.'],
      },
      {
        id: 'reading',
        h: 'तुम्ही साइट वाचता तेव्हा',
        list: [
          '<strong>कुकी, खाते किंवा जाहिरात ट्रॅकर नाही.</strong> आम्ही प्रोफाइल बनवत नाही, आणि जाहिरातीसाठी डेटा विकत नाही किंवा कोणाला देत नाही.',
          '<strong>भेटींची मोजणी.</strong> आम्ही Cloudflare Web Analytics वापरतो. ते Cloudflare वरून एक छोटी स्क्रिप्ट लोड करते आणि पान, तुम्ही ज्या साइटवरून आलात ती, तुमचा देश, ब्राउझर आणि डिव्हाइसचा प्रकार, आणि पान किती वेगाने उघडले हे नोंदवते. ते कुकी ठेवत नाही आणि वेगवेगळ्या साइटवर तुमचा मागोवा घेत नाही.',
          '<strong>सर्व्हर लॉग.</strong> साइट Cloudflare वर होस्ट आहे. प्रत्येक वेब होस्टप्रमाणे, पाने पोहोचवण्यासाठी आणि हल्ले रोखण्यासाठी ते तुमचा IP पत्ता आणि ब्राउझरची माहिती प्रक्रिया करते. वाचकांची ओळख पटवण्यासाठी आम्ही हे लॉग वापरत नाही.',
          '<strong>तुमच्या ब्राउझरमध्ये जतन केलेल्या दोन सेटिंग.</strong> फिकट किंवा गडद थीम, आणि तुम्ही KryVault ची पट्टी बंद केली की नाही (30 दिवस लक्षात राहते). त्या तुमच्या डिव्हाइसवरच राहतात आणि आमच्याकडे पाठवल्या जात नाहीत.',
          '<strong>KryVault ची पट्टी.</strong> क्लिक केल्यावर किंवा बंद केल्यावर देशानुसार दिवसाच्या एकूण संख्येत एक वाढतो. त्यासोबत IP पत्ता, कुकी किंवा आयडी ठेवला जात नाही. KryVault ही वेगळी साइट आहे आणि तिचे स्वतःचे गोपनीयता धोरण आहे.',
          '<strong>फॉन्ट आणि नकाशे</strong> आमच्या स्वतःच्या डोमेनवरून येतात, इतर कंपन्यांकडून नाही.',
        ],
      },
      {
        id: 'report',
        h: 'तुम्ही आंदोलन जोडता तेव्हा',
        p: ['{add} वरील फॉर्म तुमचे नाव, ईमेल किंवा फोन नंबर विचारत नाही. कृपया त्यात तुमची किंवा इतर कोणाची वैयक्तिक माहिती लिहू नका.'],
        list: [
          'तुम्ही जे लिहिता (शीर्षक, शहर, तारीख, कारण, मागण्या, आयोजक आणि ऐच्छिक लिंक) ते तपासणी होईपर्यंत Cloudflare वरील खाजगी डेटाबेसमध्ये राहते, साधारणपणे काही तास, आणि नंतर त्या इनबॉक्समधून हटवले जाते.',
          'एक व्यक्ती दिवसात किती अहवाल पाठवू शकते हे मर्यादित करण्यासाठी, आम्ही तुमच्या IP पत्त्यावरून बनवलेला छोटा, एकतर्फी कोड ठेवतो. तो रोज बदलतो आणि अहवालासोबत हटवला जातो. आम्ही IP पत्ता ठेवत नाही.',
          'एक AI सेवा (सध्या Google ची Gemini) अहवाल तपासते आणि तो निःपक्ष शब्दांत पुन्हा लिहिते. तपासणीत उत्तीर्ण झाल्यास, पुन्हा लिहिलेला मजकूर आणि तुमची लिंक सार्वजनिकपणे दिसतात, "वाचकाचा अहवाल, अजून खात्री नाही" या लेबलसह. तुमचे स्वतःचे शब्द प्रकाशित होत नाहीत.',
          'मृत्यू, जखमी किंवा अटकेचा उल्लेख असलेले अहवाल न्यूजरूम खात्री करेपर्यंत लपलेले राहतात. ज्या अहवालांची न्यूजरूम कधीच खात्री करत नाहीत, ते आंदोलन संपल्यानंतर साइटवरून काढले जातात.',
        ],
      },
      {
        id: 'email',
        h: 'तुम्ही आम्हाला ईमेल करता तेव्हा',
        p: ['आम्हाला तुमचा ईमेल पत्ता आणि तुमचा संदेश मिळतो, आणि आम्ही ते फक्त तुम्हाला उत्तर देण्यासाठी आणि साइट दुरुस्त करण्यासाठी वापरतो. आमच्या पत्त्यावर आलेला मेल Cloudflare आमच्या मेलबॉक्सपर्यंत पोहोचवते.'],
      },
      {
        id: 'people',
        h: 'आंदोलनाच्या पानांवर ज्यांची नावे आहेत',
        p: [
          'LOUD प्रकाशित बातम्यांचा सारांश देतो. आमचा नियम असा आहे की फक्त संघटना, पक्ष, निवडून आलेले प्रतिनिधी आणि अधिकृत प्रवक्ते यांचीच नावे घ्यायची; सामान्य आंदोलक किंवा जखमी, ताब्यात घेतलेले किंवा मृत्युमुखी पडलेले लोक यांची नावे कधीही नाही.',
          'तुम्हाला LOUD वर तुमचे नाव दिसले आणि ते तिथे नसावे असे वाटले, तर पानाच्या लिंकसह {email} वर ईमेल करा. आम्ही लवकर पाहू.',
        ],
      },
      {
        id: 'processors',
        h: 'माहिती कोण हाताळते',
        list: [
          '<strong>Cloudflare:</strong> होस्टिंग, भेटींची मोजणी, अहवालांचा इनबॉक्स आणि मेल पुढे पाठवणे.',
          '<strong>GitHub:</strong> साइटचा कोड आणि प्रकाशित आंदोलन डेटा साठवते, आणि ते तयार करणारा प्रोग्राम चालवते.',
          '<strong>Google (Gemini):</strong> बातम्यांवरून सारांश लिहिते आणि वाचकांचे अहवाल तपासते.',
        ],
        after: ['या कंपन्या तुमच्या देशाबाहेर, अमेरिकेतही, डेटावर प्रक्रिया करू शकतात. आम्ही वैयक्तिक डेटा विकत नाही.'],
      },
      {
        id: 'rights',
        h: 'तुमचे अधिकार',
        p: ['तुमची ओळख पटेल असे आमच्याकडे जवळजवळ काहीच नाही. तुम्ही आम्हाला ईमेल केला असेल, किंवा एखाद्या पानावर तुमची वैयक्तिक माहिती आहे असे वाटत असेल, तर तुम्ही {email} वर तिची प्रत, दुरुस्ती किंवा ती हटवण्याची मागणी करू शकता; आम्ही 30 दिवसांत उत्तर देतो. तुम्ही युरोपियन युनियन किंवा ब्रिटनमध्ये राहत असाल, तर तुम्ही प्रक्रियेला हरकतही घेऊ शकता आणि तुमच्या डेटा संरक्षण प्राधिकरणाकडे तक्रार करू शकता.'],
      },
      {
        id: 'changes',
        h: 'बदल',
        p: ['आम्ही घेत असलेली माहिती बदलली, तर आम्ही हे पान आणि खालील तारीख अपडेट करतो.'],
      },
    ],
    updated: 'शेवटचे अपडेट',
  },
};

const ALL: Record<Lang, Record<InfoKey, InfoContent>> = { en, hi, mr, es, fr, de };

export const infoContent = (page: InfoKey, lang: Lang): InfoContent => ALL[lang][page];
