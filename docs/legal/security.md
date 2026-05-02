# Security Overview — Kairos

**Version :** 1.0
**Dernière mise à jour :** `[DATE]`
**Référence :** Annexe B du DPA Kairos.
**Contact sécurité :** security@kairos.ai-mpower.com

Ce document décrit l'ensemble des mesures techniques et organisationnelles (MTO) mises en œuvre par Kairos pour assurer la sécurité des données traitées, conformément à l'**article 32 du RGPD** et aux engagements pris dans le DPA Client.

---

## 1. Architecture de sécurité

### 1.1 Principes directeurs

- **Security by design** : la sécurité est intégrée dès la conception, pas ajoutée a posteriori.
- **Privacy by default** : les paramètres par défaut sont les plus protecteurs (pas de partage public, pas de tracking tiers).
- **Defense in depth** : plusieurs couches de protection indépendantes (réseau, base de données, applicatif, audit).
- **Least privilege** : chaque composant et chaque humain n'a accès qu'au strict nécessaire.
- **Zero trust** : aucune confiance implicite, même au sein du périmètre interne.

### 1.2 Schéma de l'architecture

```
[Utilisateur] ──TLS 1.3──> [Cloudflare CDN/DNS] ──TLS 1.3──> [Vercel Frontend]
                                                                    │
                                                                    │ TLS 1.3 + JWT
                                                                    ▼
                                                       [Supabase Edge Functions]
                                                                    │
                                                                    │ TLS 1.3 + RLS
                                                                    ▼
                                                       [Supabase Postgres + Storage]
                                                                    │
                                                                    │ TLS 1.3
                                                                    ▼
                              [LLM provider via OpenRouter ou BYOK] [Apify scrapers]
```

Toutes les communications sont chiffrées de bout en bout en TLS 1.3. La base de données est isolée par RLS Postgres.

---

## 2. Chiffrement

### 2.1 En transit

- **TLS 1.3** obligatoire sur toutes les connexions externes (frontend, API, edge functions).
- Cipher suites modernes uniquement (suppression de SSL 3.0, TLS 1.0, TLS 1.1, TLS 1.2 dépréciée).
- HSTS activé avec `max-age=63072000; includeSubDomains; preload`.
- Certificats TLS gérés par Cloudflare (renouvellement automatique).

### 2.2 Au repos

- **Postgres Supabase** : chiffrement AES-256 at rest géré par Supabase / AWS RDS.
- **Supabase Storage** : chiffrement AES-256 at rest.
- **Sauvegardes** : chiffrées avec la même politique que la base primaire.

### 2.3 Clés API tierces

- Les clés API utilisateur (OpenRouter, Apify) sont stockées dans la table `user_api_keys` (champ `encrypted_key`).
- **Note transparente** : à la date du présent document, le champ `encrypted_key` stocke la clé sans chiffrement applicatif additionnel (legacy). La donnée est protégée par :
  - RLS strict (`own_user_api_keys` policy).
  - Chiffrement AES-256 at rest de la base.
  - TLS 1.3 in transit.
- Une migration vers chiffrement applicatif (KMS Supabase Vault) est planifiée. Voir le suivi dans le dossier `docs/handoffs/`.

---

## 3. Contrôle d'accès

### 3.1 Row Level Security (RLS) Postgres

- **Activée sur 100 % des tables** sans exception.
- Chaque table possède une policy `own_*` qui restreint l'accès au seul `user_id` (ou `org_id`) du token JWT du caller.
- Aucune requête ne peut traverser la frontière utilisateur, même en cas de bug applicatif.
- Vérification automatisée via une migration de garde qui échoue si une nouvelle table sans RLS est introduite.

### 3.2 Authentification utilisateur

- Magic link e-mail via Supabase Auth (pas de mot de passe à gérer).
- Tokens JWT signés (HS256) avec expiration courte (1 heure).
- Refresh token rotatif.
- Sessions invalidables côté serveur en cas de compromission.

### 3.3 RBAC organisationnel

- Système de rôles (`org_role`) pour les déploiements multi-utilisateurs : `owner`, `admin`, `member`, `viewer`.
- Chaque rôle a un périmètre de droits explicite vérifié au niveau RLS et au niveau applicatif.
- Le rôle `viewer` est en lecture seule sur tous les flux.

### 3.4 Accès interne Kairos

- Accès production limité à un nombre restreint de membres de l'équipe Kairos avec besoin opérationnel documenté.
- Authentification forte obligatoire (MFA TOTP ou WebAuthn).
- Tous les accès production sont journalisés.
- Revue trimestrielle des droits d'accès.

---

## 4. Multi-tenancy et isolation

### 4.1 Isolation logique

- Isolation par `user_id` / `org_id` au niveau base de données via RLS Postgres.
- Chaque ligne porte un identifiant de tenant.
- Aucune requête cross-tenant n'est possible.

