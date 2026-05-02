-- Seed 15 default topic names into settings.topic_seeds for existing users
-- Depends on: 20260501000001_topics_schema.sql (adds the topic_seeds column)

UPDATE settings SET topic_seeds = ARRAY[
  'LLM / Foundation Models',
  'Fine-tuning & PEFT',
  'Inference & Serving',
  'Agents & Multi-agent',
  'Computer Vision',
  'NLP & Language',
  'Safety & Alignment',
  'Open-source Models',
  'Hardware & Infra',
  'RAG & Retrieval',
  'Robotics',
  'Reinforcement Learning',
  'Embeddings & Vector DB',
  'Code Generation',
  'Multimodal'
]
WHERE topic_seeds = '{}' OR topic_seeds IS NULL;
