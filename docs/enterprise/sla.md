# Engagement SLA Kairos — Plan Enterprise

> **Statut :** spécification contractuelle — applicable aux organisations
> souscrivant au plan Enterprise (Wave 6.5+).
> **Story d'origine :** S6-SLAMonitoring (Wave 6.5).
> **Source de vérité du statut :** `/status` (page publique) alimentée par
> les sondes définies dans `supabase/functions/health/index.ts`.

## 1. Engagement de disponibilité

Kairos s'engage contractuellement à maintenir un **taux de disponibilité
mensuel de 99,9 %** (« Service Level Objective ») sur les services suivants
pour les organisations souscrivant au plan Enterprise :

| Service          | Description                                                | Périmètre SLA |
| ---------------- | ---------------------------------------------------------- | ------------- |
| Base de données  | Postgres Supabase (lectures, écritures, RLS)               | 99,9 %        |
| Object storage   | MinIO / S3 (mémoire 90 j des topics, exports)              | 99,9 %        |
| LLM Provider     | OpenRouter (scoring, digest, classification)               | 99,5 %        |
| Scraping (Apify) | Collecte X / Reddit                                        | 99,0 %        |
| Edge Functions   | API et webhooks (`run-pipeline`, `digest`, `health`, etc.) | 99,9 %        |
| UI applicative   | Dashboard, Settings, Costs, Audit Log                      | 99,9 %        |

99,9 % de disponibilité mensuelle correspond à **43 minutes 49 secondes
maximum d'indisponibilité par mois calendaire** (calcul sur 30 jours).

## 2. Définition technique de la disponibilité

Un service est considéré comme **disponible** lorsqu'il répond à une sonde
HTTP / SQL :

- en moins de **5 secondes** (timeout de la sonde) ;
- avec un statut applicatif `ok` (HTTP 2xx ou résultat non-erreur côté DB) ;
- pour les services LLM / Apify : si le check `GET /api/v1/models` ou
  `users/me` répond avec un `200 OK`.

Les sondes sont exécutées toutes les **60 secondes** depuis l'edge function
`record-health-check`, sur 4 services indépendants : `db`, `minio`, `llm`,
`apify`. Les résultats sont persistés dans `health_checks` et agrégés en
pourcentage quotidien dans la vue `daily_uptime` (90 j de rétention).

## 3. Calcul du taux de disponibilité

Le taux mensuel s'obtient ainsi :

```
uptime_pct = (checks_ok / checks_total) × 100
```

où `checks_ok` est le nombre de sondes ayant retourné `status = 'ok'` et
`checks_total` le nombre total de sondes effectuées sur la période, hors
fenêtres de maintenance planifiée et hors cas d'exclusion (cf. § 6).

Le résultat est arrondi à **3 décimales**. Un mois ayant un taux de
99,899 % constitue un manquement à l'engagement 99,9 %.

## 4. Crédits de service (Service Credits)

En cas de manquement à l'engagement de disponibilité sur un mois calendaire
donné, Kairos appliquera automatiquement les crédits suivants au cycle de
facturation suivant, sur demande écrite formulée dans les 30 jours :

| Disponibilité mensuelle constatée | Crédit appliqué (% du forfait mensuel) |
| --------------------------------- | -------------------------------------- |
| < 99,9 % et ≥ 99,0 %              | 10 %                                   |
| < 99,0 % et ≥ 95,0 %              | 25 %                                   |
| < 95,0 %                          | 50 %                                   |

Le crédit s'applique **uniquement sur le forfait mensuel récurrent
(abonnement Enterprise)**, hors add-ons, hors consommation BYOK pass-through
(LLM, Apify), hors prestations de support et de Customer Success Manager
facturées séparément.

Le cumul des crédits de service sur un cycle ne peut excéder **50 % du
forfait mensuel**. Les crédits sont déduits du prochain prélèvement et ne
donnent jamais lieu à un remboursement en numéraire.

## 5. Procédure de réclamation

Pour bénéficier d'un crédit, l'organisation cliente doit :

