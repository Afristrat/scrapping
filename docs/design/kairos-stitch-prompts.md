# Kairos — Prompts Stitch (collection non-monolithique)

> **Outil cible** : [Google Stitch](https://stitch.withgoogle.com) (Gemini 2.5 Flash/Pro, 350 générations/mois Standard, export Figma ou HTML/CSS).
>
> **Usage** : copier-coller chaque prompt UN À UN dans Stitch. Ne jamais coller plusieurs prompts en bloc — Stitch dilue la qualité au-delà de ~2 000 tokens. Itérer chaque écran indépendamment, exporter, intégrer dans le repo en suivant les conventions React 19 + Vite + TS strict + Tailwind v4 + shadcn/ui.
>
> **13 prompts** : 7 pour la landing publique, 5 pour les pages auth-protected, 1 pour l'onboarding.

---

## Préambule — Système de design Kairos (à inclure dans chaque prompt)

Pour gagner en cohérence d'un prompt à l'autre, le bloc suivant est **réutilisé tel quel** au début de chaque prompt Stitch. Il définit la marque, la palette, la typo, les rayons, les ombres et la tonalité.

```text
PRODUIT
Nom du produit : Kairos (du grec ancien καιρός, « le moment opportun »).
Catégorie : SaaS B2B de veille IA personnalisée pour équipes (VC, cabinets d'avocats, éditeurs média, brands, CTO PME, créateurs solos).
Promesse : « la veille IA qui comprend vos critères, pas seulement les mots-clés ».
Tonalité : française, professionnelle, sérieuse, B2B SaaS. Phrases courtes, précises sur les chiffres et les segments. Aucun jargon corporate (jamais « synergies », « disruptif », « leverage »).

DESIGN SYSTEM
Stack technique cible : React 19 + Vite + TypeScript strict + Tailwind v4 + shadcn/ui (primitives Radix UI). Lucide React pour les icônes.

Palette (tokens Tailwind, valeurs hex pour Stitch) :
- Neutre / texte : slate-50 #f8fafc, slate-100 #f1f5f9, slate-200 #e2e8f0, slate-400 #94a3b8, slate-500 #64748b, slate-600 #475569, slate-700 #334155, slate-900 #0f172a
- Primaire / actions / loggé : emerald-50 #ecfdf5, emerald-100 #d1fae5, emerald-500 #10b981, emerald-600 #059669, emerald-700 #047857
- Accent / hover liens : blue-500 #3b82f6, blue-600 #2563eb
- Warning / scores moyens / attention : orange-500 #f97316, orange-600 #ea580c
- Erreur / destructif : red-500 #ef4444, red-600 #dc2626, red-700 #b91c1c

Typo :
- Famille : Inter (avec fallbacks system-ui, sans-serif).
- Échelle : 12 (xs), 14 (sm), 16 (base), 18 (lg), 20 (xl), 24 (2xl), 30 (3xl), 36 (4xl), 48 (5xl), 60 (6xl).
- Poids : 400 (regular), 500 (medium), 600 (semibold), 700 (bold). Jamais d'italique.
- Heading principal hero : 5xl à 6xl, weight 700, tracking-tight.

Spacing : grille Tailwind (4 px = 1 unité). Padding sections : py-16 md desktop / py-12 mobile.

Rayons : rounded-md 6px, rounded-lg 8px, rounded-xl 12px (cards), rounded-2xl 16px (hero CTA).

Ombres : shadow-sm subtil, shadow-md cards, shadow-lg modals, shadow-xl dialogs.

Largeurs maxi : max-w-6xl pour les sections marketing, max-w-7xl pour le dashboard.

Accessibilité :
- Contraste AA minimum, AAA recherché sur les textes longs.
- Focus rings : ring-2 ring-emerald-500 ring-offset-2.
- Tous les composants interactifs doivent avoir un état hover, focus-visible et disabled distincts.
- Tous les inputs ont un label associé. Tous les boutons icon-only ont un aria-label.
- Skip-to-content link en haut de chaque page.

Localisation : tout le contenu textuel est en français, accents inclus (jamais "a" pour "à", jamais "ou" pour "où", etc.). Les chiffres avec espace insécable + symbole € (ex. « 599 € / siège / mois »).
```

---

## P01 — Landing Hero

### Pourquoi

Premier point de contact, doit communiquer la promesse et déclencher 1 des 2 CTA en moins de 5 secondes. Différencié par la mention « 10 providers LLM (BYOK) » et « Cascade Compose Engine ».

### Brief

Hero pleine largeur, contenu centré, 2 CTA. Visuel à droite : capture mock du dashboard avec un signal scoré 87/100.

### Prompt Stitch

```text
[INCLURE LE PRÉAMBULE DESIGN SYSTEM ICI]

ÉCRAN À GÉNÉRER
Section hero pleine largeur de la landing publique de Kairos.

LAYOUT
- Container max-w-6xl mx-auto, padding horizontal px-6 sm:px-8.
- Padding vertical py-20 md:py-28.
- Grid 2 colonnes desktop (md:grid-cols-2 gap-12), 1 colonne mobile, contenu textuel à gauche / mockup à droite.

CONTENU À INTÉGRER MOT POUR MOT
Eyebrow (au-dessus du titre, badge emerald-50/emerald-700, semibold uppercase tracking-wider, font-size xs) :
« Kairos · veille IA pour les équipes »

Titre (h1, font-bold, tracking-tight, text-slate-900, taille 4xl mobile / 6xl desktop, line-height 1.1) :
« La veille IA qui comprend vos critères, pas seulement les mots-clés. »

Sous-titre (text-lg text-slate-600, max-w-xl, mt-6) :
« Agrégez X, Reddit et arXiv. Scorez chaque signal selon VOS priorités, avec le LLM de votre choix (10 providers). Synthétisez en brief 80/20 dans votre langue. Suivez les topics qui émergent — pas ceux qui buzzent. »

CTA primaire (button bg-slate-900 text-white, hover:bg-slate-800, rounded-xl, px-6 py-3, text-base font-semibold, focus-visible:ring-2 ring-emerald-500 ring-offset-2) : « Démarrer (essai 14 j) » avec icône lucide ArrowRight à droite, gap-2.

CTA secondaire (button variant ghost, text-slate-700 hover:text-slate-900, underline-offset-4 hover:underline, px-4 py-3) : « Voir une démo guidée »

Sous les CTA, ligne de réassurance (text-sm text-slate-500, gap-2 flex flex-wrap) :
« Aucune carte requise · Annulation en 1 clic · RGPD-ready · 10 providers LLM (BYOK) »

VISUEL À DROITE
Mockup d'une carte de signal scoré, fond slate-50 avec ombre lg, rounded-xl, padding 6.
- Header de la carte : badge source « arXiv » (bg-cyan-100 text-cyan-800 text-xs px-2 py-0.5 rounded), date « il y a 3 h ».
- Titre du signal : « LoRA-Mixture: scaling parameter-efficient fine-tuning to 1B+ models »
- Score 87/100 affiché en grand (4xl, emerald-600, font-bold), avec bouton tooltip subtil à côté.
- 3 lignes de raisonnement LLM tronqué : « Innovation technique forte (40 %) · Actionable cette semaine (30 %) · Source MIT (30 %). Détail : nouveau découpage de l'espace LoRA permettant... »
- Petit footer : « Modèle : claude-haiku-4.5 · Rubrique : Veille technique builder ».

VARIANTES À PRÉVOIR
- Default (rendu ci-dessus).
- Hover du CTA primaire (translation translate-y-[-1px] et shadow-md).
- Mobile (grid 1 colonne, mockup en dessous, taille du titre réduite à 4xl).

ACCESSIBILITÉ
- Le titre h1 doit être unique et premier sur la page.
- Les CTA doivent avoir un état focus visible (ring emerald-500, offset 2).
- L'image mockup est purement décorative : alt="" et aria-hidden="true".
- Contraste AA garanti partout.

OUTPUT
Composant React TypeScript fonctionnel, sans dépendance externe autre que lucide-react et react-router-dom (Link). Code strict, pas de "any". Exporter en default ou nommé Hero.
```

---

## P02 — Landing Problem + Solution (3 étapes)

### Pourquoi

Établir la douleur (« 90 % bruit »), puis poser le mécanisme produit en 3 étapes claires. Section liaison entre le hero et les preuves de valeur.

### Brief

2 sous-sections empilées : la première sombre (problème), la seconde claire (solution avec 3 cartes côte à côte). Garder la transition visuelle.

### Prompt Stitch

```text
[INCLURE LE PRÉAMBULE DESIGN SYSTEM ICI]

ÉCRAN À GÉNÉRER
Deux sections successives sur la landing publique de Kairos : (A) Le problème, (B) La solution en 3 étapes.

(A) — SECTION PROBLÈME
Layout :
- Pleine largeur, fond slate-900 text-white.
- Container max-w-4xl mx-auto py-20 px-6, contenu centré (text-center).

Contenu :
Eyebrow (text-emerald-400 text-sm font-semibold tracking-wider uppercase) : « Le problème ».
Titre h2 (text-4xl md:text-5xl font-bold) : « 90 % de bruit, 10 % de signal, 100 % de fatigue. »
Paragraphe (text-lg text-slate-300, max-w-2xl mx-auto, mt-6) :
« Chaque jour : ~30 nouveaux papiers arXiv en IA, ~50 lancements produits sur X, des centaines de fils Reddit. Aucun outil de veille générique ne comprend ce qui compte POUR VOTRE équipe. »

3 stats en ligne sous le paragraphe (gap-12 mt-12, gap-8 mobile, items centrés, chaque stat = chiffre 4xl emerald-400 + label text-sm slate-400) :
- « ~30 papiers / jour » — arXiv cs.AI cs.LG cs.CL
- « ~50 lancements / jour » — X listes IA tier 1
- « 18 subs · 35+ communautés » — Reddit sélectionnés

(B) — SECTION SOLUTION
Layout :
- Pleine largeur, fond slate-50.
- Container max-w-6xl mx-auto py-20 px-6.

Contenu :
Eyebrow (text-slate-500 text-sm font-semibold tracking-wider uppercase) : « La solution Kairos ».
Titre h2 (text-3xl md:text-4xl font-bold text-slate-900) : « 3 étapes pour transformer le bruit en signal qualifié. »

Grid 3 colonnes desktop (md:grid-cols-3 gap-6, 1 colonne mobile gap-6, mt-12).

Carte 1 (Card padding 8, bg-white border border-slate-200 rounded-xl shadow-sm) :
- Icône en haut : Filter de lucide-react, 32 px, fond emerald-100 rounded-lg p-3 inline-flex.
- Titre h3 (text-xl font-semibold text-slate-900 mt-4) : « 1. Agrégation »
- Description (text-slate-600 mt-2 text-sm) : « X via listes dédiées, Reddit via subs paramétrables, arXiv via catégories sélectionnées. Ajoutez vos propres flux RSS et listes privées. »

Carte 2 (idem, icône Sliders bg-emerald-100) :
- Titre : « 2. Scoring custom — Maison ou BYOK »
- Description : « Définissez votre rubrique de scoring (innovation, actionable, crédibilité…). Choisissez le LLM : nous fournissons un Sonnet économique tout-inclus, OU vous apportez VOS clés (Anthropic, OpenAI, Google, Mistral, Groq, OpenRouter, et 4 autres). »

Carte 3 (idem, icône Newspaper bg-emerald-100) :
- Titre : « 3. Digest 80/20 multi-langue »
- Description : « Brief quotidien automatique en français, anglais ou espagnol, à partir des seuls signaux qui passent votre seuil. Cascade transversale Compose Engine pour synthétiser plusieurs sources d'un coup. »

VARIANTES
- Default.
- Hover sur les cards : border-emerald-300 + shadow-md.
- Mobile : sections empilées, stats du problème en colonne.

ACCESSIBILITÉ
- Section A : contraste élevé blanc sur slate-900, AA minimum sur slate-300 (≥ 7:1).
- Les icônes de cartes ont aria-hidden="true". Les titres h3 portent l'information sémantique.
- Skip-link compatible avec le saut entre les 2 sections.

OUTPUT
2 composants React TypeScript : ProblemSection.tsx et SolutionSteps.tsx. Exports nommés.
```

---

## P03 — Landing Moats (4 différenciateurs)

### Pourquoi

Convaincre que Kairos a un moat défendable. 3 différenciateurs livrés + 1 roadmap pour démontrer la trajectoire.

### Brief

Grid 2x2 desktop, 1 colonne mobile. Chaque carte : icône + titre + paragraphe + footer (statut « livré » ou « roadmap »).

### Prompt Stitch

```text
[INCLURE LE PRÉAMBULE DESIGN SYSTEM ICI]

ÉCRAN À GÉNÉRER
Section « Différenciateurs » de la landing publique. Démontre les 4 moats du produit.

LAYOUT
- Pleine largeur fond white.
- Container max-w-6xl mx-auto py-20 px-6.
- Grid 2 colonnes desktop (md:grid-cols-2 gap-6), 1 colonne mobile.

EN-TÊTE
Eyebrow (slate-500 text-sm uppercase tracking-wider) : « Pourquoi Kairos ».
Titre h2 (text-3xl md:text-4xl font-bold slate-900) : « 4 différenciateurs durables. »
Sous-titre (text-slate-600 max-w-2xl mt-4) : « Le scoring devient une commodité. Notre moat, c'est la mémoire longue, la composition, et la liberté de stack. »

CARTES (mt-12, gap-6)

Carte 1 — Livré
- Badge en haut (bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded uppercase) : « Livré »
- Icône Brain (lucide), 28 px, dans un carré emerald-50 rounded-lg p-3.
- Titre h3 (text-xl font-semibold) : « 10 providers LLM au choix (BYOK) »
- Paragraphe (slate-600 text-sm mt-2) : « OpenRouter, Anthropic, OpenAI, Google, Mistral, Groq, Together, DeepSeek, Moonshot, Ollama. Aucune marge cachée : vous payez votre conso. Mode Maison disponible si vous préférez le tout-inclus. »
- Liste pills (mt-3, flex flex-wrap gap-1) : 10 pills (text-xs px-2 py-0.5 bg-slate-100 rounded) avec les noms des providers.

Carte 2 — Livré
- Badge « Livré »
- Icône Network (lucide), bg blue-50.
- Titre : « Cascade Compose Engine »
- Paragraphe : « Vos prompts admin peuvent référencer d'autres prompts via {{run:reddit}}, {{run:arxiv}}. Le synthesis exécute reddit + arxiv + x avant la synthèse. Détection cycle, profondeur max 3, opt-in pour maîtriser le coût. Unique au marché. »
- Code snippet (mt-3, bg-slate-900 text-emerald-400 text-xs font-mono p-3 rounded) :
  « Synthèse de la semaine : {{run:reddit}} + {{run:arxiv}} + {{run:x}} »

Carte 3 — Livré
- Badge « Livré »
- Icône BarChart3 (lucide), bg orange-50.
- Titre : « Topic memory 90 jours »
- Paragraphe : « Algorithme Welford z-score sur fenêtre glissante 90 jours, persistance MinIO. Détectez les sujets qui émergent avant qu'ils trendent. 4 sections : Émergents · En déclin · Stables · Calibrage. »
- Mini graphique simulé (mt-3, ligne de spark slate-200 → emerald-500 sur 30 ticks).

Carte 4 — Roadmap
- Badge (bg-blue-100 text-blue-700) : « Roadmap publique »
- Icône Sparkles (lucide), bg blue-50.
- Titre : « Multi-LLM consensus + Backtest + Author reputation »
- Paragraphe : « Q3 2026 : scoring multi-modèles parallèle (analogie radiologie). Q4 2026 : backtest des grilles sur historique 30 j. Q1 2027 : trust score auteur sur 90 jours. La data accumule en silence dès aujourd'hui. »
- Timeline 3 points (mt-3) avec dates.

VARIANTES
- Hover : lift translate-y-[-2px] + shadow-md + border-emerald-200.
- État "lock" pour Carte 4 : icône Lock superposée discrètement en haut à droite.

ACCESSIBILITÉ
- Cards avec role="article" si liens, ou pas de rôle si purement informatif.
- Les badges « Livré » / « Roadmap » sont lus correctement par les screen readers.
- Le contraste sur les pills slate-100 / slate-700 doit dépasser 4.5:1.

OUTPUT
Composant React TypeScript MoatsSection.tsx, export nommé.
```

---

## P04 — Landing Personas (6 cartes par segment)

### Pourquoi

Aider chaque visiteur à se reconnaître en une carte. Chaque carte affiche tarif Maison ET BYOK pour la transparence pricing.

### Brief

Grid responsive 1/2/3 colonnes, chaque carte : icône, titre persona, headline, 2 lignes pricing colorées différemment.

### Prompt Stitch

```text
[INCLURE LE PRÉAMBULE DESIGN SYSTEM ICI]

ÉCRAN À GÉNÉRER
Section « Cas d'usage par persona » de la landing publique de Kairos.

LAYOUT
- Pleine largeur fond slate-50.
- Container max-w-6xl mx-auto py-20 px-6.
- Grid : grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6.

EN-TÊTE
Eyebrow : « Pour qui ».
Titre h2 (text-3xl md:text-4xl font-bold slate-900) : « 6 façons de capturer la valeur. »
Sous-titre (slate-600 max-w-2xl) : « Kairos s'adapte à votre métier. Le tarif suit la valeur que vous capturez. »

CARTES (chacune Card padding 6, bg-white border-slate-200 rounded-xl, hover:border-emerald-200 hover:shadow-md transition)

Card 1 — VC / Private Equity IA
- Icône Briefcase, bg emerald-100, p-3 rounded-lg.
- Titre h3 (text-lg font-semibold slate-900) : « VC / Private Equity IA »
- Headline (slate-700 mt-2 text-sm font-medium) : « Ne ratez plus un deal qui démarre sur arXiv. »
- Description (slate-600 text-sm mt-2) : « Sources tier 1 IA, alertes lifecycle (levée, pivot, hire C-level), auteurs vérifiés. Ratio coût/deal infini. »
- Pricing (mt-4 border-t border-slate-200 pt-4, 2 lignes) :
  - Ligne Maison : « Maison — Sonnet inclus » badge emerald-50 / slate-700 text-sm + prix « à partir de 599 € / siège / mois » emerald-700 font-semibold.
  - Ligne BYOK : « BYOK — votre Opus » badge blue-50 + prix « à partir de 999 € / siège / mois » blue-700 font-semibold.

Card 2 — Cabinet d'avocats / IA Act
- Icône Scale, bg emerald-100.
- Titre : « Cabinet d'avocats / conformité IA Act »
- Headline : « Anticipez la réglementation, ne la suivez pas. »
- Description : « Sources EU AI Office, AAAI, FAccT. Cross-source corroboration pour vos notes clients. Audit log compliance disponible en add-on. »
- Pricing :
  - Maison : « à partir de 399 € / siège / mois »
  - BYOK : « à partir de 699 € / siège / mois »

Card 3 — Newsletter / éditeurs IA
- Icône Newspaper, bg emerald-100.
- Titre : « Newsletter / éditeurs IA »
- Headline : « Publiez avant TechCrunch. »
- Description : « Backtest de votre ligne éditoriale, export API, branding sur les digests publics, cascade Compose pour les synthèses du dimanche. »
- Pricing :
  - Maison (3 sièges) : « 499 € / mois »
  - BYOK (3 sièges) : « 799 € / mois »

Card 4 — Brand / Marketing IA-corp
- Icône Megaphone, bg emerald-100.
- Titre : « Brand / Marketing IA-corp »
- Headline : « Vos conversations brand restent dans VOTRE infra. »
- Description : « Author reputation, sentiment, alertes Slack sur signaux ≥ 70 mentionnant votre marque. Tenant isolé en option. »
- Pricing :
  - Maison : « 499 € / siège / mois »
  - BYOK : « 799 € / siège / mois »

Card 5 — CTO / Tech Lead PME
- Icône Code2, bg emerald-100.
- Titre : « CTO / Tech Lead PME »
- Headline : « Validez vos choix techno avant 6 mois de dev. »
- Description : « Rubriques RAG, agents, modèles locaux, infra LLM. 5 sièges minimum, intégration Slack incluse. »
- Pricing :
  - Maison (5 sièges) : « à partir de 149 € / siège / mois »
  - BYOK (5 sièges) : « à partir de 249 € / siège / mois »

Card 6 — Solo créateur IA
- Icône Rocket, bg slate-100 (différent — funnel, pas tier principal).
- Titre : « Solo créateur IA »
- Headline : « Votre clé, votre choix de modèle. »
- Description : « 1 utilisateur, 100 signaux/jour, 1 rubrique, memory 30 j. Pour itérer rapidement avant d'inviter votre équipe. »
- Pricing :
  - Maison Haiku : « 49 € / mois »
  - BYOK : « 99 € / mois »
- Note (text-xs slate-500 mt-2) : « Essai 14 j sans carte requise. »

CTA EN BAS DE SECTION
Centré, mt-12 :
« Vous ne vous reconnaissez pas dans une de ces 6 cartes ? » + lien : « Décrivez-nous votre cas → » → mailto:hello@kairos.ai-mpower.com

VARIANTES
- Hover lift +1px + shadow.
- Tier Solo (Card 6) légèrement minoré visuellement (bg slate-50, opacity 0.95) pour ne pas concurrencer Pro.

ACCESSIBILITÉ
- Tous les prix lus avec mention « euros par siège par mois » (sr-only) pour screen readers.
- Les icônes ont aria-hidden, les titres h3 portent le sens.

OUTPUT
Composant React TypeScript PersonasSection.tsx, export nommé.
```

---

## P05 — Landing Pricing Configurator (toggle Maison/BYOK + slider seats dégressif)

### Pourquoi

Pièce maîtresse de la conversion. Doit transformer la complexité (12 SKUs) en un parcours de 4 questions simples avec un prix calculé live.

### Brief

3 paliers visibles (Solo / Pro recommandé / Enterprise) + toggle Maison/BYOK qui change toutes les colonnes + slider seats Pro 5-25 avec dégressivité (-15 % Maison, -10 % BYOK au-delà de 5).

### Prompt Stitch

```text
[INCLURE LE PRÉAMBULE DESIGN SYSTEM ICI]

ÉCRAN À GÉNÉRER
Section « Pricing » de la landing publique de Kairos avec configurateur interactif Maison/BYOK + slider seats.

LAYOUT
- Container max-w-6xl mx-auto py-20 px-6.
- Pleine largeur fond white.

EN-TÊTE
Eyebrow : « Tarifs ». Titre h2 (text-3xl md:text-4xl font-bold) : « Choisissez votre stack. »
Sous-titre (slate-600 max-w-2xl) : « Mode Maison : nous gérons les LLM, vous payez un forfait. Mode BYOK : vos clés, vos modèles, votre contrôle des données — recommandé enterprise. »

TOGGLE MODE (au-dessus des 3 cartes pricing, mt-8 mb-12, segmented control centré)
Composant Tabs shadcn (Radix), 2 onglets :
- Onglet 1 actif par défaut : « LLM Maison (tout-inclus) » — text-base px-6 py-2 selected: bg-slate-900 text-white, unselected: text-slate-600 hover:text-slate-900.
- Onglet 2 : « BYOK (vos clés) » — bg-emerald-600 text-white quand sélectionné.

Phrase d'aide sous le toggle (text-sm slate-500 max-w-xl mx-auto text-center mt-2) qui change selon l'onglet :
- Si Maison : « Notre Sonnet économique inclus, vous ne gérez rien. ~3 €/mois de COG amorti chez nous. »
- Si BYOK : « Apportez vos clés OpenRouter, Anthropic, OpenAI, Google, Mistral, Groq, Together, DeepSeek, Moonshot ou Ollama. Vous payez votre conso direct au provider. »

PALIERS (mt-12, grid md:grid-cols-3 gap-6, ouverture du composant PricingTable)

Palier 1 — Solo (Card padding 8, fond white border slate-200 rounded-xl)
- Header : nom « Solo » + badge gris « Funnel » optionnel (text-xs slate-100).
- Prix géant (text-5xl font-bold slate-900) :
  - Maison : « 49 € » + suffixe (text-base text-slate-500) « / mois »
  - BYOK : « 99 € / mois »
- Sous-prix (text-sm slate-500) : « 1 utilisateur · 100 signaux / jour »
- Liste features (mt-6, ul space-y-3, chaque ligne avec icône Check vert emerald-600 + texte slate-700 text-sm) :
  - 1 rubrique active
  - Memory 30 j
  - 10 providers LLM (BYOK)
  - Cascade Compose Engine
  - Communauté
- CTA (mt-8, button full width slate-900 text-white) : « Démarrer (essai 14 j) » → /signup

Palier 2 — Pro ⭐ recommandé (Card avec border-2 border-emerald-500 ring-1 ring-emerald-200 shadow-lg, badge en haut)
- Badge Recommandé en haut (absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1) avec icône Star.
- Nom « Pro »
- Prix (configurable via slider seats) :
  - Default 5 sièges :
    - Maison : « 745 € / mois » (= 5 × 149 €)
    - BYOK : « 1 245 € / mois » (= 5 × 249 €)
  - Slider seats 5-25 (composant Slider shadcn, mt-4) avec label « Sièges : {value} »
  - Sous le slider, calcul live : total = (5 × tier1Price) + (additionalSeats × tier1Price × discountFactor)
  - Discount factor : Maison -15 % au-delà du 6e siège, BYOK -10 %.
  - Affichage du discount actif : « Économies : 198 € / mois (15 %) » en emerald-600 si seats > 5.
- Liste features :
  - Toutes features Solo
  - Multi-LLM consensus (à venir)
  - Sources illimitées
  - Memory 365 j
  - API read+write + webhooks
  - Backtest 5 / mois
  - Support email 48 h
- CTA (button emerald-600 text-white) : « Démarrer Pro »
- Petite note : « Adapté à VC / Avocats / Newsletters / Brands / CTOs — segment précis configuré au signup. »

Palier 3 — Enterprise (Card border-slate-200, fond slate-900 text-white pour différencier)
- Nom « Enterprise »
- Prix : « Sur devis » (text-2xl font-bold) + sous-prix « à partir de ~6 000 € / mois selon usage »
- Liste features (icônes Check emerald-400) :
  - Tout Pro inclus
  - Tenant isolé OU self-host Docker
  - BYOK Opus / Sonnet
  - Author reputation API (à venir)
  - Custom rubrics confidentielles
  - Audit log + compliance pack
  - CSM dédié
  - SLA 99,9 %
- CTA (button white slate-900) : « Contactez-nous » → mailto avec subject Kairos%20Enterprise

EN BAS DE LA SECTION
Lien (mt-8 text-center text-sm slate-600) : « Vous êtes VC, cabinet d'avocats, éditeur média ou brand ? Configurons ensemble votre stack. → » → mailto.

LISTE D'ADD-ONS (mt-12 collapsible, optionnel)
Section « Add-ons » avec accordion, pour transparence :
- Webhooks Slack/Teams +49 € / mois
- API publique read+write +99 € / mois
- Custom sources (RSS, listes privées) +199 € / mois
- Audit log compliance +149 € / mois
- Tenant isolé +299 € / mois
- Self-host Docker +499 € / an
- CSM dédié +999 € / an
- Backtest illimité +149 € / mois
- Author Reputation API +199 € / mois

VARIANTES
- Default (mode Maison + 5 sièges).
- Mode BYOK actif (toggle clic) → tous les prix changent live.
- Slider 25 sièges → discount visible.
- Mobile : 3 cards empilées, slider full width, toggle empile.

ACCESSIBILITÉ
- Toggle Tabs : aria-selected correctement géré par Radix.
- Slider : aria-valuenow, aria-valuemin, aria-valuemax, label visible.
- Tous les prix annoncés correctement par screen reader (mention « euros par mois » sr-only).
- CTA Pro mis en avant visuellement mais pas exclusivement (autres CTAs accessibles au tab).

LOGIQUE DE CALCUL (à coder côté client, pure function)
function computePrice(mode: 'maison'|'byok', seats: number): number {
  const tier1 = mode === 'maison' ? 149 : 249
  const baseSeats = 5
  const baseCost = baseSeats * tier1
  if (seats <= baseSeats) return baseCost
  const extraSeats = seats - baseSeats
  const discount = mode === 'maison' ? 0.15 : 0.10
  const extraCost = extraSeats * tier1 * (1 - discount)
  return Math.round(baseCost + extraCost)
}

OUTPUT
Composant React TypeScript PricingTable.tsx, complet, autonome (pas de fetch externe). Utiliser shadcn Tabs + Slider + Card + Badge + Button.
```

---

## P06 — Landing FAQ

### Pourquoi

Lever les 5 objections les plus fréquentes : différenciation vs concurrents, coût LLM réel, sécurité données, multi-tenant, rapport BYOK/Maison.

### Brief

5 Q/R en accordéon `<details><summary>` natif, simple, lisible.

### Prompt Stitch

```text
[INCLURE LE PRÉAMBULE DESIGN SYSTEM ICI]

ÉCRAN À GÉNÉRER
Section FAQ de la landing publique de Kairos.

LAYOUT
- Container max-w-3xl mx-auto py-20 px-6 (plus étroit que les autres sections, lecture longue).
- Fond white.

EN-TÊTE
Eyebrow (slate-500 uppercase tracking-wider text-sm) : « Foire aux questions ».
Titre h2 (text-3xl md:text-4xl font-bold slate-900) : « Les 5 questions qu'on nous pose. »

LISTE FAQ (mt-12, divides slate-200, 5 items)
Chaque item est un <details> stylé :
- summary : flex items-center justify-between cursor-pointer py-5 text-left, contient (a) la question (text-lg font-semibold slate-900 group-open:text-emerald-700), (b) un chevron (lucide ChevronDown qui rotate-180 quand ouvert).
- contenu (slate-600 text-base leading-relaxed py-4 px-1) avec liens emerald-600 hover:underline.

CONTENU EXACT DES 5 Q/R

Q1 : « Pourquoi BYOK est-il plus cher que Maison ? »
R1 : Contre-intuitif au premier regard, mais cohérent côté marché. Le mode BYOK adresse des acteurs enterprise / souverains / power users : ils ont déjà un budget « tooling » illimité, exigent leur Opus, leurs données chez eux, leurs clés. La WTP (willingness to pay) y est structurellement supérieure. Notre coût LLM y est nul, mais nous facturons la souveraineté, le contrôle de stack et le support multi-providers. Comparable Vercel AI SDK Cloud ou LangChain Enterprise.

Q2 : « Pourquoi pas Feedly, Inoreader ou un agrégateur RSS ? »
R2 : Feedly agrège, mais ne score pas selon VOS critères. Kairos n'est pas un agrégateur : c'est un scoreur LLM custom + cascade transversale + topic memory 90 jours. Vous gardez le flux brut, mais vous obtenez un classement aligné sur vos rubriques d'investissement, de veille techno ou de conformité.

Q3 : « Combien ça coûte vraiment en LLM (mode BYOK) ? »
R3 : Vous payez VOTRE consommation directement à OpenRouter / Anthropic / etc. Aucune marge cachée. Ordre de grandeur réaliste : ~3 €/mois pour ~700 signaux/jour avec Haiku 4.5, ~50 €/mois avec Sonnet 4.6, ~200 €/mois avec Opus 4.7. Vous voyez l'usage live dans Paramètres → Coûts.

Q4 : « Mes données sont-elles sécurisées ? »
R4 : Oui à plusieurs niveaux. (1) RLS Postgres natif Supabase : les rows d'une organisation ne sont jamais visibles depuis une autre. (2) BYOK : vos clés API ne quittent pas votre tenant. (3) Tenant isolé en option add-on (schéma Postgres dédié). (4) Self-host EU possible avec notre bundle Docker enterprise. (5) Audit log compliance disponible en option (segment avocats notamment).

Q5 : « Est-ce adapté à mon équipe / mon organisation ? »
R5 : Oui. Multi-tenant org-level avec billing par organisation et invitation par email arrive en Q3 2026. En attendant, 1 tenant par organisation avec auth multi-méthodes (magic link, password, Google OAuth). Si vous voulez pré-réserver une démo équipe, contactez-nous.

VARIANTES
- État ouvert : chevron rotate-180, summary text-emerald-700, fond légèrement teinté slate-50.
- Hover : background slate-50, transition 150ms.

ACCESSIBILITÉ
- <details> natif assure le toggle au clavier (Espace/Enter sur summary).
- aria-expanded géré automatiquement par <details>.
- Liens dans les réponses ont focus-visible:underline.

OUTPUT
Composant React TypeScript FAQSection.tsx, données dans un array, exporté nommé. Pas de framework accordion lourd : <details> natif suffit.
```

---

## P07 — Dashboard / Signaux (table avec scoring + tooltips + sticky bar bulk actions)

### Pourquoi

Cœur du produit. Doit afficher 50-200 signaux scorés, permettre filtre/tri/sélection multiple, bouton supprimer inline + bulk, re-scorer les zéros, ouvrir le détail au clic.

### Brief

Page protégée par auth, layout AppLayout (sidebar à gauche). Table dense, sticky bar conditionnelle au-dessus en cas de sélection. ScoreCell avec HoverCard.

### Prompt Stitch

```text
[INCLURE LE PRÉAMBULE DESIGN SYSTEM ICI]

ÉCRAN À GÉNÉRER
Page Dashboard /dashboard de Kairos (auth protégée). Affiche la table des signaux scorés.

LAYOUT GLOBAL
- AppLayout : sidebar fixe à gauche 240 px (Dashboard, Digest, Topics, Costs, Logs, Settings), contenu principal flex-1 padding 8.
- Header BrandedHeader en haut (logo + nom de l'app personnalisé).

CONTENU PRINCIPAL

(A) Header de page :
- Titre h1 (text-2xl font-bold slate-900) : « Signaux »
- Sous-titre (slate-500 text-sm) : « Top signaux scorés de votre veille IA, triés par score décroissant. »
- À droite : bouton primaire « Lancer la pipeline » (button bg-slate-900 text-white) + bouton secondaire « Re-scorer les N signaux à 0 » (variant outline orange-600 text-orange-600) qui n'apparaît que si signalsAtZero > 0.

(B) Filtres (flex flex-wrap gap-3 mt-4) :
- Select source (« Toutes / X / Reddit / arXiv »).
- Select score (« Tous / ≥ 70 / ≥ 50 / 0 (à re-scorer) »).
- Select période (« 24 h / 7 j / 30 j / Tout »).
- Bouton reset.

(C) Sticky bar bulk actions (apparait UNIQUEMENT si selection.size > 0)
- sticky top-0 z-10, mt-4, fond slate-900 text-white, padding 4, rounded-md, flex justify-between items-center.
- Gauche : « N signaux sélectionnés » (text-sm).
- Droite : 3 boutons inline gap-2 :
  - « Désélectionner » (button variant ghost text-white)
  - « Re-scorer la sélection » (icône RefreshCw, button variant outline border-white)
  - « Supprimer la sélection » (icône Trash2, button bg-red-600 text-white hover:bg-red-700)

(D) Table (mt-4, rounded-lg border border-slate-200 overflow-hidden)

Header de table (sticky top-12, bg-slate-50 border-b text-slate-500 text-xs uppercase tracking-wider) :
| Checkbox (16px) | Score (80px) | Source (90px) | Titre (flex-1) | Date (110px) | Actions (50px) |

Header checkbox : indeterminate-aware (état mixte si certaines lignes sont sélectionnées mais pas toutes).

Lignes :
- Pattern hover group/row (group hover:bg-slate-50).
- Checkbox à gauche.
- Score : composant ScoreCell avec HoverCard
  - Affiche le score en grand : 0 ou null = « — » slate-400, 1-39 = orange-500, 40-69 = blue-600, 70-100 = emerald-600 font-semibold.
  - Au hover : HoverCard riche affichant : « Score X / 100 » + « Pourquoi ce score ? » (raisonnement LLM tronqué) + « Modèle : claude-haiku-4.5 » + « Rubrique : <name> » + « il y a 3 h » (date-fns/locale/fr).
  - Si score = 0/null : encart orange dans la HoverCard « Ce signal n'a pas pu être scoré. Cliquez sur ↻ pour relancer. »
  - Bouton ↻ inline visible si score 0/null, à droite du chiffre, icône RefreshCw, ghost.
  - Au succès du re-score : flash bg-emerald-100 1.5s sur la cellule (transition-colors duration-1000).
- Source : badge coloré par source (X bg-indigo-100, Reddit bg-orange-100, arXiv bg-cyan-100).
- Titre : tronqué à 1 ligne (truncate), 2 lignes au hover, click ouvre modal détail.
- Date : « il y a X h » format relatif FR, tooltip date absolue ISO.
- Actions : bouton trash inline (Trash2, ghost, opacity-0 group-hover/row:opacity-100 transition-opacity, hover:bg-red-50 hover:text-red-700).

(E) Footer table (mt-4 flex justify-between items-center)
- Compteur « 47 signaux affichés sur 132 ».
- Pagination simple (boutons Précédent / Suivant si > 50).

(F) Modal détail signal (au clic sur ligne)
- DialogContent shadcn, max-w-2xl.
- Header : titre du signal + source + date + score gros.
- Corps : extrait raw_payload (titre, body, URL externe), reasoning LLM complet, modèle utilisé, action « Aller à la source » (ouvre l'URL dans nouvel onglet).
- Footer : bouton « Re-scorer », « Supprimer », « Fermer ».

(G) AlertDialog confirmation suppression
- Titre : « Supprimer ce signal ? »
- Description : « Action irréversible. Le score associé sera également supprimé. »
- Boutons : « Annuler » (cancel) et « Supprimer » (destructif red-600).

VARIANTES / ÉTATS
- Empty state : « Aucun signal disponible. Lancez votre première pipeline pour commencer. » + CTA « Lancer la pipeline ».
- Loading : skeleton 5 lignes (Animate-pulse, fond slate-100).
- Error : « Impossible de charger les signaux. » + bouton « Réessayer ».
- Selection : sticky bar visible.
- Re-score en cours : icône spinner sur la cellule + désactivation bouton inline.

ACCESSIBILITÉ
- Table sémantique <table>/<thead>/<tbody>/<tr>/<th>/<td>.
- Checkbox header avec aria-label « Sélectionner tous les signaux affichés », state mixed correctement.
- Lignes cliquables : tabIndex=0, role="button", aria-label « Voir détail signal: <titre> ».
- Boutons icon-only ont aria-label.
- HoverCard accessible au focus clavier (pas seulement hover).
- Annonce live region quand le re-score termine ou la suppression réussit : « Signal supprimé », « Score mis à jour ».

OUTPUT
Composant React TypeScript SignalTable.tsx + Dashboard.tsx + ScoreCell.tsx (3 fichiers). Utiliser shadcn Tabs / Card / AlertDialog / HoverCard / Checkbox / Button / Dialog. Utiliser TanStack Query hooks (useSignals, useDeleteSignal, useDeleteSignalsBulk, useRescoreSignal, useRescoreSignalsBulk).
```

---

## P08 — Settings (6 onglets : Modèles BYOK, Rubriques, Sources, Clés API, Admin prompts, Branding)

### Pourquoi

Tout le pouvoir de personnalisation est ici. Doit être lisible, structuré en onglets, chaque onglet autonome.

### Brief

Page protégée, layout AppLayout, container max-w-4xl. Composant Tabs shadcn avec 6 onglets, contenu différent par onglet.

### Prompt Stitch

```text
[INCLURE LE PRÉAMBULE DESIGN SYSTEM ICI]

ÉCRAN À GÉNÉRER
Page Settings /settings de Kairos (auth protégée). 6 onglets de configuration.

LAYOUT
- AppLayout (sidebar + BrandedHeader).
- Container max-w-4xl mx-auto px-6 py-8.

(A) HEADER
- Titre h1 (text-2xl font-bold) : « Paramètres »
- Sous-titre (text-sm slate-500) : « Configurez Kairos selon vos besoins. »

(B) TABS shadcn (TabsList) — 6 onglets, sticky top-0 :
1. Modèles
2. Rubriques de scoring
3. Sources
4. Clés API
5. Admin prompts
6. Branding

ONGLET 1 — MODÈLES (active par défaut)
- Titre h2 « Cascade de modèles par tâche »
- Description : « Pour chaque tâche, choisissez le provider et le modèle. Si non configuré, fallback openrouter/auto. »
- 4 cartes par tâche (scraping, scoring, monitoring, digest), chacune :
  - Header : nom de la tâche + badge « Actif/Inactif ».
  - Sélecteur Provider (Select shadcn, 10 options : OpenRouter, Anthropic, OpenAI, Google, Mistral, Groq, Together, DeepSeek, Moonshot, Ollama).
  - Sélecteur Modèle (filtré selon le provider, ex. claude-haiku-4.5, claude-sonnet-4.6, claude-opus-4.7).
  - Lien « Refresh models » (refetch via edge fn).
- Bouton « Sauvegarder » en bas.

ONGLET 2 — RUBRIQUES DE SCORING
- Liste des rubriques (table 3 colonnes : Nom, Critères, Actions).
- Chaque ligne avec radio « Active » à gauche.
- Dialog d'édition : nom, prompt, liste de critères pondérés (label + weight 0-1, total = 1).
- CTA « Nouvelle rubrique » en haut.
- Mention en bas : « Bientôt : Backtest automatique sur 30 derniers jours. »

ONGLET 3 — SOURCES
- 3 sections empilées :
  - Reddit subs (TagInput, supporte tags + suppression, max 50).
  - arXiv catégories (TagInput).
  - X queries (TagInput) + IDs de listes X (Input).
- Apify config (advanced) collapsé : reddit_actor, reddit_sort, reddit_time_filter, reddit_max_per_sub.
- Priorité des sources (3 sliders 0-100 : reddit, arxiv, x), total ≤ 300.

ONGLET 4 — CLÉS API
- Liste de 10 providers (OpenRouter, Anthropic, OpenAI, Google, Mistral, Groq, Together, DeepSeek, Moonshot, Ollama) + Apify.
- Chaque ligne : nom du provider + state badge (« Vérifiée » emerald, « Invalide » red, « Manquante » slate) + Input password (masqué) + bouton « Tester » + bouton « Sauvegarder » + bouton « Supprimer » (destructif).
- Au sauvegarde : test ping automatique (icône loader → check ou x).
- Note encadrée : « Vos clés sont stockées dans user_api_keys, RLS-protégées. Utilisées uniquement par les Edge Functions, jamais exposées au navigateur. Pour Apify, voir https://console.apify.com/account/integrations. »

ONGLET 5 — ADMIN PROMPTS (composant AdminPromptsConfig)
- Liste des 4 prompts seed + custom (Reddit, arXiv, X, Synthesis, Custom).
- Chaque ligne : nom + badge task_kind + boutons (Pencil, Play, History, Trash si pas seed).
- Bouton « Run » avec Cost Guard avant exécution.
- Si template référence {{run:<kind>}} → dialog RunComposeOptionsDialog avec checkbox « Composer la chaîne » + slider « Fraîcheur max (heures) » 1-72 default 6 + warning « Multiplie le coût par N ».
- Output dialog : markdown rendu + section « Chaîne exécutée » avec badges source (cached/cascade/missing/cycle/depth_limit).

ONGLET 6 — BRANDING
- Input « Nom de l'application » (text, max 32 chars). Note : « Sera affiché dans toute l'application, y compris la homepage publique si vous êtes connecté. Default : Kairos. »
- Input « Couleur primaire » (color picker + hex input, validation #RRGGBB).
- Upload « Logo » (drop zone, max 1 MB, PNG/SVG, output URL stockée).
- Preview live à droite (mockup d'une page de l'app avec le branding appliqué).
- Bouton « Sauvegarder ».

VARIANTES / ÉTATS
- Loading global : skeleton sur les onglets.
- Save success : toast « Paramètres sauvegardés » sonner.
- Save error : toast erreur avec détail.
- Onglet inactif : opacity-60.

ACCESSIBILITÉ
- Tabs avec aria-selected, focus-visible ring.
- Tous les inputs ont label associé.
- Dialog d'édition rubrique : focus trap, Escape ferme, restore focus au déclencheur.
- Color picker : input texte fallback pour ceux qui préfèrent saisir le hex.

OUTPUT
Composant React TypeScript Settings.tsx + 6 sous-composants (ModelsTab, RubricsTab, SourcesTab, ApiKeysTab, AdminPromptsTab, BrandingTab). Utiliser shadcn Tabs / Card / Input / Select / Label / Slider / Button / Dialog / AlertDialog.
```

---

## P09 — Topics / 4 sections trend (Émergents · Déclin · Stables · Calibrage)

### Pourquoi

Mettre en avant la mémoire longue 90 jours. C'est ce qui différencie Kairos d'un simple agrégateur.

### Brief

Page protégée, 4 sections empilées, chaque section = liste de topics avec mini-graphique sparkline + z-score + tooltip explicatif.

### Prompt Stitch

```text
[INCLURE LE PRÉAMBULE DESIGN SYSTEM ICI]

ÉCRAN À GÉNÉRER
Page Topics /topics de Kairos (auth protégée). Suivi de topics émergents sur 90 jours.

LAYOUT
- AppLayout.
- Container max-w-6xl mx-auto px-6 py-8.

EN-TÊTE
- Titre h1 « Topics »
- Sous-titre : « Suivi 90 jours glissants. Algorithme Welford z-score. »
- Bouton « Que regarde-t-on ? » (variant outline, ouvre HelpDialog avec explication z-score, sources, fenêtre).

4 SECTIONS (mt-8, gap-12)

Section 1 — Émergents (titre h2 emerald-600 avec icône TrendingUp)
- Description : « Topics dont le volume + score moyen ont augmenté significativement sur les 7 derniers jours (z-score > 2). »
- Cards grid md:grid-cols-2 lg:grid-cols-3 gap-4.
- Chaque card :
  - Header : nom topic (text-lg font-semibold) + badge z-score « z=3.2 » emerald.
  - Mini sparkline (60 points, courbe emerald-500, area emerald-100).
  - Stats grid 3 colonnes : volume (#signals), score moyen, 1ère apparition.
  - Action « Filtrer le dashboard sur ce topic » (link slate-600 hover:emerald-600).

Section 2 — En déclin (icône TrendingDown orange-500)
- Description : « Topics dont le volume + score moyen ont chuté (z-score < -2). »
- Mêmes cards, sparkline orange.
- Action suggérée : « Sortir de votre rubrique active ? »

Section 3 — Stables (icône Minus slate-500)
- Description : « Topics constants sur la fenêtre 90 j (-1 < z-score < 1). »
- Mêmes cards, sparkline slate.
- Pas d'action suggérée (juste informatif).

Section 4 — Calibrage (icône CircleQuestionMark blue-500)
- Description : « Topics avec sample size insuffisant (< 7 occurrences) — calibrage en cours. »
- Mêmes cards, sparkline pointillée.
- Note : « Re-vérifier dans X jours quand sample sera atteint. »

VARIANTES / ÉTATS
- Empty section : « Aucun topic dans cette catégorie cette semaine. »
- Loading global : 4 skeletons.
- Error : retry button.

ACCESSIBILITÉ
- Sparkline a un aria-label décrivant la tendance (« courbe ascendante 30 j, +45 % volume »).
- Les sections ont des h2 avec id permettant nav anchor.
- Tooltips z-score expliquent la métrique au focus.

OUTPUT
Composant React TypeScript Topics.tsx + TopicCard.tsx + Sparkline.tsx (utiliser Recharts). Données mockées au format { name, zScore, volume, avgScore, sparkline: number[], firstSeen, sampleSize }.
```

---

## P10 — Digest / Brief 80/20 multi-langue

### Pourquoi

Synthèse quotidienne sur laquelle l'utilisateur passe 5 min/jour. Doit être lisible, scannable, exportable.

### Brief

Page protégée, en haut un panneau de configuration (langue, période, min_score), en dessous le brief markdown rendu.

### Prompt Stitch

```text
[INCLURE LE PRÉAMBULE DESIGN SYSTEM ICI]

ÉCRAN À GÉNÉRER
Page Digest /digest de Kairos (auth protégée). Brief 80/20 multi-langue.

LAYOUT
- AppLayout.
- Container max-w-4xl mx-auto px-6 py-8 (plus étroit pour la lecture).

EN-TÊTE
- Titre h1 « Digest 80/20 »
- Sous-titre : « Synthèse des signaux qui comptent, dans votre langue. »

PANNEAU DE CONFIGURATION (Card padding 6, mt-6, fond slate-50)
- 3 contrôles en ligne (md:flex md:gap-6, sinon empilés) :
  - Select langue (3 options : Français · English · Español) — default depuis settings.language
  - Select période (« Dernières 24 h / 7 j / 30 j ») — default 24 h
  - Slider min_score (0-100, default 70) avec label live « Score minimum : {value}/100 »
- Boutons (mt-4, gap-3) :
  - « Générer le brief » (primaire emerald-600, icône Sparkles)
  - « Régénérer » (variant outline, icône RefreshCw, n'apparaît que si déjà un brief)
- Sous le panneau : note (text-xs slate-500) « Le brief consomme tokens LLM (~2 500 tokens). Coût visible dans /costs. »

ZONE DE BRIEF (mt-8, Card, padding 8)
- Si pas de brief encore : empty state « Cliquez sur Générer pour créer votre premier brief. » avec illustration légère.
- Si brief généré :
  - Header (flex justify-between items-center) :
    - Date de génération + badge langue + badge nb signaux résumés.
    - Boutons : « Copier en markdown » (icône Copy), « Télécharger PDF » (icône Download), « Partager par email » (icône Mail).
  - Corps : markdown rendu via react-markdown + plugin GFM. Style prose Tailwind (prose prose-slate prose-lg max-w-none).
  - Sections types attendues du brief : Résumé exécutif, Top 5 signaux, Tendances de la semaine, Recommandations.
  - Footer : « Modèle utilisé : claude-sonnet-4.6 · 2 487 tokens · 0,038 € · 24 signaux résumés sur 47 ≥ score 70 ».

HISTORIQUE DES BRIEFS (mt-12, Card)
- Titre h2 « Briefs précédents »
- Table 4 colonnes : Date, Langue, Nb signaux, Coût, Actions (View / Re-render / Delete).

VARIANTES / ÉTATS
- Loading génération : spinner full-section + texte « Génération en cours… ~30 s ».
- Erreur : « Impossible de générer le brief. » + raison + retry.
- Brief tronqué (cap tokens) : badge warning « Brief tronqué — augmenter max_tokens dans settings ».

ACCESSIBILITÉ
- Slider min_score avec aria-valuenow / valuemin / valuemax.
- Boutons icon-only avec aria-label.
- Le markdown rendu doit avoir une hiérarchie h2/h3 cohérente, accessible aux screen readers.
- Skip-link en haut « Aller au brief » quand un brief est rendu.

OUTPUT
Composant React TypeScript Digest.tsx, utiliser react-markdown + remark-gfm + shadcn Card / Button / Slider / Select. Hook useGenerateDigest pour la mutation.
```

---

## P11 — Costs / Coûts par jour, modèle, tâche

### Pourquoi

Transparence totale sur les dépenses LLM + Apify. Lever l'objection « combien ça me coûte vraiment ».

### Brief

Page protégée, graphes Recharts en haut + tableau de tarifs en bas, filtres date.

### Prompt Stitch

```text
[INCLURE LE PRÉAMBULE DESIGN SYSTEM ICI]

ÉCRAN À GÉNÉRER
Page Costs /costs de Kairos (auth protégée). Coûts détaillés par jour / modèle / tâche.

LAYOUT
- AppLayout.
- Container max-w-7xl mx-auto px-6 py-8.

EN-TÊTE
- Titre h1 « Coûts »
- Sous-titre : « Tracez chaque euro dépensé en LLM et scraping. »
- Stat principale en haut à droite : « Coût mensuel projeté : 18,42 € » (text-2xl font-bold emerald-600).

(A) FILTRES (mt-4, flex gap-3)
- Sélecteur période (7 j / 30 j / 90 j / Custom).
- Sélecteur tâche (Toutes / scoring / scraping / monitoring / digest).
- Sélecteur provider (Tous / OpenRouter / Anthropic / etc.).

(B) 3 KPI CARDS (mt-6, grid md:grid-cols-3 gap-4)
- Carte 1 : « Coût total période » + chiffre big + delta vs période précédente.
- Carte 2 : « Modèle dominant » + nom + part de %.
- Carte 3 : « Signaux scorés » + total + cost per signal.

(C) GRAPHE TIMELINE (mt-8, Card padding 6, h-80)
- Titre « Coût par jour »
- LineChart Recharts : axe X = dates, axe Y = coût €, séries empilées par tâche (couleurs emerald, blue, orange, purple).
- Tooltip au hover : breakdown par tâche.

(D) GRAPHE BREAKDOWN (mt-6, grid md:grid-cols-2 gap-6)
- Carte gauche : PieChart par tâche (Recharts).
- Carte droite : BarChart par modèle (Recharts).

(E) TABLEAU TARIFS (mt-12, Card)
- Titre h2 « Tarifs par modèle »
- Sous-titre « Sources : provider /models endpoints + DB pricing. Mis à jour quotidiennement via refresh-models. »
- Table : Provider, Modèle, Prompt $/1M, Completion $/1M, Cost / signal scoré (estimé).
- Badge « En usage » sur les modèles configurés dans Settings.
- Lignes color-coded : emerald (bon ratio qualité/prix), slate (neutre), orange (cher), red (pas de pricing exposé par le provider).
- Note : « Anthropic / OpenAI / Groq / Together / DeepSeek n'exposent pas de pricing dans /models. Le coût réel se base sur usage.cost retourné par l'API (OpenRouter only le retourne actuellement). »

VARIANTES / ÉTATS
- Empty (aucune dépense encore) : « Lancez votre première pipeline pour voir les coûts apparaître. ».
- Tooltip Recharts : style cohérent (bg slate-900 text-white rounded-md shadow-lg).

ACCESSIBILITÉ
- Tous les graphes ont un aria-label résumant la tendance.
- Tableau tarifs sortable par colonne, headers <th> avec aria-sort.
- KPI cards : valeur lue avant le label par les screen readers (utiliser sr-only pour structure).

OUTPUT
Composant React TypeScript Costs.tsx, utiliser Recharts (LineChart, PieChart, BarChart, Tooltip, ResponsiveContainer). Hook useCosts.
```

---

## P12 — Logs / Activité avec bouton Copier par log

### Pourquoi

Debugging rapide quand un agent se plaint d'un signal non scoré ou d'une erreur LLM. Doit être technique mais lisible.

### Brief

Page protégée, timeline des logs récents (24 h), bouton Copier par log + bulk Copier tout.

### Prompt Stitch

```text
[INCLURE LE PRÉAMBULE DESIGN SYSTEM ICI]

ÉCRAN À GÉNÉRER
Page Logs /logs de Kairos (auth protégée). Timeline d'activité.

LAYOUT
- AppLayout.
- Container max-w-5xl mx-auto px-6 py-8.

EN-TÊTE
- Titre h1 « Logs »
- Sous-titre : « Activité des dernières 24 heures (purge automatique au-delà). »
- Boutons (gap-2) : « Copier les N logs » (variant outline) + « Tout supprimer » (red ghost, confirm dialog).

FILTRES (mt-4, flex gap-3)
- Select status (« Tous / OK / Erreur / Warning »).
- Select action (« Toutes / scoring / scraping / monitoring / dispatch / admin-prompt »).
- Search (Input avec icône, recherche dans payload).

TIMELINE (mt-6, Card avec divides slate-200)

Chaque ligne (padding 4, group hover:bg-slate-50, flex gap-4 items-start) :
- Pastille colorée à gauche (8 px, rounded-full) :
  - OK : emerald-500
  - Warning : orange-500
  - Erreur : red-500
- Contenu central (flex-1) :
  - Header : action (font-mono text-sm slate-700) + status badge + timestamp relatif (« il y a 3 min »).
  - Preview du message d'erreur sur 1 ligne (text-sm slate-500 truncate, 80 chars).
  - Si payload riche : bouton « Voir détail » (chevron) qui ouvre <details> avec JSON formaté.
- Boutons à droite (group-hover:visible, opacity-0 group-hover:opacity-100) :
  - « Copier » (icône Copy, ghost) : copie le JSON complet du log dans le clipboard, toast confirmation.
  - « Détail complet » (icône ExternalLink, ghost) : ouvre Dialog modal avec JSON formaté + syntax highlight.

DIALOG DÉTAIL LOG
- Titre : action + timestamp.
- Corps : <pre> JSON formaté avec syntax highlight (Prism ou similaire).
- Footer : bouton « Copier le JSON » + « Fermer ».

VARIANTES
- Empty : « Aucun log dans la période sélectionnée. »
- Loading : skeleton 8 lignes.
- Erreur fetch : retry.

ACCESSIBILITÉ
- Timeline avec role="log" et aria-live="polite" pour les nouveaux logs en temps réel.
- Boutons icon-only avec aria-label (« Copier le log <action> »).
- JSON formaté dans un <code> avec aria-label « Détail technique du log ».

OUTPUT
Composant React TypeScript Logs.tsx + LogEntry.tsx. Hook useLogs (TanStack Query, refetch toutes les 30 s). Pas de Prism : utiliser simple <pre>{JSON.stringify(payload, null, 2)}</pre> dans un code block.
```

---

## P13 — Onboarding flow (signup → configurateur segment/seats/Maison-BYOK → first-run)

### Pourquoi

Premier moment magique. Doit reduire la friction au minimum tout en collectant le segment + le mode LLM (info pricing critique) ET donner une victoire rapide (first run pipeline).

### Brief

Multi-step wizard 4 étapes : (1) signup auth, (2) Bienvenue + identification segment, (3) Configurateur seats + Maison/BYOK, (4) First run + tour guidé.

### Prompt Stitch

```text
[INCLURE LE PRÉAMBULE DESIGN SYSTEM ICI]

ÉCRAN À GÉNÉRER
Flow d'onboarding complet de Kairos sur 4 étapes (4 écrans à générer en 1 prompt).

LAYOUT GLOBAL
- Pleine largeur, fond white.
- Container centré max-w-2xl mx-auto py-12 px-6.
- Stepper en haut : 4 étapes (Inscription → Profil → Configuration → Premier run).
- Bouton « Quitter » en haut à droite (variant ghost slate-500).

ÉTAPE 1 — INSCRIPTION
Form classique (utilise composant Signup existant).
- Card max-w-md mx-auto.
- Logo Kairos en haut.
- Titre « Créez votre compte Kairos »
- 3 méthodes : Google OAuth + Magic link + Password.
- Lien « Vous avez déjà un compte ? » → /login.
- Mention RGPD + lien CGU.

ÉTAPE 2 — PROFIL (Welcome + segment)
Après auth réussie, redirect vers /onboarding/profile.
- Titre h1 (text-3xl font-bold) : « Bienvenue chez Kairos. »
- Sous-titre slate-600 : « 3 questions rapides pour configurer votre veille. »
- Section h2 « Qui êtes-vous ? » :
  - Grid 2x3 (md:grid-cols-3) de cartes-segment cliquables (radio cards) :
    - VC / Private Equity (icône Briefcase + tarif Maison/BYOK affiché)
    - Cabinet d'avocats (icône Scale + tarif)
    - Newsletter / éditeur (icône Newspaper + tarif)
    - Brand / Marketing (icône Megaphone + tarif)
    - CTO / Tech Lead (icône Code2 + tarif)
    - Solo créateur (icône Rocket + tarif)
  - État sélectionné : border-emerald-500 ring-2 ring-emerald-200, badge Check en haut.
- Bouton « Continuer » en bas (disabled si rien sélectionné).

ÉTAPE 3 — CONFIGURATION (seats + Maison/BYOK)
- Titre h1 « Configurez votre stack. »
- Sous-titre « Vous pouvez changer à tout moment dans Paramètres → Modèles. »
- Section A — Sièges :
  - Slider 1-25 (default selon segment) avec label live.
  - Mention « + de 25 sièges ? Contactez-nous → ».
- Section B — Mode LLM (segmented control) :
  - Onglet « LLM Maison (tout-inclus) » : description « Sonnet économique inclus. Vous payez un forfait stable. ».
  - Onglet « BYOK (vos clés) » : description « Vos clés Anthropic/OpenAI/etc. Vous payez votre conso direct au provider. ».
- Section C — Récap pricing live (Card emerald-50 border-emerald-200) :
  - Calcul automatique selon segment + sièges + mode.
  - Affichage : « 5 sièges × 149 € / siège = 745 € / mois » + ligne « Add-ons proposés (optionnel) ».
- Bouton « Démarrer l'essai 14 j » (primaire) + lien « Comparer tous les plans → /pricing ».
- Note : « Aucune carte requise. Vous serez prévenu 3 jours avant la fin de l'essai. ».

ÉTAPE 4 — PREMIER RUN + TOUR GUIDÉ
- Titre h1 « Lançons votre première pipeline. »
- Sous-titre « Kairos va scraper vos sources sélectionnées et scorer les signaux trouvés. ~2 minutes. »
- Card avec liste preview (sources sélectionnées par défaut selon segment) :
  - X (5 listes IA tier 1)
  - Reddit (12 subs IA core)
  - arXiv (cs.AI, cs.LG, cs.CL, stat.ML)
- Bouton « Lancer la pipeline » (gros, emerald-600 text-white).
- Pendant le run : timeline avec étapes (Scraping → Scoring → Done) + estimated time + progress bar.
- À la fin : « ✓ 47 signaux scorés en 1 min 42 s » + bouton « Voir mon dashboard » → /dashboard.

VARIANTES / ÉTATS
- Stepper : étape active emerald-500, étapes complétées emerald-700, à venir slate-300.
- Étape 2 cards : hover lift + border-slate-300, sélectionné border-emerald-500 ring.
- Étape 3 récap pricing : se met à jour en temps réel quand seats ou mode changent.
- Étape 4 erreur run : « Pipeline a échoué. Cause probable : clé API manquante (Apify ou LLM). » + lien « Configurer mes clés → /settings/api-keys ».

ACCESSIBILITÉ
- Stepper avec role="navigation" aria-label="Progression de l'onboarding".
- Radio cards segment : group avec aria-checked, focusable au clavier, Enter pour sélectionner.
- Annonces aria-live pour les changements d'étape et le récap pricing live.
- Bouton « Lancer la pipeline » avec aria-busy pendant l'exécution.

OUTPUT
4 composants React TypeScript : OnboardingSignup.tsx, OnboardingProfile.tsx, OnboardingConfigurator.tsx, OnboardingFirstRun.tsx + un wrapper OnboardingFlow.tsx avec stepper et state machine simple. Routes /onboarding/{profile|configurator|first-run}.
```

---

## Récap & ordre conseillé d'utilisation

1. **Commencez par P05 (Pricing Configurator)** — c'est la pièce maîtresse, et toutes les sections landing dépendent de la cohérence pricing.
2. **Puis P01 → P02 → P03 → P04 → P06** — landing complète dans l'ordre de scroll.
3. **Puis P07 → P08** — dashboard et settings (pages les plus visitées).
4. **Puis P09 → P10 → P11 → P12** — pages secondaires.
5. **Enfin P13** — onboarding (à itérer après avoir vu le dashboard final pour cohérence visuelle).

Chaque prompt est conçu pour être **autonome** : si vous itérez sur P05, vous n'avez pas besoin de regenerer P01. Stitch garde le design system cohérent grâce au préambule.

## Workflow Stitch suggéré

1. Ouvrir https://stitch.withgoogle.com (compte Google requis, 350 générations/mois Standard).
2. Coller le **préambule complet + 1 prompt** (jamais 2 ensemble).
3. Générer, comparer 2-3 variantes.
4. Choisir la meilleure variante.
5. Soit « Paste to Figma » pour itérer côté design, soit « Export Code » pour HTML/CSS.
6. Adapter le code exporté à React 19 + TS strict + Tailwind v4 + shadcn (déjà dans le repo).
7. Commit dans `src/components/features/landing/` ou page concernée.

## Notes finales

- Stitch n'a pas d'API. Tous les prompts sont à coller manuellement.
- Quota : 350 gen/mois en Standard, plus en Pro. Itérer prudemment.
- Si une génération est mal cadrée, **réduire le prompt** (enlever les états variantes) plutôt que ré-écrire.
- Garder les fichiers exportés (HTML/CSS Stitch + screenshots) dans `docs/design/exports/` pour traçabilité.
