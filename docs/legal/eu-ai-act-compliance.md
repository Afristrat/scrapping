# Matrice de conformité EU AI Act — Kairos

**Version :** 1.0
**Dernière mise à jour :** `[DATE]`
**Référence :** Annexe C du DPA Kairos.
**Texte applicable :** Règlement (UE) 2024/1689 du Parlement européen et du Conseil du 13 juin 2024 établissant des règles harmonisées concernant l'intelligence artificielle (« AI Act »).

Ce document décrit la classification du système Kairos au regard de l'EU AI Act, les obligations applicables et les mesures mises en œuvre par Kairos pour s'y conformer.

---

## 1. Synthèse

| Élément                            | Position Kairos                                                                                                                            |
| :--------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| Statut au regard de l'AI Act       | **GPAI deployer** (utilisateur professionnel de modèles d'IA à usage général)                                                              |
| Statut de fournisseur GPAI         | **Non.** Kairos n'entraîne ni ne distribue de modèle GPAI propriétaire.                                                                    |
| Classification de risque           | **Risque limité** (Article 50 — obligations de transparence)                                                                               |
| Système à haut risque (Annexe III) | **Non applicable.** Kairos n'opère pas dans un domaine listé en Annexe III.                                                                |
| Pratiques interdites (Article 5)   | **Aucune.** Kairos n'exerce aucune des pratiques prohibées.                                                                                |
| Obligations principales            | Transparence (Art. 50), littératie IA (Art. 4), documentation contractuelle                                                                |
| Calendrier d'application           | Articles 5 et 4 : 2 février 2025. Article 50 : 2 août 2026. Pleinement applicable : 2 août 2026 (sauf high-risk Annexe III : 2 août 2027). |

---

## 2. Description du système Kairos

### 2.1 Nature du service

Kairos est un tableau de bord de veille en intelligence artificielle. Le système :

1. Collecte des contenus publics depuis trois sources (X / Twitter, Reddit, ArXiv) selon une configuration définie par l'utilisateur.
2. Soumet ces contenus à un modèle d'IA à usage général (GPAI : OpenAI, Anthropic, Google, Mistral, etc.) via OpenRouter ou via une clé fournie par l'utilisateur (mode BYOK).
3. Restitue à l'utilisateur un score de pertinence (0 à 100), un raisonnement explicatif et un digest synthétique.

### 2.2 Rôle de Kairos dans la chaîne de valeur AI Act

| Acteur AI Act                 | Définition simplifiée                                                       | Position Kairos                                  |
| :---------------------------- | :-------------------------------------------------------------------------- | :----------------------------------------------- |
| **Provider** (Art. 3.3)       | Développe ou fait développer un système d'IA pour le mettre sur le marché   | **Non.** Kairos ne développe pas de modèle d'IA. |
| **GPAI Provider** (Art. 3.63) | Développe ou fait développer un modèle d'IA à usage général                 | **Non.** Aucun modèle propriétaire entraîné.     |
| **Deployer** (Art. 3.4)       | Utilise un système d'IA sous sa propre autorité dans un cadre professionnel | **Oui.** Kairos déploie des LLM tiers via API.   |
| **Distributor / Importer**    | Met à disposition un système d'IA sur le marché de l'Union                  | **Non.**                                         |

