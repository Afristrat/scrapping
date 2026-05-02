# Liste des sous-traitants ultérieurs — Kairos

**Version :** 1.0
**Dernière mise à jour :** `[DATE]`
**Référence :** Annexe A du DPA Kairos.

Ce document recense l'ensemble des sous-traitants ultérieurs (« sous-processors ») auxquels Kairos a recours pour la fourniture de ses Services, conformément à l'**article 28.2 du RGPD** et au DPA signé avec chaque Client.

Toute modification de cette liste fait l'objet d'une notification au Délégué à la Protection des Données (DPO) du Client **au moins 30 jours avant** sa prise d'effet, conformément à la section 7.2 du DPA.

---

## 1. Synthèse

|   # | Sous-traitant                   | Fonction                                       | Juridiction de stockage                | Catégorie de données                                | DPA / CCT                     |
| --: | :------------------------------ | :--------------------------------------------- | :------------------------------------- | :-------------------------------------------------- | :---------------------------- |
|   1 | Supabase Inc.                   | Base de données, Auth, Edge Functions, Storage | EU (Frankfurt) ou Singapore (au choix) | Toutes données utilisateur                          | DPA + CCT                     |
|   2 | Stripe Payments Europe Ltd.     | Facturation et paiements                       | Irlande (UE)                           | E-mail, données de facturation                      | DPA + CCT                     |
|   3 | OpenRouter (OpenRouter Inc.)    | Proxy multi-LLM (mode clé Kairos)              | États-Unis                             | Prompts et résultats LLM                            | DPA + CCT + DPF               |
|   4 | Apify Technologies s.r.o.       | Scraping X / Reddit (mode clé Kairos)          | République Tchèque (UE)                | Configuration de scraping, contenus publics scrapés | DPA                           |
|   5 | Cloudflare Inc.                 | DNS, CDN, protection DDoS, tunnel              | Global (POP le plus proche)            | Adresses IP, métadonnées HTTP                       | DPA + CCT + DPF               |
|   6 | Vercel Inc. (option par défaut) | Hébergement frontend                           | États-Unis (région UE optionnelle)     | Aucune donnée applicative                           | DPA + CCT + DPF               |
|   7 | Coolify (option self-host)      | Hébergement frontend                           | Selon serveur du Client                | Aucune donnée applicative                           | N/A (self-host)               |
|   8 | MinIO (option add-on)           | Stockage objet alternatif                      | Selon hébergement choisi               | Pièces jointes / exports utilisateur                | DPA si SaaS, N/A si self-host |

---

## 2. Détail par sous-traitant

### 2.1 Supabase

