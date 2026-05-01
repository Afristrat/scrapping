-- Active Supabase Realtime sur signals + scores pour push live au dashboard.
-- Le client React s'abonne via supabase.channel().on('postgres_changes', ...).

ALTER PUBLICATION supabase_realtime ADD TABLE signals;
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
