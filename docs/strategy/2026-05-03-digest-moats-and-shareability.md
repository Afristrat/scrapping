# Moat Hunt — 2026-05-03 — `/digest` shareability & value extraction

> **Contexte sprint** : la page `/digest` génère un brief 80/20 LLM des signaux scorés sur une fenêtre temporelle (24 h / 72 h / 7 j / 30 j), au-dessus d'un score min, dans la langue de l'org (FR / EN / ES). Sortie actuelle = markdown brut affiché dans un panneau, header _Brief stratégique_ + footer cost+model+window+min_score. Founder feedback : « le brief n'est pas exploitable en l'état, il n'est ni partageable, ni par mail ou par les réseaux sociaux ».

> **Objectif** : identifier les features par analogies inter-industries qui transformeraient `/digest` d'un artefact opaque en levier de propagation virale et de prise de décision.

---

## 0. Diagnostic actuel

### Ce qui existe

| Brique           | Implémentation                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline LLM     | `digest` edge fn → top 30 signaux > min_score sur la fenêtre → 1 prompt système multilangue → `dispatch-llm` (BYOK 10 providers) → markdown |
| Format de sortie | 3 sections fixes : _Highlights critiques_ / _Tendances émergentes_ / _À surveiller_. Bullets avec [title](url).                             |
| Stockage         | Table `digests` (id, user_id, language, signal_count, min_score, window_hours, content, model_used, cost)                                   |
| UI               | Render markdown via `react-markdown`, sidebar historique, bouton Supprimer, badge langue                                                    |
| i18n             | FR/EN/ES configurables via `settings.language`                                                                                              |

### Ce qui manque structurellement

1. **0 export, 0 share, 0 distribution** — pas de PDF, pas de copy-markdown, pas d'envoi mail, pas de tweet/LinkedIn share, pas de webhook Slack
2. **Aucune citation traçable** — le markdown contient des liens mais aucune mécanique pour auditer "ce claim vient de quels signaux et avec quelle confiance"
3. **Aucune continuité** — chaque digest est stateless, pas de comparaison avec le précédent, pas de prediction tracking
4. **Format figé** — un seul ton, un seul template, pas adaptable au contexte (lecture / pitch oral / newsletter externe)
5. **Aucune annotation** — le user ne peut pas commenter ou marquer un insight pour son équipe
6. **Pas de niveau de confiance** — un claim "X va shipper Y" et un claim "il y a une rumeur que X" ont le même poids visuel
7. **Bug devise** : `$0.00000` hard-coded ligne 372 (footer cost) — non converti via `useFormatCost`

**Conclusion** : Kairos `/digest` se positionne comme outil de génération AI mais sans la couche distribution+credibility+continuité, il reste un gadget. Tout concurrent direct (Feedly Pro, Refind, Brave Goggles, Pocket) s'arrête au même endroit.

---

## 1. Job universel (Phase 1 — Abstraction)

| Niveau                   | Formulation                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| **Niveau 1 (surface)**   | « Synthétiser des signaux d'IA en un digest LLM 80/20 »                                           |
| **Niveau 2 (fonction)**  | « Transformer un flux de signaux hétérogènes en intelligence partageable »                        |
| **Niveau 3 (universel)** | **« Convertir un volume de signaux faibles non triés en conviction actionnable et propageable »** |

### Test : ce job s'applique-t-il à ≥ 5 industries ?

| Industrie                 | Comment elle résout ce job                                                 |
| ------------------------- | -------------------------------------------------------------------------- |
| Finance equity research   | Earnings calls + filings + buy-side chatter → morning notes → trades       |
| Médecine evidence-based   | Études RCT + cohort → guidelines cliniques → décision thérapeutique        |
| Renseignement / défense   | HUMINT + SIGINT + OSINT → PDB → décision présidentielle                    |
| Journalisme               | Tips + leaks + interviews → article → opinion publique                     |
| Sales / SDR (Common Room) | Buying signals (job change, hiring, tech stack) → playbook → meeting booké |
| Légal                     | Jurisprudence brute → fiche d'arrêt → conseil au client                    |
| Scouting sport            | Vidéos matchs + stats → report scout → recrutement 50 M€                   |
| VC dealflow               | Décks + calls founders + traction → memo IC → ticket investi               |
| Crypto on-chain           | Glassnode + Messari → research note → trade                                |
| Politique / lobbying      | Polls + grassroots + sondages → mémo stratégique → décision campagne       |

