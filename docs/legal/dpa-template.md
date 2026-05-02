# Data Processing Agreement (DPA) — Kairos

**Version :** 1.0
**Date d'entrée en vigueur :** `[DATE]`
**Référence interne :** DPA-KAIROS-`[ORG_ID]`-`[DATE]`

---

## 1. Parties

**Le Responsable de Traitement** (ci-après « le Client »)

- Raison sociale : `[CLIENT_NAME]`
- Numéro d'enregistrement : `[CLIENT_REGISTRATION]`
- Adresse : `[CLIENT_ADDRESS]`
- Représentant légal : `[CLIENT_REPRESENTATIVE]`
- Délégué à la Protection des Données (DPO) : `[CLIENT_DPO_EMAIL]`

**Le Sous-traitant** (ci-après « Kairos »)

- Raison sociale : Kairos / AI-MPower (`[KAIROS_LEGAL_ENTITY]`)
- Adresse : `[KAIROS_ADDRESS]`
- Contact RGPD : privacy@kairos.ai-mpower.com
- Délégué à la Protection des Données : dpo@kairos.ai-mpower.com

Ci-après désignés ensemble « les Parties ».

---

## 2. Objet et cadre réglementaire

Le présent accord (ci-après « DPA ») est conclu en application de l'**article 28 du Règlement (UE) 2016/679** (ci-après « RGPD ») et a pour objet d'encadrer le traitement des données à caractère personnel effectué par Kairos pour le compte du Client dans le cadre de la fourniture des services Kairos (ci-après « les Services »).

