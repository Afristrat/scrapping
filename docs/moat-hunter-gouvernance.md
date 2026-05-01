# Moat Hunter — Gouvernance & Exploitation du Corpus

> Fichier de travail pour la prochaine session Claude Code sur ce repo.
> Généré depuis la session MiroShark/Bassira le 2026-05-01.

---

## Question à répondre avant de commencer

> **Quand tu dis « gouvernance », tu veux dire quoi exactement pour ce projet ?**
>
> - (A) Décider quelles features prioriser sur la roadmap du dashboard
> - (B) Décider comment configurer les rubriques de scoring pour mieux qualifier les signaux
> - (C) Comprendre ce que fait la concurrence (outils de veille IA) pour te différencier
> - (D) Autre chose — précise
>
> Ta réponse détermine le job universel (niveau 3) à partir duquel les analogies inter-industries seront générées.

---

## Contexte projet (rappel)

Ce dashboard scrape **X + Reddit + arXiv**, score les signaux via LLM (OpenRouter), et les présente
dans un dashboard React. Les signaux sont dans la table `signals`, les scores dans `scores`,
les rubriques personnalisables dans `scoring_rubrics`.

Les 3 sources ne sont **pas** équivalentes — elles portent des types de signal différents :

| Source | Ce qu'elle contient | Usage Moat Hunter |
|--------|---------------------|-------------------|
| **Reddit** | Frustrations brutes, workarounds maison, patterns comportementaux | → Signaux de **besoins non articulés** |
| **X/Twitter** | Opinions d'experts, tendances émergentes, controverses | → **Signaux de timing** (qu'est-ce qui monte ?) |
| **arXiv** | Mécanismes validés scientifiquement, innovations pré-produit | → **Analogies d'industries** non encore transposées en produit |

---

## Framework Moat Hunter — 3 phases

### Phase 1 — Abstraction du job (à faire en session)

Avant toute analyse, monter au **niveau 3** du job de ce dashboard.

| Niveau | Exemple dashboard veille IA |
|--------|----------------------------|
| Niveau 1 (surface) | « dashboard qui scrape et score des posts IA » |
| Niveau 2 (fonction) | « filtrer le signal pertinent dans le bruit IA pour un utilisateur donné » |
| Niveau 3 (universel) | **À définir selon ta réponse à la question de gouvernance ci-dessus** |

**Règle de validation :** si le job niveau 3 ne s'applique pas à au moins 5 industries différentes,
il n'est pas assez abstrait — recommencer.

---

### Phase 2 — Expressions Claude Code à utiliser sur le corpus

Copie-colle ces prompts dans Claude Code en pointant vers tes données Supabase.

#### 2A — Extraction du signal Reddit (frustrations → job universel)

```
Analyse les N derniers signaux Reddit de la table signals (source = 'reddit').
Pour chaque groupe thématique :
1. Identifie le "job" que les gens essaient de faire (pas ce qu'ils disent, ce qu'ils veulent accomplir)
2. Identifie la frustration centrale qui bloque ce job
3. Note les workarounds maison qu'ils inventent eux-mêmes
4. Classe par fréquence d'apparition

Format de sortie :
| Job détecté | Frustration centrale | Workaround maison | Fréquence |
```

#### 2B — Extraction du signal arXiv (mécanismes → analogies)

```
Analyse les N derniers signaux ArXiv de la table signals (source = 'arxiv').
Pour chaque paper :
1. Identifie le mécanisme central résolu (en une phrase, sans jargon)
2. Reformule ce mécanisme au niveau universel (applicable à 5+ industries)
3. Propose 2 translations concrètes vers un dashboard de veille IA
4. Note si ce mécanisme existe déjà dans un produit commercial concurrent

Format de sortie :
| Mécanisme source | Job universel | Translation dashboard | Déjà produit ? |
```

#### 2C — Extraction du signal X (tendances → timing)

```
Analyse les N derniers signaux X de la table signals (source = 'x').
Pour chaque cluster thématique :
1. Identifie si c'est en phase de montée, plateau ou déclin (basé sur engagement/score LLM)
2. Note qui en parle (chercheurs, praticiens, grand public, VCs, builders)
3. Identifie la tension non résolue que ce sujet cristallise
4. Donne un score de timing : trop tôt / juste à temps / trop tard

Format de sortie :
| Sujet | Phase | Qui en parle | Tension centrale | Timing |
```

#### 2D — Synthèse inter-sources → Moat Score

```
À partir des 3 tableaux précédents (Reddit + arXiv + X), identifie les features où :
- Reddit montre une frustration forte (besoin réel non résolu)
- arXiv montre un mécanisme résolvant ce besoin (solution académiquement validée)
- X montre que le timing est "juste à temps" (ni trop tôt, ni trop tard)

Pour chaque intersection trouvée, score sur 3 critères (1-5 chacun) :
- Novelty : ce mécanisme est-il déjà dans un produit concurrent de veille IA ?
- Feasibility : peut-on l'intégrer dans ce dashboard en 1 sprint ?
- Moat potential : crée-t-il une dépendance ou un avantage difficile à répliquer ?

Classe par score total décroissant. Propose les 3-5 features prioritaires avec source d'analogie.
```

---

### Phase 3 — Scorer les analogies candidates

Une fois les analogies identifiées, les scorer avec le script du skill moat-hunter :

```bash
python3 ~/.claude/skills/moat-hunter/scripts/moat_scorer.py --analogies analogies.json
```

---

## Format de sortie attendu (fin de session)

```
## Moat Hunt — [Date] — [Contexte sprint]

### Job universel identifié
[Job niveau 3 en une phrase]

### Top 3 features par analogie

#### 1. [Nom feature] — Score: X/15
- Analogie source : [Industrie] → [Mécanisme]
- Translation : [Feature concrète dans ce dashboard]
- Pourquoi personne n'y a pensé : [Explication]
- Effort estimé : S / M / L

### Analogies explorées (toutes)
| Industrie | Mécanisme | Translation | Score |
```

---

## Pistes d'analogies pré-identifiées (à valider selon réponse gouvernance)

Ces analogies sont candidates — elles seront retenues ou écartées selon le job niveau 3 défini.

| Industrie source | Mécanisme | Translation possible pour ce dashboard |
|-----------------|-----------|----------------------------------------|
| Médecine intensive | Score NEWS (6 paramètres vitaux → alerte composite) | Score de santé du corpus : détecter un surge de signaux critiques 6h avant qu'il soit visible |
| Météo | Ensemble forecasting (50 modèles parallèles, divergence = incertitude) | Présenter l'incertitude du scoring LLM explicitement — "3 modèles convergent sur ce signal, 2 divergent" |
| Triage médical | Priorisation sous ressource contrainte | Rubrique de triage dynamique : les 5 signaux à lire absolument ce matin, le reste déprioritisé |
| Aviation (ATIS) | Briefing automatique pré-vol en langage naturel | Digest quotidien généré automatiquement, priorisé par scoring, envoyé avant 8h |
| Renseignement militaire | OSINT cross-sources (recouper plusieurs sources avant de valider) | Signal confirmé seulement si présent sur 2+ sources — réduire les faux positifs |
| Compagnonnage | Chef d'œuvre jugé par pairs | Rubriques partagées entre utilisateurs avec rating — la meilleure rubrique communautaire émerge |
</content>
</invoke>