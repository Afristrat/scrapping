-- =============================================================================
-- Wave 10A — Story S-10A.2
-- Seed taxonomie topics commune pour toutes les organisations existantes.
-- ~40 topics répartis en 6 catégories parentes.
-- is_seeded = true sur tous les topics insérés ici.
-- Boucle sur toutes les orgs pour insérer le même arbre dans chaque org.
-- =============================================================================
-- Depends on: 20260503210001_topics_taxonomy.sql (topics_taxonomy)
-- =============================================================================

DO $$
DECLARE
  v_org_id    UUID;
  v_ia_tech   UUID;
  v_biz_ia    UUID;
  v_vertical  UUID;
  v_infra     UUID;
  v_politique UUID;
  v_marche    UUID;
BEGIN
  -- Boucle sur chaque organisation existante
  FOR v_org_id IN SELECT id FROM organizations LOOP

    -- =========================================================================
    -- Catégorie 1 : IA Technique
    -- =========================================================================
    INSERT INTO topics_taxonomy (org_id, parent_id, name, slug, description, is_seeded)
    VALUES (v_org_id, NULL, 'IA Technique', 'ia-technique',
            'Recherche et avancées techniques en intelligence artificielle', true)
    ON CONFLICT (org_id, slug) DO NOTHING
    RETURNING id INTO v_ia_tech;

    -- Si le parent existait déjà (ON CONFLICT), récupérer son id
    IF v_ia_tech IS NULL THEN
      SELECT id INTO v_ia_tech FROM topics_taxonomy WHERE org_id = v_org_id AND slug = 'ia-technique';
    END IF;

    INSERT INTO topics_taxonomy (org_id, parent_id, name, slug, description, is_seeded) VALUES
      (v_org_id, v_ia_tech, 'LLM',         'llm',          'Large Language Models : GPT, Claude, Gemini, Llama…',           true),
      (v_org_id, v_ia_tech, 'Agents IA',   'agents-ia',    'Systèmes agentiques, AutoGPT, orchestration d''agents',         true),
      (v_org_id, v_ia_tech, 'RAG',         'rag',           'Retrieval-Augmented Generation et mémoire vectorielle',         true),
      (v_org_id, v_ia_tech, 'Vision',      'vision',        'Computer Vision, modèles image/vidéo, multimodal vision',       true),
      (v_org_id, v_ia_tech, 'Multimodal',  'multimodal',    'Modèles traitant texte, image, audio, vidéo simultanément',     true),
      (v_org_id, v_ia_tech, 'Safety IA',   'safety-ia',     'Alignement, robustesse, red-teaming, jailbreaks',               true),
      (v_org_id, v_ia_tech, 'Éthique IA',  'ethique-ia',    'Biais algorithmiques, fairness, explicabilité, transparence',   true),
      (v_org_id, v_ia_tech, 'IA Act',      'ia-act',        'Réglementation européenne sur l''IA, conformité AI Act',        true)
    ON CONFLICT (org_id, slug) DO NOTHING;

    -- =========================================================================
    -- Catégorie 2 : Business IA
    -- =========================================================================
    INSERT INTO topics_taxonomy (org_id, parent_id, name, slug, description, is_seeded)
    VALUES (v_org_id, NULL, 'Business IA', 'business-ia',
            'Enjeux business, marché et go-to-market autour de l''IA', true)
    ON CONFLICT (org_id, slug) DO NOTHING
    RETURNING id INTO v_biz_ia;

    IF v_biz_ia IS NULL THEN
      SELECT id INTO v_biz_ia FROM topics_taxonomy WHERE org_id = v_org_id AND slug = 'business-ia';
    END IF;

    INSERT INTO topics_taxonomy (org_id, parent_id, name, slug, description, is_seeded) VALUES
      (v_org_id, v_biz_ia, 'Financement VC',    'financement-vc',    'Fonds de capital-risque investissant dans l''IA',              true),
      (v_org_id, v_biz_ia, 'Levée de fonds',    'levee-de-fonds',    'Annonces de levées de fonds (Seed, Série A/B/C…)',             true),
      (v_org_id, v_biz_ia, 'Branding IA',       'branding-ia',       'Positionnement et communication des acteurs IA',              true),
      (v_org_id, v_biz_ia, 'Newsletters IA',    'newsletters-ia',    'Écosystème des newsletters et médias spécialisés IA',         true),
      (v_org_id, v_biz_ia, 'Go-to-market',      'go-to-market',      'Stratégies GTM, pricing, distribution produits IA',           true)
    ON CONFLICT (org_id, slug) DO NOTHING;

    -- =========================================================================
    -- Catégorie 3 : Vertical IA
    -- =========================================================================
    INSERT INTO topics_taxonomy (org_id, parent_id, name, slug, description, is_seeded)
    VALUES (v_org_id, NULL, 'Vertical IA', 'vertical-ia',
            'Applications sectorielles de l''IA par industrie', true)
    ON CONFLICT (org_id, slug) DO NOTHING
    RETURNING id INTO v_vertical;

    IF v_vertical IS NULL THEN
      SELECT id INTO v_vertical FROM topics_taxonomy WHERE org_id = v_org_id AND slug = 'vertical-ia';
    END IF;

    INSERT INTO topics_taxonomy (org_id, parent_id, name, slug, description, is_seeded) VALUES
      (v_org_id, v_vertical, 'LegalTech',  'legaltech',   'IA appliquée au droit : contrats, jurisprudence, compliance',    true),
      (v_org_id, v_vertical, 'HealthTech', 'healthtech',  'IA en santé : diagnostics, bio-informatique, drug discovery',    true),
      (v_org_id, v_vertical, 'FinTech',    'fintech',     'IA en finance : trading algo, scoring crédit, fraude',           true),
      (v_org_id, v_vertical, 'EdTech',     'edtech',      'IA en éducation : tutorat, évaluation, personnalisation',        true),
      (v_org_id, v_vertical, 'PropTech',   'proptech',    'IA en immobilier : évaluation, recommendation, building',        true)
    ON CONFLICT (org_id, slug) DO NOTHING;

    -- =========================================================================
    -- Catégorie 4 : Infra & Outils
    -- =========================================================================
    INSERT INTO topics_taxonomy (org_id, parent_id, name, slug, description, is_seeded)
    VALUES (v_org_id, NULL, 'Infra & Outils', 'infra-outils',
            'Infrastructure, outillage et plateformes MLOps', true)
    ON CONFLICT (org_id, slug) DO NOTHING
    RETURNING id INTO v_infra;

    IF v_infra IS NULL THEN
      SELECT id INTO v_infra FROM topics_taxonomy WHERE org_id = v_org_id AND slug = 'infra-outils';
    END IF;

    INSERT INTO topics_taxonomy (org_id, parent_id, name, slug, description, is_seeded) VALUES
      (v_org_id, v_infra, 'MLOps',       'mlops',        'Déploiement, monitoring et cycle de vie des modèles ML',          true),
      (v_org_id, v_infra, 'Compute GPU', 'compute-gpu',  'Marché des puces, NVIDIA, AMD, cloud GPU, on-prem',               true),
      (v_org_id, v_infra, 'Open Source', 'open-source',  'Modèles et outils IA open-source (Llama, Mistral, HF…)',          true),
      (v_org_id, v_infra, 'APIs',        'apis',         'APIs IA (OpenAI, Anthropic, Cohere, Groq, etc.)',                  true),
      (v_org_id, v_infra, 'Frameworks',  'frameworks',   'LangChain, LlamaIndex, DSPy, CrewAI, Instructor…',                true)
    ON CONFLICT (org_id, slug) DO NOTHING;

    -- =========================================================================
    -- Catégorie 5 : Politique & Régulation
    -- =========================================================================
    INSERT INTO topics_taxonomy (org_id, parent_id, name, slug, description, is_seeded)
    VALUES (v_org_id, NULL, 'Politique & Régulation', 'politique-regulation',
            'Cadres légaux, normes et souveraineté numérique', true)
    ON CONFLICT (org_id, slug) DO NOTHING
    RETURNING id INTO v_politique;

    IF v_politique IS NULL THEN
      SELECT id INTO v_politique FROM topics_taxonomy WHERE org_id = v_org_id AND slug = 'politique-regulation';
    END IF;

    INSERT INTO topics_taxonomy (org_id, parent_id, name, slug, description, is_seeded) VALUES
      (v_org_id, v_politique, 'RGPD',                 'rgpd',                  'Protection des données, CNIL, conformité RGPD',                  true),
      (v_org_id, v_politique, 'Lois IA',              'lois-ia',               'Législations nationales sur l''IA hors AI Act européen',          true),
      (v_org_id, v_politique, 'Standards ISO',        'standards-iso',         'Normalisation ISO/IEC 42001, NIST AI RMF',                        true),
      (v_org_id, v_politique, 'Souveraineté numérique', 'souverainete-numerique', 'Cloud souverain, indépendance technologique, GAIA-X',           true)
    ON CONFLICT (org_id, slug) DO NOTHING;

    -- =========================================================================
    -- Catégorie 6 : Tendances Marché
    -- =========================================================================
    INSERT INTO topics_taxonomy (org_id, parent_id, name, slug, description, is_seeded)
    VALUES (v_org_id, NULL, 'Tendances Marché', 'tendances-marche',
            'Mouvements capitalistiques et structurels du marché IA', true)
    ON CONFLICT (org_id, slug) DO NOTHING
    RETURNING id INTO v_marche;

    IF v_marche IS NULL THEN
      SELECT id INTO v_marche FROM topics_taxonomy WHERE org_id = v_org_id AND slug = 'tendances-marche';
    END IF;

    INSERT INTO topics_taxonomy (org_id, parent_id, name, slug, description, is_seeded) VALUES
      (v_org_id, v_marche, 'Funding rounds',         'funding-rounds',         'Tours de table détaillés, montants, investisseurs',          true),
      (v_org_id, v_marche, 'Acquisitions M&A',       'acquisitions-ma',        'Fusions et acquisitions dans l''écosystème IA',               true),
      (v_org_id, v_marche, 'IPOs',                   'ipos',                   'Introductions en bourse de sociétés IA',                      true),
      (v_org_id, v_marche, 'Partenariats stratégiques', 'partenariats-strategiques', 'Alliances, joint ventures et partenariats clés',        true)
    ON CONFLICT (org_id, slug) DO NOTHING;

  END LOOP;

  RAISE NOTICE 'Seed taxonomie Wave 10A : terminé pour toutes les organisations existantes.';
END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