Le DPA fait partie intégrante du contrat principal (Conditions Générales d'Utilisation, Bon de Commande, ou Master Service Agreement) signé entre les Parties. En cas de contradiction entre le contrat principal et le présent DPA sur les questions de protection des données, le DPA prévaut.

---

## 3. Définitions

Les termes utilisés dans le présent DPA sont définis conformément à l'article 4 du RGPD. À titre indicatif :

- **Données personnelles** : toute information se rapportant à une personne physique identifiée ou identifiable.
- **Traitement** : toute opération effectuée sur des données personnelles (collecte, enregistrement, organisation, conservation, etc.).
- **Sous-traitant ultérieur** : tout tiers à qui Kairos confie une partie du traitement (cf. section 7).
- **Violation de données** : une violation de la sécurité entraînant la destruction, la perte, l'altération, la divulgation non autorisée ou l'accès non autorisé à des données personnelles.

---

## 4. Description du traitement (Article 28.3 RGPD)

### 4.1 Objet du traitement

Fourniture d'une plateforme de veille IA agrégée à partir de sources publiques (X / Twitter, Reddit, ArXiv) avec scoring algorithmique par modèles de langage (LLM) et restitution sous forme de tableau de bord, digest et rapports.

### 4.2 Nature du traitement

- Authentification des utilisateurs du Client via magic link e-mail (Supabase Auth).
- Stockage des préférences de veille (handles X, subreddits, catégories ArXiv, prompts de scoring, rubriques).
- Collecte de signaux publics depuis les sources tierces via les sous-traitants ultérieurs (cf. section 7).
- Scoring et résumé des signaux par appel à des modèles LLM (via OpenRouter ou via la clé fournie par le Client en mode BYOK).
- Journalisation technique (logs) à des fins d'audit et de débogage.

### 4.3 Finalités du traitement

| Finalité                                                         | Base légale (Art. 6 RGPD)                                   |
| :--------------------------------------------------------------- | :---------------------------------------------------------- |
| Exécution des Services contractuels                              | Exécution du contrat (Art. 6.1.b)                           |
| Authentification et sécurité du compte                           | Exécution du contrat (Art. 6.1.b)                           |
| Audit et conformité (logs)                                       | Obligation légale et intérêt légitime (Art. 6.1.c et 6.1.f) |
| Facturation et suivi des coûts LLM                               | Exécution du contrat (Art. 6.1.b)                           |
| Amélioration des Services (statistiques agrégées et anonymisées) | Intérêt légitime (Art. 6.1.f)                               |

### 4.4 Durée du traitement

Le traitement est effectué pendant toute la durée du contrat principal et jusqu'à la cessation effective des Services, augmentée des durées de conservation prévues à la section 11.

### 4.5 Catégories de personnes concernées

- Utilisateurs autorisés du Client (employés, prestataires habilités).
- Auteurs des contenus publics scrapés (handles X, auteurs Reddit, auteurs ArXiv) — données strictement publiques publiées par ces personnes elles-mêmes.

### 4.6 Catégories de données traitées

| Catégorie                            | Type de données                                                        | Origine                     |
| :----------------------------------- | :--------------------------------------------------------------------- | :-------------------------- |
| Données d'identification utilisateur | Adresse e-mail, identifiant utilisateur (UUID), nom (optionnel)        | Client                      |
| Données techniques                   | Adresse IP, user-agent, horodatage de connexion                        | Client                      |
| Données de configuration             | Listes de handles, subreddits, catégories, prompts personnalisés       | Client                      |
| Clés API tierces                     | Tokens OpenRouter / Apify chiffrés (mode BYOK)                         | Client                      |
| Contenus publics scrapés             | Tweets, posts Reddit, métadonnées ArXiv (titre, auteur, abstract, URL) | Sources tierces (publiques) |
| Données de facturation               | Coûts LLM par requête, agrégats mensuels                               | Généré                      |
| Logs techniques                      | Erreurs, traces d'exécution des edge functions                         | Généré                      |

### 4.7 Catégories de données sensibles

Kairos ne traite **aucune** donnée sensible au sens de l'article 9 du RGPD (santé, opinions politiques, convictions religieuses, orientation sexuelle, données biométriques, etc.) dans le cadre des Services standard. Le Client s'engage à ne pas configurer la plateforme pour collecter de telles données.

---

## 5. Obligations de Kairos

Kairos s'engage à :

1. **Traiter les données uniquement sur instruction documentée du Client** (le présent DPA et la configuration via l'interface utilisateur valent instruction).
2. **Garantir la confidentialité** : tout personnel ayant accès aux données est soumis à une obligation de confidentialité contractuelle.
3. **Mettre en œuvre les mesures techniques et organisationnelles** décrites en section 6.
4. **Assister le Client** dans la réponse aux demandes des personnes concernées (section 9) et dans la conduite des AIPD (section 12).
5. **Notifier toute violation de données** dans les conditions de la section 10.
6. **Mettre à disposition** toute information nécessaire à la démonstration de la conformité (section 13).
7. **Restituer ou supprimer** les données à la fin du contrat (section 11).

---

## 6. Mesures techniques et organisationnelles (Article 32 RGPD)

### 6.1 Chiffrement

- **En transit** : TLS 1.3 obligatoire sur toutes les connexions (frontend, API, edge functions, base de données).
- **Au repos** : chiffrement AES-256 des bases Postgres Supabase et du stockage Supabase Storage.
- **Clés API tierces** : stockage chiffré dans la table `user_api_keys` (le champ `encrypted_key` contient la clé en clair pour la version actuelle ; un chiffrement applicatif est planifié — voir section 16).

### 6.2 Contrôle d'accès

- **Row Level Security (RLS)** activé sur toutes les tables Postgres sans exception. Aucun utilisateur ne peut accéder aux données d'un autre utilisateur, même en cas de bug applicatif.
- **RBAC** : système de rôles organisationnels (`org_role`) pour les déploiements multi-utilisateurs.
- **Authentification** : magic link e-mail (Supabase Auth) avec expiration des liens et tokens JWT signés.
- **Principe du moindre privilège** : seuls les membres de l'équipe Kairos avec un besoin opérationnel ont accès aux infrastructures de production, sur authentification forte (MFA obligatoire).

### 6.3 Architecture multi-tenant

- Isolation logique stricte par `user_id` / `org_id` au niveau base de données via RLS Postgres.
- Option de **self-hosting** disponible pour les Clients exigeant une isolation physique complète.

### 6.4 BYOK (Bring Your Own Key)

Le Client peut fournir ses propres clés API auprès des fournisseurs LLM (OpenAI, Anthropic, Google, Mistral, etc.) et auprès du fournisseur de scraping (Apify). Dans ce mode, ces fournisseurs ne sont pas considérés comme sous-traitants ultérieurs de Kairos (cf. section 7.3).

### 6.5 Journalisation et auditabilité

- Journal d'audit append-only des actions sensibles (modifications de configuration, accès aux clés API, actions administratives).
- Logs techniques purgés automatiquement sous 24 heures via `pg_cron` pour minimiser la conservation.

### 6.6 Sauvegardes

- Sauvegardes Postgres quotidiennes automatiques par Supabase, conservées 7 jours (plan Pro) ou 30 jours (plan Enterprise).
- Restauration possible à un instant donné (Point-in-Time Recovery) sur les plans payants.

### 6.7 Sécurité applicative

- Revue de code obligatoire sur toute modification du back-end critique.
- Pipeline CI/CD avec typecheck, lint, tests Vitest et Playwright avant déploiement.
- Gestion des secrets via `npx supabase secrets set` (jamais en clair dans le code source).
- Politique de divulgation responsable des vulnérabilités : security@kairos.ai-mpower.com.

Pour le détail complet des mesures de sécurité, se référer à `docs/legal/security.md`.

---

## 7. Sous-traitants ultérieurs (Article 28.2 et 28.4 RGPD)

### 7.1 Autorisation générale

Le Client autorise Kairos à recourir aux sous-traitants ultérieurs listés dans le document `docs/legal/processor-list.md`, accessible à tout moment et mis à jour en cas de changement.

### 7.2 Notification des changements

Kairos s'engage à informer le Client par e-mail (à l'adresse du DPO du Client) **au moins 30 jours avant** l'ajout ou le remplacement d'un sous-traitant ultérieur. Le Client dispose d'un droit d'objection motivé. En cas d'objection légitime non résolue à l'amiable, le Client pourra résilier le contrat sans pénalité.

### 7.3 Cas du mode BYOK

Lorsque le Client fournit ses propres clés API (mode BYOK), les fournisseurs LLM connectés via ces clés relèvent **du contrat direct entre le Client et ces fournisseurs**. Ils ne sont pas considérés comme sous-traitants ultérieurs de Kairos. Le Client est responsable des accords de protection des données avec ces fournisseurs.

### 7.4 Obligations contractuelles équivalentes

Kairos impose à chaque sous-traitant ultérieur des obligations de protection des données équivalentes à celles du présent DPA.

---

## 8. Transferts hors UE / EEE (Articles 44 à 49 RGPD)

Certains sous-traitants ultérieurs sont susceptibles d'effectuer des traitements en dehors de l'Espace Économique Européen (notamment Supabase Singapore, Cloudflare global, Apify République Tchèque — UE).

### 8.1 Garanties appropriées

Pour tout transfert hors EEE, Kairos s'appuie sur :

- Les **Clauses Contractuelles Types** (CCT) de la Commission Européenne (décision 2021/914) signées avec chaque sous-traitant concerné.
- Le **Data Privacy Framework (DPF)** lorsque le sous-traitant est certifié (cas de Cloudflare et de plusieurs fournisseurs LLM US).
- Une **Évaluation d'Impact des Transferts** (Transfer Impact Assessment) documentée sur demande du Client.

### 8.2 Région UE

Sur demande, le Client peut bénéficier d'un déploiement Kairos en région UE exclusive (Supabase EU + hébergement frontend EU). Cette option fait l'objet d'un add-on tarifaire séparé.

---

## 9. Droits des personnes concernées (Articles 15 à 22 RGPD)

Kairos met à la disposition du Client les fonctionnalités suivantes pour répondre aux demandes des personnes concernées :

| Droit                                              | Implémentation Kairos                                                                                                                                   |
| :------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Droit d'accès (Art. 15)                            | Export CSV/JSON intégral des données utilisateur via l'interface Settings                                                                               |
| Droit de rectification (Art. 16)                   | Modification directe via l'interface Settings                                                                                                           |
| Droit à l'effacement (Art. 17)                     | Suppression du compte avec purge cascade des données associées (≤ 30 jours)                                                                             |
| Droit à la limitation (Art. 18)                    | Désactivation du compte sur demande (sans suppression)                                                                                                  |
| Droit à la portabilité (Art. 20)                   | Export CSV/JSON dans un format structuré et lisible par machine                                                                                         |
| Droit d'opposition (Art. 21)                       | Désactivation des fonctionnalités d'analyse / suppression du compte                                                                                     |
| Droit relatif aux décisions automatisées (Art. 22) | Le scoring LLM est un outil d'aide à la décision et n'a pas d'effet juridique sur les personnes ; aucune décision exclusivement automatisée n'est prise |

Lorsque Kairos reçoit directement une demande d'une personne concernée dont les données sont traitées pour le compte du Client, Kairos transmet la demande au Client sans délai et n'y répond pas directement, sauf instruction contraire du Client.

---

## 10. Notification de violation de données (Articles 33 et 34 RGPD)

### 10.1 Notification au Client

En cas de violation de données affectant les données personnelles traitées pour le compte du Client, Kairos notifie le Client dans un **délai maximum de 72 heures** après en avoir pris connaissance, par e-mail au DPO du Client.

### 10.2 Contenu de la notification

La notification contient au minimum :

1. La nature de la violation (catégories et nombre approximatif de personnes et d'enregistrements concernés).
2. Le nom et les coordonnées du DPO Kairos.
3. Les conséquences probables de la violation.
4. Les mesures prises ou proposées pour y remédier et atténuer ses effets négatifs.

### 10.3 Coopération

Kairos coopère pleinement avec le Client pour permettre à celui-ci de respecter ses propres obligations de notification à l'autorité de contrôle (CNIL ou équivalent) et aux personnes concernées.

---

## 11. Cessation des Services et restitution des données

### 11.1 Pendant le contrat

Le Client peut à tout moment exporter l'intégralité de ses données via l'interface utilisateur (formats CSV / JSON).

### 11.2 À la fin du contrat

Au choix du Client (à exprimer dans les 30 jours suivant la cessation) :

- **Restitution** : Kairos met à disposition du Client une archive complète des données dans un délai de 30 jours.
- **Suppression** : Kairos procède à la suppression définitive des données dans un délai de 30 jours, à l'exception des données soumises à obligation légale de conservation (facturation : 10 ans en France).

### 11.3 Confirmation de suppression

Kairos fournit au Client une attestation de suppression sur demande.

### 11.4 Sauvegardes

Les données contenues dans les sauvegardes sont purgées automatiquement selon le cycle de rétention des sauvegardes (7 ou 30 jours).

---

## 12. Analyse d'Impact (AIPD / DPIA)

Lorsque le Client est tenu de réaliser une Analyse d'Impact relative à la Protection des Données (Article 35 RGPD), Kairos lui fournit sur demande :

- Une description technique détaillée du traitement.
- La cartographie des sous-traitants ultérieurs.
- La matrice de conformité EU AI Act (`docs/legal/eu-ai-act-compliance.md`).
- L'overview de sécurité (`docs/legal/security.md`).
- Toute documentation complémentaire nécessaire.

---

## 13. Audit (Article 28.3.h RGPD)

### 13.1 Documentation

Kairos met à la disposition du Client toute la documentation nécessaire pour démontrer le respect des obligations du présent DPA.

### 13.2 Audit sur site

Le Client (ou un auditeur tiers indépendant mandaté par lui) peut, **une fois par an** (et plus en cas de violation avérée), procéder à un audit des installations et procédures de Kairos, sous réserve d'un préavis de 30 jours et de la signature d'un accord de confidentialité.

### 13.3 Frais

Les coûts de l'audit sont à la charge du Client, sauf si l'audit révèle un manquement substantiel imputable à Kairos.

### 13.4 Audit log applicatif

Pour les Clients ayant souscrit à l'add-on `audit_log`, un journal d'audit détaillé et exportable est disponible directement dans l'interface (référence : story S6-AuditLog).

---

## 14. Responsabilité

### 14.1 Limitation

Sans préjudice de l'article 82 du RGPD, la responsabilité de Kairos est limitée aux montants prévus dans le contrat principal.

### 14.2 Indemnisation

Chaque Partie indemnise l'autre des dommages directs résultant d'un manquement de sa part au présent DPA, dans les limites du contrat principal.

---

## 15. Durée et résiliation

Le présent DPA prend effet à la date de signature et reste en vigueur tant que Kairos traite des données pour le compte du Client. Les obligations de confidentialité et de restitution / suppression survivent à la cessation du DPA.

---

## 16. Évolutions

Kairos peut faire évoluer le présent DPA pour tenir compte des évolutions réglementaires, technologiques ou organisationnelles. Toute modification substantielle est notifiée au Client par e-mail au DPO **au moins 30 jours avant** son entrée en vigueur. Les évolutions purement techniques (par exemple, la mise en place du chiffrement applicatif des clés API) sont publiées dans le changelog accessible à privacy@kairos.ai-mpower.com.

---

## 17. Droit applicable et juridiction

Le présent DPA est régi par le droit français. Tout litige relatif à son interprétation ou son exécution relève de la compétence exclusive des tribunaux de `[KAIROS_JURISDICTION]`, sauf disposition impérative contraire.

---

## 18. Signatures

**Pour le Client (`[CLIENT_NAME]`)**

- Nom : `[CLIENT_SIGNATORY_NAME]`
- Fonction : `[CLIENT_SIGNATORY_TITLE]`
- Date : `[DATE]`
- Signature :

**Pour Kairos**

- Nom : `[KAIROS_SIGNATORY_NAME]`
- Fonction : `[KAIROS_SIGNATORY_TITLE]`
- Date : `[DATE]`
- Signature :

---

## Annexes

- **Annexe A** : Liste des sous-traitants ultérieurs — voir `docs/legal/processor-list.md`.
- **Annexe B** : Mesures de sécurité techniques et organisationnelles — voir `docs/legal/security.md`.
- **Annexe C** : Matrice de conformité EU AI Act — voir `docs/legal/eu-ai-act-compliance.md`.

---

**Variables à remplacer avant signature :** `[CLIENT_NAME]`, `[CLIENT_REGISTRATION]`, `[CLIENT_ADDRESS]`, `[CLIENT_REPRESENTATIVE]`, `[CLIENT_DPO_EMAIL]`, `[CLIENT_SIGNATORY_NAME]`, `[CLIENT_SIGNATORY_TITLE]`, `[ORG_ID]`, `[DATE]`, `[KAIROS_LEGAL_ENTITY]`, `[KAIROS_ADDRESS]`, `[KAIROS_JURISDICTION]`, `[KAIROS_SIGNATORY_NAME]`, `[KAIROS_SIGNATORY_TITLE]`.

**Avertissement :** Ce document est un modèle. Il doit être validé par un avocat spécialisé en droit IT / RGPD avant toute signature engageante avec un Client.
