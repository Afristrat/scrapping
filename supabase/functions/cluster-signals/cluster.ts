/**
 * cluster.ts — Fonctions pures pour le clustering de signaux.
 * Implémentations déplacées dans _shared/embeddings.ts (partagées avec
 * topic-classifier et enrich-signal) ; ré-exportées ici pour conserver
 * l'API historique et les tests (cluster.test.ts).
 */

export { cosineSimilarity, isSimilar } from '../_shared/embeddings.ts'