### 4.2 Isolation physique optionnelle

- Option **self-hosting** disponible pour les Clients exigeant une isolation physique complète : déploiement Kairos sur l'infrastructure du Client (Supabase auto-hébergé ou cloud Client + frontend Coolify ou équivalent).
- En self-host, Kairos n'a aucun accès aux données du Client (sauf intervention support explicitement autorisée et tracée).

### 4.3 Région UE dédiée

- Sur demande, déploiement Kairos en région EU exclusive (Supabase Frankfurt + frontend Vercel EU + Cloudflare EU Data Boundary).
- Aucune donnée applicative ne quitte l'EEE dans ce mode.

---

## 5. BYOK — Bring Your Own Key

### 5.1 Principe

Le Client peut fournir ses propres clés API auprès des fournisseurs LLM (OpenAI, Anthropic, Google, Mistral, etc.) et auprès du fournisseur de scraping (Apify).

### 5.2 Avantages sécurité

- **Souveraineté contractuelle** : le Client traite directement avec son fournisseur LLM, qui n'est plus sous-traitant ultérieur de Kairos.
- **Contrôle des coûts** : facturation directe par le fournisseur sur le compte du Client.
- **Audit indépendant** : le Client conserve l'intégralité des journaux d'appels API auprès de son fournisseur.
- **Conformité sectorielle** : permet au Client d'utiliser des fournisseurs LLM certifiés (HDS, SecNumCloud, etc.) sans dépendance à Kairos.

### 5.3 Stockage des clés BYOK

- Stockage en base via `user_api_keys` (RLS strict).
- Lecture uniquement par les Edge Functions Deno via le helper partagé `_shared/api-keys.ts`.
- Jamais transmis au frontend ni à un tiers autre que le fournisseur ciblé.

---

## 6. Audit log et journalisation

### 6.1 Audit log applicatif

- Pour les Clients ayant souscrit à l'add-on `audit_log` (story S6-AuditLog), un journal d'audit append-only enregistre toutes les actions sensibles :
  - Création / modification / suppression de configuration.
  - Accès aux clés API.
  - Modifications de droits utilisateur.
  - Actions administratives.
