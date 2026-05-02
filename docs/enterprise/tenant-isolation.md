# Tenant isolé (add-on Enterprise — +299 €/mois)

> **Statut :** spécification — implémentation cible Wave 6.5.
> **Story d'origine :** S6-TenantIsolated (Wave 6.4).

## 1. Pourquoi ?

Le multi-tenant de Kairos repose par défaut sur le pattern **partagé + RLS** :
toutes les organisations clientes vivent dans le même schéma `public`,
isolées par les politiques Row-Level Security. Ce modèle est solide pour la
quasi-totalité des cas d'usage et permet une exploitation économique.

Trois segments demandent toutefois une isolation **physique** des données :

- **Avocats** : RGPD article 32 (sécurité du traitement) + secret
  professionnel ; un audit externe peut exiger qu'aucun autre tenant ne
  partage la même base de données.
- **VC / PE** : confidentialité des dossiers d'investissement, NDA
  multilatéraux, exigence d'isolation infra de la part des LP.
- **Souveraineté EU** : certains clients exigent que leurs données ne
  cohabitent avec aucune autre organisation, même chiffrées.

Pour ces cas, l'add-on `prod_addon_isolated_tenant` (+299 €/mois) provisionne
un **schéma Postgres dédié** par organisation cliente, avec ses propres
tables, policies, et search_path.

## 2. Architecture cible

```
                 ┌──────────────────────────────────────┐
                 │       Supabase Postgres cluster      │
                 │                                      │
                 │  schema public (tenants partagés)    │
                 │     ├─ signals, scores, ...          │
                 │     └─ RLS via organization_members  │
                 │                                      │
                 │  schema tenant_acme_vc (isolé)       │
                 │     ├─ signals, scores, ...          │
                 │     └─ RLS limitée à 1 org           │
                 │                                      │
                 │  schema tenant_legal_corp (isolé)    │
                 │     └─ ...                           │
                 └──────────────────────────────────────┘
                              ▲
                              │
            client Supabase routé via search_path
            (selon l'org_id du JWT)
```

### 2.1. Provisioning

L'edge function `provision-isolated-tenant/index.ts` (skeleton 501 actuel)
exécutera, en `service_role` :

1. `CREATE SCHEMA tenant_<slug>;`
2. `GRANT USAGE ON SCHEMA tenant_<slug> TO authenticated;`
3. Réplication des tables métier (`signals`, `scores`, `digests`, `topics`,
   `topic_runs`, `topic_signals`, `audit_log`, `usage_records`).
4. Réplication des index, contraintes, triggers `updated_at`.
5. Création des policies RLS — version simplifiée (un seul org_id, donc le
   filtrage devient trivial : `org_id = '<uuid>'` au lieu d'une sous-requête
   sur `organization_members`).
6. Marquage de l'org : `organizations.tenant_schema = 'tenant_<slug>'`.

### 2.2. Reroute du client

Le client Supabase frontend lit `tenant_schema` depuis l'org sélectionnée et
ajoute le header `Accept-Profile: tenant_<slug>` à toutes les requêtes
PostgREST. Pour les edge functions, le `createClient(url, key, { db: { schema:
'tenant_<slug>' } })` est utilisé.

### 2.3. Migrations

Toute migration métier doit être appliquée **deux fois** :

- une fois sur le schéma `public` (multi-tenant partagé)
- une fois par schéma `tenant_*` existant (script de fan-out)

Un script `supabase/scripts/apply-migration-to-isolated-tenants.ts` sera livré
en Wave 6.5 pour automatiser cette boucle.

## 3. Limitations

| Aspect                | Multi-tenant partagé     | Tenant isolé                                |
| --------------------- | ------------------------ | ------------------------------------------- |
| Isolation données     | Logique (RLS)            | Physique (schéma)                           |
| Coût infra par client | Marginal                 | Surcoût significatif (storage + connexions) |
| Migrations            | 1 application            | Fan-out par schéma                          |
| Cross-org analytics   | Possible (admin cockpit) | Impossible nativement                       |
| Backups               | Globaux                  | Globaux mais restaurables par schéma        |
| RGPD article 32       | Conforme                 | Conforme + preuve d'isolation               |

**Pas de partage cross-org** : les fonctionnalités de benchmark / pool de
signaux ne sont pas disponibles pour un tenant isolé. Le client en est
informé à la souscription.

## 4. Pricing

| Composant                                      | Prix                            |
| ---------------------------------------------- | ------------------------------- |
| Add-on `prod_addon_isolated_tenant`            | **+299 €/mois**                 |
| Setup initial (one-time)                       | Inclus                          |
| Migration aller-retour (export → schéma isolé) | Inclus si demandé sous 30 jours |

Refacturation annuelle disponible (-2 mois offerts).

## 5. Activation

**Pas en self-serve.** L'activation passe par le CSM Kairos :

1. Le client demande l'add-on (email ou via le dashboard `/admin` de l'équipe Kairos).
2. Le CSM ouvre un ticket interne et lance manuellement
   `provision-isolated-tenant` avec le payload `{ org_id }`.
3. L'edge fn met à jour `organizations.tenant_schema` et notifie l'org owner.
4. Le frontend détecte le changement et reroute toutes les requêtes vers le
   nouveau schéma à la prochaine session.
5. Une migration des données existantes est exécutée si l'org pré-existe sur
   le multi-tenant partagé.

Le SLA d'activation est de **5 jours ouvrés** à partir de la confirmation
contractuelle.

## 6. Décommissionnement

Si le client résilie l'add-on :

1. Export des données (CSV ou dump SQL) fourni sous 7 jours.
2. Réintégration dans le schéma `public` via un script `merge-isolated-back.ts`.
3. `DROP SCHEMA tenant_<slug> CASCADE` après confirmation écrite.
4. Le marquage `organizations.tenant_schema` est remis à NULL.

## 7. État actuel (Wave 6.4)

- [x] Migration `app_admins` (super-admins Kairos) en place.
- [x] Edge function `provision-isolated-tenant/` créée — renvoie 501.
- [x] Cette documentation rédigée.
- [ ] Implémentation complète du provisioning (Wave 6.5).
- [ ] Script de fan-out des migrations (Wave 6.5).
- [ ] Reroute du client Supabase frontend (Wave 6.5).
- [ ] Tests Playwright bout-en-bout (Wave 6.5).

Pour toute question, contacter l'équipe plateforme via `#kairos-platform`
sur Slack ou par email à `csm@kairos.example`.
