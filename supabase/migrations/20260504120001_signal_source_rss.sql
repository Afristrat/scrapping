-- Ajout de la valeur 'rss' à l'enum signal_source
-- Requis pour la source RSS/Atom + Google Alerts (Wave 11)
ALTER TYPE signal_source ADD VALUE IF NOT EXISTS 'rss';

NOTIFY pgrst, 'reload schema';