- Le journal est exportable au format CSV / JSON depuis l'interface administrateur.
- Conservation : durée souscrite (12 mois standard, jusqu'à 84 mois sur demande pour les secteurs régulés).

### 6.2 Logs techniques

- Logs des edge functions : conservés 24 heures via purge `pg_cron` automatique pour minimiser la rétention.
- Logs Supabase (auth, requêtes API, erreurs) : conservés selon la politique Supabase (7 à 30 jours).
- Logs Vercel / Cloudflare (accès HTTP) : conservés selon la politique des fournisseurs.

### 6.3 Append-only et intégrité

- L'audit log applicatif est append-only : aucune modification ou suppression possible, même par un administrateur.
- Implémenté via une politique RLS qui interdit `UPDATE` et `DELETE` sur la table `audit_log`.

---

## 7. Sécurité applicative et SDLC

### 7.1 Pipeline CI/CD

- Tous les changements de code passent par Pull Request avec revue obligatoire.
- Pipeline CI exécutant : typecheck (`tsc -b --noEmit`), lint (`ESLint --max-warnings 0`), tests unitaires (`Vitest`), tests end-to-end (`Playwright`) sur les parcours critiques.
- Aucun déploiement en production sans validation complète du pipeline (zéro warning, zéro erreur TS).

### 7.2 Gestion des secrets

- Aucun secret en clair dans le code source (vérifié par hook pre-commit).
- Secrets gérés via `npx supabase secrets set` pour les edge functions.
- Variables d'environnement Vercel pour le frontend (jamais de secret dans le bundle JS).

### 7.3 Dépendances

- Surveillance automatique des vulnérabilités via Dependabot (npm) et `npm audit`.
- Mise à jour des dépendances critiques sous 7 jours après publication d'un correctif.
- Revue manuelle des dépendances majeures avant adoption.

### 7.4 Tests de sécurité

- Revue de sécurité interne avant chaque release majeure.
- Tests de pénétration externes annuels (sur demande, à la charge du Client pour les audits Client).

---

## 8. Sauvegardes et continuité d'activité

### 8.1 Sauvegardes

- Sauvegardes Postgres quotidiennes automatiques par Supabase.
- Rétention 7 jours (plan Pro) ou 30 jours (plan Enterprise).
- Point-in-Time Recovery (PITR) disponible sur les plans payants pour restaurer à un instant donné.

### 8.2 Plan de continuité (BCP) et de reprise (DRP)

- RPO (Recovery Point Objective) cible : 24 heures.
- RTO (Recovery Time Objective) cible : 8 heures pour un incident majeur.
- Procédure de bascule documentée vers une région secondaire en cas d'incident régional.
- Test de restauration semestriel.

---

## 9. Réponse aux incidents

### 9.1 Détection

- Monitoring applicatif via les logs Supabase et les alertes Edge Functions.
- Surveillance des métriques de coût LLM pour détecter un usage anormal (potentielle compromission de clé).

### 9.2 Notification

- Notification au Client sous **72 heures maximum** en cas de violation de données affectant ses données (cf. section 10 du DPA).
- Communication via l'adresse e-mail du DPO du Client.

### 9.3 Procédure interne

1. Confinement immédiat de l'incident.
2. Investigation forensique préservant les preuves.
3. Notification aux Clients impactés.
4. Correctif et déploiement.
5. Rapport post-mortem partagé avec les Clients impactés.

---

## 10. Politique de divulgation responsable des vulnérabilités

### 10.1 Contact

Pour signaler une vulnérabilité de sécurité affectant Kairos, contactez **security@kairos.ai-mpower.com**.

### 10.2 Engagement

- Accusé de réception sous 72 heures ouvrées.
- Évaluation initiale de la vulnérabilité sous 7 jours.
- Communication régulière sur l'avancement du correctif.
- Mention publique du chercheur (sauf demande contraire) une fois la vulnérabilité corrigée.

### 10.3 Safe harbor

Kairos s'engage à ne pas engager de poursuite contre un chercheur qui :

- Respecte la présente politique.
- Effectue ses tests de manière éthique (pas d'exfiltration de données, pas de DoS).
- Donne à Kairos un délai raisonnable pour corriger avant divulgation publique (90 jours par défaut).

### 10.4 Programme de bug bounty

Pas de programme formel à ce jour. Une récompense discrétionnaire peut être attribuée pour les vulnérabilités à fort impact.

---

## 11. Certifications et conformité

### 11.1 Statut actuel

- **RGPD** : conformité documentée (DPA, registre des traitements, AIPD sur demande).
- **EU AI Act** : matrice de conformité disponible (`docs/legal/eu-ai-act-compliance.md`).
- **ISO 27001** : non certifié à ce jour, mais alignement progressif des pratiques sur le référentiel.
- **SOC 2 Type II** : non certifié à ce jour (planifié 2027).

### 11.2 Certifications des sous-traitants

- **Supabase** : SOC 2 Type II.
- **Stripe** : PCI-DSS niveau 1, SOC 2 Type II.
- **Cloudflare** : ISO 27001, SOC 2 Type II, PCI-DSS.
- **Vercel** : SOC 2 Type II.

Le Client peut s'appuyer sur ces certifications pour ses propres exigences sectorielles.

---

## 12. Séparation des environnements

- Environnements **développement**, **staging**, **production** strictement séparés.
- Aucune donnée de production en environnement de développement (utilisation de fixtures synthétiques).
- Accès en production réservé à l'équipe d'exploitation.

---

## 13. Sécurité physique

Kairos n'opère aucune infrastructure physique propre. La sécurité physique est déléguée aux fournisseurs cloud (AWS via Supabase, datacenters Vercel, datacenters Cloudflare), tous certifiés ISO 27001 / SOC 2 / PCI-DSS.

---

## 14. Formation et sensibilisation

- Formation sécurité obligatoire à l'embauche pour tous les membres de l'équipe Kairos.
- Sensibilisation continue (phishing, gestion des secrets, OWASP Top 10) au moins annuelle.
- Procédures documentées pour le départ d'un collaborateur (révocation immédiate des accès).

---

## 15. Gouvernance

- **Responsable Sécurité (CISO de fait)** : `[KAIROS_CISO_NAME]` — security@kairos.ai-mpower.com.
- **Délégué à la Protection des Données** : dpo@kairos.ai-mpower.com.
- Revue semestrielle de la politique de sécurité.
- Mise à jour de la matrice des risques au moins annuelle ou à chaque évolution majeure du périmètre.

---

## 16. Contact

- **Sécurité (incidents, vulnérabilités)** : security@kairos.ai-mpower.com
- **Privacy / DPA** : privacy@kairos.ai-mpower.com
- **DPO** : dpo@kairos.ai-mpower.com
- **Compliance IA** : compliance@kairos.ai-mpower.com

---

**Variables à remplacer avant communication au Client :** `[DATE]`, `[KAIROS_CISO_NAME]`.

**Avertissement :** Ce document reflète l'état des mesures de sécurité Kairos à la date indiquée. Il est complémentaire du DPA et ne s'y substitue pas. Pour les exigences sectorielles spécifiques (santé, finance, défense), une revue ad hoc avec l'équipe Kairos est recommandée avant signature contractuelle. Une validation par un avocat IT ou un consultant cybersécurité indépendant est recommandée avant communication officielle à un Client.