✅ **10 industries indépendantes** → abstraction valide. On est bien au niveau universel.

---

## 2. Analogies inter-industries (Phase 2 — Hunt)

15 mécanismes identifiés depuis 12 industries, classés par densité de transposabilité.

### A. Calibration & traçabilité

#### 1. **Words of Estimative Probability** _(Renseignement — PDB / NIE / Sherman Kent 1964)_

**Mécanisme** : chaque assertion est qualifiée par un terme normé (_almost certainly_ > 90 % / _very likely_ 75-90 % / _likely_ 55-75 % / _roughly even chance_ 45-55 % / _unlikely_ 25-45 % / _very unlikely_ 10-25 % / _almost no chance_ < 10 %). Légende publique des seuils, jamais ambiguë.
**Tension résolue** : décideur sans temps doit calibrer son action sur incertitude. Sans terminologie normée, "pourrait" et "va probablement" sonnent pareil mais signifient des choses différentes selon l'analyste.
**Crédibilité** : 60 ans d'usage CIA, NSA, ECDC, GIEC. Reproductible, défendable juridiquement, mémorable.

#### 2. **Pyramide de preuves + Strength of Recommendation** _(Médecine — Cochrane / GRADE)_

**Mécanisme** : chaque recommandation porte un grade A/B/C selon la qualité des sources sous-jacentes (RCT > cohort > case series > expert opinion). Strength = importance pour la pratique. Quality of evidence = robustesse de l'évidence.
**Tension résolue** : médecin doit décider sous incertitude, traçabilité légale obligatoire, peer review attendue.
**Crédibilité** : standard mondial Cochrane Reviews (depuis 1993), UpToDate (200 M$ de revenu).

#### 3. **Citation graph + fiche d'arrêt** _(Légal — Doctrine.fr / Lexbase / Westlaw)_

**Mécanisme** : chaque décision pointe vers les arrêts qu'elle cite (rétro-graphe) ET vers les arrêts qui la citent (avant-graphe). Fiche d'arrêt synthétise sommaire + apport principal + portée pratique avec ancrages cliquables.
**Tension résolue** : avocat doit citer la dernière jurisprudence pertinente sous peine de faute pro. Coût de l'erreur asymétrique (négligence vs sur-investigation).

### B. Format & densité

#### 4. **Smart Brevity** _(Newsletter — Axios)_