1. Constater le manquement sur la page `/status` (timeline 90 j) ou via les
   logs internes (table `health_checks`, accessible aux owners de l'org).
2. Adresser une demande écrite à `sla@kairos.ai-mpower.com` dans un délai
   maximal de **30 jours calendaires** suivant la fin du mois concerné.
3. Inclure dans la demande : nom de l'organisation, mois concerné, taux
   constaté, capture d'écran de la page `/status` ou identifiant de
   ticket support déjà ouvert pendant l'incident.
4. Kairos répond sous **5 jours ouvrés** avec validation ou contestation
   motivée. En cas de validation, le crédit est appliqué au cycle suivant.

## 6. Exclusions

Les périodes suivantes sont **exclues** du calcul de disponibilité et ne
peuvent en aucun cas donner lieu à un crédit de service :

### 6.1 Maintenance planifiée

Les fenêtres de maintenance planifiée sont annoncées **au moins 72 heures
à l'avance** par e-mail à l'adresse de facturation et publiées sur la page
`/status`. Elles sont limitées à :

- **2 fenêtres de 30 minutes maximum par mois** ;
- programmées entre **02:00 et 06:00 UTC** (heures creuses globales) ;
- hors jours fériés ouvrés en France métropolitaine.

### 6.2 Force majeure

Sont considérés comme cas de force majeure (au sens de l'article 1218 du
Code civil français) :

- catastrophes naturelles (inondations, séismes, tempêtes) ;
- guerres, attentats, troubles civils majeurs ;
- panne généralisée de l'infrastructure cloud sous-jacente (Supabase,
  Vercel, Railway) si elle excède l'engagement SLA du fournisseur ;
- pandémie ou mesures sanitaires bloquant l'accès aux datacenters ;
- attaque cyber-coordonnée (DDoS volumétrique > 100 Gbps soutenu, etc.)
  excédant la capacité de mitigation contractuelle des opérateurs upstream.

### 6.3 Causes imputables au client

- Mauvaise configuration côté client (clés BYOK invalides, quotas
  OpenRouter / Apify dépassés, plafond budget franchi) ;
- Utilisation non conforme des CGU (scraping de sources interdites,
  spam de l'API publique au-delà des rate limits documentés) ;
- Indisponibilité du fournisseur LLM / Apify si le client utilise BYOK :
  dans ce cas, l'engagement SLA porte uniquement sur la capacité de
  Kairos à dispatcher les requêtes vers le provider configuré, pas sur
  la disponibilité du provider lui-même.

### 6.4 Phases de bêta

Les fonctionnalités explicitement marquées « bêta » ou « preview » dans
l'interface ou la documentation **ne sont pas couvertes** par le SLA. Une
fois la fonctionnalité passée en GA (General Availability), le SLA standard
s'applique au cycle de facturation suivant.

## 7. Communication d'incident

En cas d'incident affectant un service couvert par le SLA :

- **Détection (T+0)** : la sonde `health` détecte le statut `down` ; le
  monitoring interne alerte l'équipe d'astreinte (PagerDuty / OpsGenie).
- **Acquittement (T+15 min max)** : un message est publié sur `/status`
  et un e-mail est envoyé aux contacts techniques des organisations
  Enterprise.
- **Mise à jour régulière** : toutes les 30 minutes pendant l'incident,
  ou immédiatement en cas de changement de périmètre.
- **Post-mortem** : sous 5 jours ouvrés après résolution, un rapport
  d'incident détaillé est publié dans la documentation interne et envoyé
  aux contacts Enterprise impactés (cause racine, timeline, actions
  correctives, mesures préventives).

## 8. Révision de l'engagement

Le présent engagement SLA est révisable annuellement. Toute évolution est
notifiée par e-mail et publiée 30 jours avant son entrée en vigueur. Le
client peut résilier sans pénalité dans ce délai s'il refuse la nouvelle
version.

## 9. Référentiels associés

- Statut public en temps réel : <https://kairos.ai-mpower.com/status>
- Historique 90 j : visible directement sur `/status` (timeline)
- Logs détaillés : `docs/architecture.md` § « Health monitoring »
- CGU : <https://kairos.ai-mpower.com/cgu>
- Page d'accueil : <https://kairos.ai-mpower.com>

---

_Dernière mise à jour : Wave 6.5 — Story S6-SLAMonitoring._