- **Raison sociale :** Supabase Inc.
- **Siège :** 970 Toa Payoh North #07-04 Singapore 318992
- **Fonction :** Base de données Postgres, authentification, edge functions Deno, storage objet, planificateur (`pg_cron`).
- **Données traitées :** Toutes données applicatives (signaux, scores, configuration utilisateur, journaux d'audit, logs techniques).
- **Régions disponibles :** EU (Frankfurt) et Singapore. Kairos déploie par défaut en région EU pour les Clients européens.
- **Garanties :**
  - DPA standard signé avec Supabase (`https://supabase.com/legal/dpa`).
  - Clauses Contractuelles Types (CCT) intégrées.
  - Certification SOC 2 Type II.
- **Sous-processors de Supabase :** AWS (infrastructure cloud), Cloudflare (CDN). Liste complète : `https://supabase.com/legal/sub-processors`.

### 2.2 Stripe

- **Raison sociale :** Stripe Payments Europe Limited.
- **Siège :** 1 Grand Canal Street Lower, Dublin 2, Ireland.
- **Fonction :** Traitement des paiements et facturation des abonnements Kairos.
- **Données traitées :** Adresse e-mail du payeur, nom, données bancaires (gérées exclusivement par Stripe en environnement PCI-DSS), historique des paiements.
- **Région de stockage :** Irlande (UE) avec réplication aux États-Unis.
- **Garanties :**
  - DPA Stripe (`https://stripe.com/legal/dpa`).
  - Clauses Contractuelles Types.
  - Certification PCI-DSS niveau 1.

### 2.3 OpenRouter

- **Raison sociale :** OpenRouter Inc.
- **Siège :** Delaware, États-Unis.
- **Fonction :** Proxy multi-LLM permettant l'accès à plusieurs fournisseurs LLM (Anthropic, OpenAI, Google, Mistral, Meta, etc.) via une seule API.
- **Données traitées :** Prompts envoyés (titre, contenu textuel des signaux scrapés, configuration de scoring du Client) et résultats retournés (score, raisonnement).
- **Région de stockage :** États-Unis (transit uniquement, pas de stockage persistant des prompts par défaut).
- **Garanties :**
  - DPA OpenRouter sur demande.
  - Clauses Contractuelles Types.
  - Certification Data Privacy Framework (DPF) lorsque applicable.
- **Important :** Si le Client opère en mode **BYOK** (Bring Your Own Key) en fournissant sa propre clé OpenRouter, OpenRouter est lié au Client par son propre contrat et n'est plus considéré comme sous-traitant ultérieur de Kairos.

### 2.4 Apify

- **Raison sociale :** Apify Technologies s.r.o.
- **Siège :** Vodičkova 704/36, 110 00 Prague 1, République Tchèque (UE).
- **Fonction :** Plateforme de scraping pour la collecte de signaux X / Twitter (`apidojo/twitter-list-scraper`) et Reddit (`automation-lab/reddit-scraper`).
- **Données traitées :** Configuration de scraping (handles, subreddits) et contenus publics collectés.
- **Région de stockage :** République Tchèque (UE).
- **Garanties :**
  - DPA Apify (`https://apify.com/data-processing-addendum`).
  - Pas de transfert hors EEE pour les Clients européens.
- **Important :** Si le Client opère en mode **BYOK** en fournissant son propre token Apify, Apify est lié au Client par son propre contrat.

### 2.5 Cloudflare

- **Raison sociale :** Cloudflare Inc.
- **Siège :** 101 Townsend Street, San Francisco, CA 94107, États-Unis.
- **Fonction :** DNS managé, CDN, protection DDoS, tunnel sécurisé pour les déploiements self-host.
- **Données traitées :** Adresses IP des visiteurs, métadonnées HTTP (user-agent, URL demandée), pas d'accès aux données applicatives chiffrées.
- **Région de stockage :** Global (point de présence le plus proche du visiteur). Option « EU Data Boundary » disponible.
- **Garanties :**
  - DPA Cloudflare (`https://www.cloudflare.com/cloudflare-customer-dpa/`).
  - Clauses Contractuelles Types.
  - Certification Data Privacy Framework (DPF).
  - Certification ISO 27001, SOC 2 Type II.

### 2.6 Vercel (option par défaut, hébergement frontend)

- **Raison sociale :** Vercel Inc.
- **Siège :** 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis.
- **Fonction :** Hébergement statique du frontend React / Vite de Kairos.
- **Données traitées :** Aucune donnée applicative (l'application est une SPA, toutes les données transitent directement vers Supabase). Adresses IP des visiteurs collectées dans les logs Vercel.
- **Région de stockage :** Région de déploiement choisie (EU ou US).
- **Garanties :**
  - DPA Vercel (`https://vercel.com/legal/dpa`).
  - Clauses Contractuelles Types.
  - Certification Data Privacy Framework (DPF).
  - Certification SOC 2 Type II.

### 2.7 Coolify (option self-host)

- **Raison sociale :** Hetzner / OVH / autre hébergeur choisi par le Client (Coolify est un logiciel open source).
- **Fonction :** Plateforme PaaS open-source utilisée pour le déploiement self-host de Kairos sur l'infrastructure du Client.
- **Données traitées :** Aucune. Coolify n'est pas un service tiers : c'est un logiciel open-source installé sur l'infrastructure du Client. L'hébergeur sous-jacent (Hetzner, OVH, AWS, etc.) est lié au Client par son propre contrat.
- **Statut :** Non applicable comme sous-traitant ultérieur de Kairos en mode self-host.

### 2.8 MinIO (option add-on storage)

- **Raison sociale :** MinIO Inc. (mode SaaS) ou logiciel open-source auto-hébergé (mode self-host).
- **Fonction :** Stockage objet alternatif compatible S3 pour les exports volumineux et les pièces jointes éventuelles.
- **Données traitées :** Exports CSV / JSON, archives de signaux historisés.
- **Région de stockage :** Selon configuration du Client.
- **Statut :** Add-on optionnel. En mode SaaS, DPA MinIO requis. En mode self-host, MinIO est un logiciel installé sur l'infrastructure du Client et n'est pas un sous-traitant ultérieur de Kairos.

---

## 3. Cas particulier — mode BYOK (Bring Your Own Key)

Lorsque le Client fournit ses propres clés API auprès des fournisseurs suivants :

- **Fournisseurs LLM** : OpenAI, Anthropic, Google (Vertex AI / Gemini), Mistral AI, Meta (Llama), Cohere, Groq, etc., qu'ils soient accédés directement ou via un agrégateur tiers (OpenRouter, Together, Fireworks, etc.).
- **Fournisseur de scraping** : Apify (token utilisateur).

**Ces fournisseurs ne sont pas considérés comme sous-traitants ultérieurs de Kairos.** Le Client est responsable de la conclusion d'un DPA direct avec ces fournisseurs et de la conformité du transfert de données vers eux.

Kairos se contente, dans ce cas, d'agir comme un intermédiaire technique transmettant les requêtes et les réponses sans stockage persistant des contenus dans son infrastructure (au-delà de ce qui est strictement nécessaire au fonctionnement du Service : table `signals`, table `scores`).

---

## 4. Notification des changements

Toute modification de cette liste (ajout, remplacement, suppression d'un sous-traitant ultérieur) est notifiée au DPO du Client par e-mail au moins **30 jours avant** sa prise d'effet, à l'adresse indiquée dans le DPA.

Le Client dispose d'un droit d'objection motivé. En cas d'objection légitime non résolue à l'amiable dans un délai de 30 jours, le Client pourra résilier le contrat sans pénalité.

---

## 5. Contact

Pour toute question relative à cette liste ou au traitement des données, contactez :

- **Privacy & DPA Kairos** : privacy@kairos.ai-mpower.com
- **DPO Kairos** : dpo@kairos.ai-mpower.com

---

**Variables à remplacer avant communication au Client :** `[DATE]`.

**Avertissement :** Cette liste reflète la configuration standard de Kairos. La configuration effective d'un déploiement Client peut différer selon les options souscrites (région EU, BYOK, self-host, add-on storage). Le DPA signé entre les Parties prévaut.