**Mécanisme** : format codifié à 4 sections par item (_Why it matters_ / _The big picture_ / _By the numbers_ / _What's next_) en bullets de < 30 mots chacun. Smart Brevity Score algorithmique mesure la densité info / mot. Lecteur skim attendu = 11 secondes.
**Tension résolue** : info-overload. Le lecteur n'a pas le temps d'extraire le "so what" lui-même — c'est le rédacteur qui le sert.

#### 5. **Speaker notes / Talking points** _(VC dealflow — Galaxy briefs / NfX / Carta IC memos)_

**Mécanisme** : chaque insight a deux versions — la version _lecture_ (paragraphe) ET la version _oralisation_ (5-15 secondes pour pitcher en réunion, formulation conversationnelle). Le board / IC reçoit un PDF, l'analyste pitche depuis les talking points.
**Tension résolue** : 80 % de l'usage B2B d'un brief = "j'ai 5 min pour pitcher mon board sur X". Le format markdown = pas adapté à l'oral.

#### 6. **Inverted pyramid + TLDR-first** _(Journalisme — Politico Playbook / Axios AM)_

**Mécanisme** : titre = conclusion. Premier paragraphe = answer, contexte, stakes en 3 phrases. Détails progressivement plus granulaires en descendant. Le lecteur peut s'arrêter à n'importe quel niveau de la pyramide.
**Tension résolue** : agenda-setting matinal, lecteur skim sur mobile en 30 sec entre métro et bureau.

### C. Distribution & viralité

#### 7. **One-pager PDF brandé exportable** _(Crypto research — Galaxy / Messari / Glassnode)_

**Mécanisme** : bouton « Export PDF » sur chaque research note → génère un A4 brandé client (logo + couleurs) + watermark Messari/Galaxy. Intermediaire envoie ce PDF à son board ou client. Distribution gratuite avec branding payant.
**Tension résolue** : un trader/analyste ne re-ressaisit pas l'info, il forwarde. Un PDF brandé = légitimité institutionnelle + acquisition channel pour le research provider.

#### 8. **Embed quotes / Share cards** _(Newsletter — Stratechery / Substack / Medium)_

**Mécanisme** : sélection d'un paragraphe → bouton « Tweet this » génère une image carrée brandée avec le quote + auteur + URL canonical. Tweet = backlink gratuit + acquisition.
**Tension résolue** : insights partageables = distribution organique. Mais format "lien article" = mort sur Twitter (algos bury). Format "image avec quote" = engagement 5x.

#### 9. **Auto-distribution Slack/Email** _(Sales — Common Room / Signals.fyi)_

**Mécanisme** : signal détecté → webhook Slack canal `#veille-ia` avec @mentions auto selon segment + suggested playbook. Push, pas pull. Habitude formée.
**Tension résolue** : digest dashboard = friction de visite. Slack channel = lecture passive, conversation immédiate, équipe alignée.

#### 10. **Audio brief TTS** _(Podcast — NPR Up First / Bloomberg / Apple News)_

**Mécanisme** : version audio MP3 du digest, 3-7 min, partageable comme un podcast. ElevenLabs / Play.ht / OpenAI TTS API. Chapter markers par section.
**Tension résolue** : commute, salle de sport, multitasking. Eyes-busy mais ears-free contexts = +2 h/jour de attention captée.

### D. Continuité & track record

#### 11. **Diff entre digests successifs** _(Notion version history / `git diff`)_

**Mécanisme** : un digest est généré → comparé au précédent (même fenêtre/score) → panneau « Ce qui a changé depuis hier » : nouveaux signaux, topics qui ont gagné/perdu en importance, prédictions précédentes vs réalité.
**Tension résolue** : digests = stateless aujourd'hui. Mais le vrai value se révèle dans le trend over time. Mémoire = lock-in.

#### 12. **Prediction tracking + Brier score** _(Prediction markets — Manifold / Metaculus / Kalshi / Tetlock 2017)_

**Mécanisme** : insights qui contiennent une prédiction sont auto-tagués → recheck 30 j plus tard si vérifié → score Brier global de l'org. « Kairos vous a alerté X jours avant le marché sur Y%. »
**Tension résolue** : trust building. Concurrents font 0. Asymétrie d'info historique = moat ultra-durable.

### E. Ergonomie collaborative

#### 13. **Annotations + commentaires partagés** _(Hypothes.is / Notion / Roam)_

**Mécanisme** : chaque digest peut être annoté (note privée user) ou commenté (visible team org). Thread par insight. @mentions équipe. Trace des décisions.
**Tension résolue** : la décision basée sur le digest se prend dans un canal séparé (Slack/email), elle est perdue. Co-localiser context + decision = institutional memory.

#### 14. **Newsletter mode externe** _(Stratechery / Substack)_

**Mécanisme** : l'org peut configurer une liste de contacts externes (clients, VIPs) → envoi formaté HTML newsletter avec branding. Devenir le "voice" de la veille IA pour ses clients.
**Tension résolue** : cabinets avocats / VC veulent forwarder le digest à clients pour positionner leur expertise. Aujourd'hui = copy/paste manuel.

### F. Intelligence collective

#### 15. **Cross-org consensus benchmark** _(Wall Street consensus / TheTie crypto / Bloomberg surveys)_

**Mécanisme** : « Votre digest indique X. Le consensus anonymisé des autres orgs Kairos sur ce topic est Y. » Wisdom of the crowd, sans déanonymisation.
**Tension résolue** : un digest individuel = solitude éditoriale. Le consensus = validation sociale + identification d'écarts (alpha).

---

## 3. Translate & Score (Phase 3)

Critères de scoring (1-5 chacun, total /15) :

- **Novelty** : aucun concurrent direct en veille IA ne le fait
- **Feasibility** : effort technique inverse (5 = trivial, 1 = projet de 6 mois)
- **Moat potential** : combien c'est défensif et durable

| #   | Feature Kairos                                           | Source d'analogie  | Novelty | Feasibility | Moat | **Total** | Effort |
| --- | -------------------------------------------------------- | ------------------ | ------: | ----------: | ---: | --------: | ------ |
| 1   | **Niveaux de confiance Words of Estimative Probability** | Renseignement PDB  |       5 |           3 |    5 |    **13** | M      |
| 2   | **Mode Pitch — speaker notes**                           | VC IC memos        |       5 |           4 |    4 |    **13** | S/M    |
| 3   | **One-pager PDF brandé exportable**                      | Galaxy/Messari     |       5 |           4 |    3 |    **12** | M      |
| 4   | **Diff entre digests successifs**                        | git/Notion         |       5 |           2 |    5 |    **12** | L      |
| 5   | **Citations cliquables + preview cards**                 | Doctrine/Wikipedia |       4 |           3 |    4 |    **11** | M      |
| 6   | **Auto-distribution Slack/Email cron**                   | Common Room        |       3 |           4 |    3 |    **10** | M      |
| 7   | **Newsletter mode externe**                              | Stratechery        |       4 |           3 |    4 |    **11** | M      |
| 8   | **Smart Brevity scoring + Why it matters obligatoire**   | Axios              |       4 |           5 |    2 |    **11** | S      |
| 9   | **Audio brief TTS**                                      | NPR Up First       |       4 |           3 |    3 |    **10** | M      |
| 10  | **Prediction tracking + Brier score**                    | Manifold/Tetlock   |       5 |           1 |    5 |    **11** | L+     |
| 11  | **Annotations + commentaires partagés**                  | Hypothes.is        |       3 |           3 |    3 |     **9** | M      |
| 12  | **Cross-org consensus benchmark**                        | Bloomberg surveys  |       5 |           2 |    5 |    **12** | L      |
| 13  | **Embed quote / share card image**                       | Stratechery        |       4 |           4 |    2 |    **10** | S/M    |
| 14  | **Multi-channel 1-click distribution**                   | tout le monde      |       2 |           4 |    1 |     **7** | M      |
| 15  | **Inverted pyramid TLDR-first**                          | Journalisme        |       3 |           5 |    2 |    **10** | S      |

---

## 4. Top 5 features prioritaires

### #1 — Words of Estimative Probability + niveau de confiance — **Score 13/15**

- **Source** : PDB (President Daily Brief) + GRADE (Cochrane) + ECDC threat assessment
- **Translation Kairos** : modifier le prompt système digest pour que **chaque bullet soit qualifié** par un tag de confiance issu d'une échelle normée Kairos (5 niveaux : _Quasi-certain_ / _Très probable_ / _Probable_ / _Possible_ / _Spéculatif_). Le tag est calculé à partir de :
  - Score moyen des signaux sources (poids 50 %)
  - Corroboration cross-source : X + Reddit + ArXiv ensemble = +30 % bonus
  - Author reputation pondérée (poids 20 %, à activer via Wave 9 Author Reputation feature)
  - Légende publique cliquable expliquant chaque niveau et son seuil
- **Pourquoi personne y a pensé** : intel + santé l'utilisent depuis 60 ans, mais aucun outil AI veille ne le formalise. C'est la _killer feature crédibilité_ pour vendre aux avocats IA Act / VC / brand managers.
- **Implementation note** :
  - Edge fn `digest` : enrichir `signals_for_prompt` avec `confidence_inputs` et étendre le system prompt
  - Frontend `Digest.tsx` : custom `ReactMarkdown` component pour parser `[Quasi-certain]` markers et rendre un Badge couleur
  - Schema migration : `digests.confidence_distribution jsonb` pour analytics ultérieures
- **Effort : M** (~2 jours)

### #2 — Mode Pitch (speaker notes) — **Score 13/15**

- **Source** : VC IC memos (Galaxy / NfX / Carta) + politique briefings Westminster
- **Translation Kairos** : toggle « Mode lecture / Mode pitch » au-dessus du brief. En mode pitch, chaque insight est reformulé en **talking point oralisable** (5-15 sec), avec un intro contextuel "Bonjour, je vais vous parler de…" et des transitions. Génération via prompt variant + même signal set. Stockage : 2 colonnes `content` + `content_pitch` dans `digests`.
- **Pourquoi personne y a pensé** : digests AI = lecture ; or 80 % des usages B2B critiques sont oraux (board, COMEX, IC, client meeting). On ne peut pas lire un markdown technique à un board.
- **Implementation note** :
  - Toggle UI dans le header du brief
  - Génération à la demande (cost incremental visible)
  - Si déjà généré, lecture instantanée
- **Effort : S/M** (~1.5 jour)

### #3 — One-pager PDF brandé exportable — **Score 12/15**

- **Source** : Galaxy Crypto / Messari / Goldman morning notes / Stratechery
- **Translation Kairos** : bouton « Exporter PDF » sur le digest → génère un A4 stylé avec :
  - Logo de l'org (lu depuis `settings.branding.logo_url` Wave 7)
  - Couleurs primaires de l'org
  - Header : segment + nom org + date + fenêtre + min_score
  - Body : Top 5 highlights (vs 30 actuellement, on resserre)
  - Footer : « Généré par Kairos » avec QR code vers le digest live + contact email `labs@<domain>`
- **Pourquoi personne y a pensé** : Feedly/Pocket/Refind exportent en RSS/JSON. Kairos B2B = besoin de **forwarder à un boss / board / client**. Le PDF brandé = légitimité institutionnelle.
- **Implementation note** :
  - Edge fn nouvelle `export-digest-pdf` Deno + `puppeteer-core@chrome-aws-lambda` ou `@react-pdf/renderer`
  - Template HTML séparé du markdown (pour styling print-friendly)
  - QR code via lib légère
  - Signature numérique optionnelle (Wave 10) pour anti-tampering
- **Effort : M** (~2-3 jours)

### #4 — Diff entre digests successifs — **Score 12/15**

- **Source** : Notion version history + `git diff` + Glassnode "what changed this week"
- **Translation Kairos** : quand un digest A est généré et qu'un digest B existe avec mêmes paramètres (fenêtre, score, langue) → calcul auto :
  - Topics qui apparaissent pour la 1ʳᵉ fois ("nouveaux")
  - Topics présents dans B mais absents de A ("résolus / sortis du radar")
  - Topics communs dont l'importance a changé (calculé via z-score Welford déjà en place Wave 5)
  - Prédictions de A qui peuvent être validées contre B
- **Pourquoi personne y a pensé** : digests = stateless one-shot. Mais 80 % de la valeur d'une veille = trend, pas snapshot. Le diff transforme un consommable en série temporelle.
- **Implementation note** :
  - Edge fn `digest` : après génération, fetch précédent digest avec mêmes params, appel LLM dédié pour produire `diff_content`
  - Schema : `digests.previous_digest_id uuid REFERENCES digests` + `digests.diff_content text`
  - Frontend : nouveau panneau "Évolution depuis…" en haut du brief
- **Effort : L** (~3-5 jours, dépend des Wave 5 topic primitives)

### #5 — Citations cliquables + preview cards — **Score 11/15**

- **Source** : Doctrine.fr (citation graph) + Wikipedia footnotes + Perplexity AI (state of art)
- **Translation Kairos** : modifier le prompt LLM pour qu'il **inline des markers `[^N]`** après chaque claim, mappés à un index de signaux sources. Frontend : chaque marker cliquable ouvre un side panel (Sheet shadcn) avec :
  - Titre du signal source + URL externe
  - Source (X / Reddit / ArXiv) + badge
  - Date + auteur
  - Excerpt du raw_payload
  - Score LLM + reasoning
  - Lien vers la signal page (ouvre Dashboard filtré)
- Hover sur le marker = preview tooltip avec titre + score uniquement.
- **Pourquoi personne y a pensé** : LLM digests = hallucination opaque. Audit trail = compliance + trust. Perplexity le fait pour les recherches web mais pas en veille B2B.
- **Implementation note** :
  - Prompt edit + post-processing pour injecter `[^N]` markers
  - Component `CitationMarker` + `CitationSheet`
  - Schema : pas de change nécessaire, signal_id stocké dans le digest content
- **Effort : M** (~2-3 jours)

---

## 5. Quick wins immédiats (table stakes founder-demande)

Ces features ont un score Moat faible mais sont **bloquantes pour l'usage actuel**. À shipper en priorité même si copyables j+1.

| Feature                                                       |      Effort | Pourquoi                               |
| ------------------------------------------------------------- | ----------: | -------------------------------------- |
| Bouton « Copier markdown »                                    |  XS (5 min) | Le founder pétait sur ça en premier    |
| Bouton « Envoyer par email » avec mailto: + body templated    |  S (30 min) | Mailto évite SMTP backend, ship demain |
| Bouton « Tweet » + « LinkedIn » avec Web Share API + image OG |     S (1 h) | Distribution organique gratuite        |
| Bouton « Télécharger .md »                                    | XS (15 min) | Anchor + Blob, no backend              |
| Fix `$0.00000` → `formatCost(...)` (cf. Wave 8)               |  XS (5 min) | Cohérence devise                       |
| Footer cleanup : actions visibles + groupées                  |  S (30 min) | UX                                     |

**Total quick wins : ~3 heures de dev pour cliquer 6 boutons en bas du digest.**

---

## 6. Roadmap proposée

### Sprint 1 (quick wins, 1 jour)

- Boutons Copier/Email/Tweet/LinkedIn/Markdown download
- Fix bug devise footer
- **Livrable : un brief partageable en 1 click**

### Sprint 2 (Niveau de confiance + Mode Pitch, 4-5 jours)

- Words of Estimative Probability dans le prompt + UI badges
- Toggle Mode Pitch + génération à la demande
- **Livrable : crédibilité PDB + usage oral board**

### Sprint 3 (PDF brandé, 3 jours)

- Edge fn `export-digest-pdf` avec Puppeteer
- Template Material You + branding org
- **Livrable : artefact partageable institutionnel**

### Sprint 4 (Citations cliquables, 3 jours)

- Prompt + post-processing markers
- Side panel citation
- **Livrable : audit trail complet**

### Sprint 5 (Diff successif, 4 jours)

- Schema `previous_digest_id` + `diff_content`
- LLM pass dédiée
- UI panneau "Évolution"
- **Livrable : valeur trend over time, lock-in**

### Sprint 6+ (long terme, à challenger)

- Newsletter mode externe (cabinets avocats / VC clients)
- Audio brief TTS (commute usage)
- Prediction tracking + Brier (track record builder)
- Cross-org consensus benchmark (network effect)

---

## 7. Effets de second ordre

### Acquisition

- **PDF brandé partagé externalement** → 1 viewer = 1 prospect potentiel (logo Kairos en footer + QR vers landing)
- **Tweet share cards** → backlinks SEO + visibilité X
- **Newsletter mode** → cabinets avocats forwardent à 50-200 clients par envoi = ambassadeurs

### Retention / NRR

- **Diff successif** → habitude quotidienne ("voir ce qui a changé depuis hier")
- **Prediction tracking** → effet musée des prédictions = lock-in psychologique
- **Annotations team** → institutional memory = switching cost croissant

### Pricing power

- **Niveau de confiance** + **Audit trail** → permet de monter les segments avocats / VC à 999 €/seat (positionnement = "PDB pour la veille IA")
- **Mode Pitch** → feature seller chez le CTO / DG (vs concurrents qui font lecture seule)
- **Newsletter mode** → tier upsell "Whitelabel +199 €/mois"

### Defensibility long terme

- **Diff + Prediction tracking + Cross-org consensus** = trois mécaniques qui construisent un _historical asset_ impossible à rattraper en jour 1. Plus on grandit, plus la donnée historique vaut, plus le moat se consolide.

---

## 8. Skip list (ne pas implémenter)

Ces features ont été évaluées et écartées :

| Feature                                 | Pourquoi skip                                                    |
| --------------------------------------- | ---------------------------------------------------------------- |
| Smart Brevity Score (algo densité info) | Marginal vs niveau de confiance, peu visible utilisateur         |
| Audio TTS                               | Cool mais usage long-tail (commute), à dépriorisier vs items 1-5 |
| Embed share cards génériques            | Couvert par les boutons quick wins                               |
| Inverted pyramid format                 | Implicite dans le system prompt actuel, pas de gain marginal     |

---

## 9. Conclusion

Le job universel `/digest` = **convertir un volume de signaux faibles en conviction propageable**.

Les 5 features prioritaires sortent toutes d'industries qui ont **tranché ce problème il y a 30+ ans** (renseignement, médecine, légal, VC, journalisme). Aucune n'est implémentée par les concurrents directs Kairos (Feedly, Refind, Brave Goggles, Kagi News). Total effort = **~12-15 jours de dev** pour transformer `/digest` d'un gadget en killer feature.

**ROI attendu** :

- Acquisition : +30-50 % via shareability organique
- Pricing : up-sell crédible vers 999 €/seat segment legal/VC
- Defensibility : 3 features (diff / predictions / consensus) construisent un moat asymétrique impossible à copier à froid

**Décision attendue** : valider Sprint 1 (quick wins, 1 jour) immédiatement. Décider l'ordre Sprint 2-5 selon priorité business (crédibilité avocats / pitch DG / brand institutionnel / audit trail / lock-in retention).

---

_Doc généré 2026-05-03 via skill `moat-hunter` — phases Abstraction + Hunt + Translate._
