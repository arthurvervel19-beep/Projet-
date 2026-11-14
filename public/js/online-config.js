// Connexion au service des salons en ligne (Supabase).
// Cette clé « publishable » est faite pour être publique : elle ne donne accès qu'à ce que les
// règles de la base autorisent (voir supabase/salons.sql). Ne jamais mettre ici la clé secrète.
export const SUPABASE_URL = 'https://biroxehuwwyuknmbczgo.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_GAX7bDlzMSuNJ3ugW7U3mg_xwekVgET';
// change à chaque version incompatible du jeu : deux versions différentes ne peuvent pas jouer ensemble
export const NET_VERSION = 'mp-1';