Kairos est donc principalement un **deployer de GPAI** (au sens de l'Article 3.4 et du Chapitre V dans son volet aval).

### 2.3 Modèles utilisés

Kairos s'appuie sur des modèles GPAI fournis par des tiers (et cataloguant leur propre conformité AI Act selon le Chapitre V) :

- Anthropic Claude (Sonnet, Opus, Haiku, etc.)
- OpenAI GPT (4o, 5, etc.)
- Google Gemini
- Mistral, Meta Llama, Cohere, Groq, etc. via OpenRouter

L'utilisateur final choisit le modèle utilisé via la page Settings.

---

## 3. Classification de risque (Article 6 et suivants)

### 3.1 Pratiques interdites — Article 5

Kairos **n'exerce aucune** des pratiques interdites par l'Article 5 :

- Pas de manipulation subliminale.
- Pas d'exploitation des vulnérabilités de personnes.
- Pas de notation sociale (« social scoring ») par autorités publiques ou pour leur compte.
- Pas d'évaluation prédictive du risque d'infraction pénale fondée sur le profilage individuel.
- Pas de moisson non ciblée (« untargeted scraping ») d'images faciales pour la reconnaissance faciale.
- Pas d'inférence d'émotions sur le lieu de travail ou dans l'éducation.
- Pas de catégorisation biométrique pour déduire des caractéristiques sensibles.
- Pas d'identification biométrique à distance en temps réel dans l'espace public à des fins répressives.

### 3.2 Systèmes à haut risque — Annexe III

L'Annexe III de l'AI Act liste huit domaines où un système d'IA est qualifié de haut risque. Kairos **n'opère dans aucun** de ces domaines :

| Annexe III                                                                  | Kairos concerné ? |
| :-------------------------------------------------------------------------- | :---------------- |
| 1. Biométrie (identification, catégorisation, reconnaissance d'émotions)    | Non               |
| 2. Infrastructures critiques (eau, gaz, électricité, chauffage)             | Non               |
| 3. Éducation et formation professionnelle (admission, évaluation)           | Non               |
| 4. Emploi, gestion des travailleurs (recrutement, évaluation)               | Non               |
| 5. Accès aux services privés essentiels (crédit, assurance, urgences)       | Non               |
| 6. Application de la loi (profilage, polygraphes, prédiction d'infractions) | Non               |
| 7. Migration, asile, contrôle aux frontières                                | Non               |
| 8. Administration de la justice et processus démocratiques                  | Non               |

**Conclusion :** Kairos n'est pas un système d'IA à haut risque au sens de l'AI Act.

### 3.3 Risque limité — Article 50 (transparence)

Kairos relève du **risque limité**, soumis aux obligations de transparence de l'Article 50.

---

## 4. Obligations applicables et mesures mises en œuvre

### 4.1 Article 4 — Littératie IA (« AI literacy »)

**Obligation :** Les fournisseurs et déployeurs prennent les mesures pour garantir un niveau suffisant de littératie en IA de leur personnel et autres personnes concernées par l'utilisation des systèmes d'IA, en tenant compte de leurs connaissances techniques, de leur expérience, de leur formation et du contexte d'utilisation.

**Date d'application :** 2 février 2025.

**Mesures Kairos :**

- Documentation utilisateur expliquant le fonctionnement du scoring LLM (`docs/architecture.md`, `docs/overview.md`).
- Affichage du raisonnement LLM (chain of thought) à côté de chaque score, permettant à l'utilisateur de comprendre la décision.
- Onboarding utilisateur incluant un explicatif sur les biais possibles des modèles LLM.
- Formation interne de l'équipe Kairos aux fondamentaux de l'AI Act et du RGPD.

### 4.2 Article 50 — Transparence vis-à-vis des utilisateurs finaux

**Obligation 50.1 (interaction avec un système d'IA) :** Les déployeurs s'assurent que les personnes physiques interagissant avec un système d'IA sont informées de cette interaction, sauf si cela est manifeste.

**Obligation 50.4 (génération ou manipulation de contenu) :** Les déployeurs informent les personnes physiques exposées à un contenu généré ou manipulé par IA (par exemple un résumé) du fait que le contenu a été généré ou manipulé artificiellement.

**Date d'application :** 2 août 2026.

**Mesures Kairos :**

- L'interface utilisateur affiche systématiquement une mention claire indiquant que les scores et résumés sont générés par un modèle d'IA (LLM).
- Le nom du modèle utilisé est indiqué pour chaque score (champ `model_used` dans la table `scores`).
- Le raisonnement (champ `reasoning`) est affiché à côté de chaque score pour fournir une transparence complète.
- Les digests générés portent une mention « Généré par IA » dans l'en-tête.
- Aucune fonctionnalité de chat conversationnel directe avec le LLM n'est exposée à l'utilisateur final, donc l'obligation 50.1 ne se déclenche pas dans les flux principaux. Si une telle fonctionnalité est ajoutée, une mention « Vous interagissez avec un assistant IA » sera affichée.

### 4.3 Article 52 — Notification de mise sur le marché

Non applicable : Kairos n'est pas un fournisseur de système d'IA à haut risque.

### 4.4 Chapitre V — GPAI providers (Articles 51 à 56)

Non applicable directement à Kairos : Kairos n'est pas fournisseur GPAI. Cependant, Kairos s'assure que les fournisseurs GPAI utilisés (Anthropic, OpenAI, etc.) publient leur model card / documentation technique conformément à l'Article 53 et 55 (pour les modèles à risque systémique).

Si Kairos venait à entraîner ou ajuster (« fine-tune ») un modèle GPAI propre, les obligations suivantes s'appliqueraient :

- **Article 53.1 :** Documentation technique du modèle, mise à jour régulièrement.
- **Article 53.1.c :** Politique de respect du droit d'auteur de l'Union (Directive 2019/790).
- **Article 53.1.d :** Résumé suffisamment détaillé du contenu utilisé pour l'entraînement, mis à disposition publique.
- **Article 55 :** Pour les modèles à risque systémique (puissance de calcul > 10²⁵ FLOPs ou désigné par la Commission), évaluation des risques, mesures d'atténuation, notification d'incidents graves, cybersécurité.

À la date du présent document, Kairos n'a pas pour projet de devenir fournisseur GPAI. Tout changement de stratégie sera précédé d'une mise à jour de cette matrice.

---

## 5. Articulation avec le RGPD

L'AI Act est complémentaire du RGPD, qui reste pleinement applicable. Voir le DPA Kairos (`docs/legal/dpa-template.md`) pour le détail.

Points d'attention transverses :

- **Décisions individuelles automatisées** (Art. 22 RGPD) : le scoring Kairos est un outil d'aide à la décision, pas une décision automatisée produisant des effets juridiques sur des personnes. L'humain (l'utilisateur Kairos) reste décisionnaire.
- **AIPD / DPIA** (Art. 35 RGPD) : Kairos fournit la documentation nécessaire à la conduite d'une AIPD par le Client (cf. section 12 du DPA).
- **Minimisation** (Art. 5.1.c RGPD) : seules les données strictement nécessaires au scoring sont envoyées au LLM (titre, contenu textuel public, prompt de scoring).

---

## 6. Bonnes pratiques implémentées

### 6.1 Transparence et explicabilité

- Affichage systématique du modèle utilisé (`model_used`) et du raisonnement (`reasoning`) à côté de chaque score.
- Coût LLM par requête tracé dans la table `llm_costs` et restitué à l'utilisateur.
- Documentation publique de l'architecture du pipeline (`docs/architecture.md`).

### 6.2 Gouvernance par défaut

- **BYOK (Bring Your Own Key)** : possibilité pour le Client de souveraineté complète sur le choix du modèle et la relation avec le fournisseur GPAI.
- **Choix du modèle** : l'utilisateur sélectionne explicitement le modèle de scoring, le modèle de digest, etc. via la page Settings.
- **Désactivation** : l'utilisateur peut désactiver à tout moment le scoring automatique.

### 6.3 Sécurité et protection des données

- Voir `docs/legal/security.md` pour le détail.
- RLS Postgres sur toutes les tables.
- Audit log append-only (add-on disponible).
- Chiffrement TLS 1.3 et AES-256 at rest.

### 6.4 Documentation

- Model card disponible sur demande auprès de privacy@kairos.ai-mpower.com.
- Politique de divulgation responsable des vulnérabilités (`docs/legal/security.md`).

### 6.5 Gestion des risques

- Suivi mensuel des incidents de scoring (faux positifs, hallucinations) avec retour utilisateur intégré.
- Possibilité de désactivation immédiate d'un modèle si un incident grave est détecté.
- Cap budgétaire par utilisateur (champ `daily_budget_usd` dans `settings`) pour éviter les usages anormaux.

---

## 7. Calendrier d'application AI Act

| Date           | Articles applicables                                                   |
| :------------- | :--------------------------------------------------------------------- |
| 2 février 2025 | Article 5 (pratiques interdites), Article 4 (littératie IA)            |
| 2 août 2025    | Chapitre V (GPAI providers), gouvernance et autorités notifiées        |
| 2 août 2026    | Article 50 (transparence), majorité des autres obligations             |
| 2 août 2027    | Systèmes à haut risque listés en Annexe I (sécurité produits intégrés) |

Kairos s'assure du respect de chaque jalon à la date applicable.

---

## 8. Mise à jour

Cette matrice est revue **au moins annuellement** ou à chaque évolution substantielle :

- Du périmètre fonctionnel de Kairos.
- De la liste des modèles GPAI utilisés.
- De la classification du système (par exemple, ajout d'une fonctionnalité qui basculerait Kairos en haut risque).
- Des actes délégués ou d'exécution publiés par la Commission Européenne en application de l'AI Act.
- Des lignes directrices publiées par l'AI Office et le Comité Européen de la Protection des Données.

---

## 9. Contact

Pour toute question relative à la conformité AI Act de Kairos :

- **Conformité IA / AI Compliance** : compliance@kairos.ai-mpower.com
- **DPO** : dpo@kairos.ai-mpower.com

---

**Variables à remplacer avant communication au Client :** `[DATE]`.

**Avertissement :** Cette matrice reflète l'analyse de Kairos à la date indiquée et n'engage pas la responsabilité de l'avocat-conseil tant que celui-ci n'a pas validé le document. Il est recommandé de faire valider cette matrice par un avocat spécialisé en droit du numérique avant communication officielle à un Client. L'AI Act fait l'objet d'actes délégués et de lignes directrices en cours de publication par la Commission Européenne et par l'AI Office ; certaines précisions peuvent évoluer.
