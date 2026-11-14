-- Aube des Royaumes — base des salons en ligne (projet Supabase dédié au jeu)
-- Appliqué le 14/11/2026 (migration « salons_multijoueur »). Conservé ici pour mémoire et pour
-- pouvoir recréer la base à l'identique.
--
-- Réglages à faire dans le tableau de bord Supabase (non modifiables en SQL) :
--   * Authentication > Sign In / Providers : activer « Allow anonymous sign-ins »
--   * Realtime > Settings : désactiver « Allow public access » (seuls les canaux privés restent permis)
--
-- Principe : un salon = un code de 5 caractères, 2 joueurs maximum. Les tables ne sont lisibles que
-- par les membres du salon ; création et entrée passent par des fonctions. Le canal temps réel
-- « salon:CODE » est privé : seuls les membres du salon peuvent y écouter et y émettre.

create table public.salons (
  code text primary key check (code ~ '^[A-Z2-9]{5}$'),
  hote uuid not null references auth.users (id) on delete cascade,
  statut text not null default 'attente' check (statut in ('attente', 'en_jeu', 'fini')),
  max_joueurs int not null default 2 check (max_joueurs between 2 and 4),
  cree_le timestamptz not null default now()
);

create table public.salon_joueurs (
  code text not null references public.salons (code) on delete cascade,
  uid uuid not null references auth.users (id) on delete cascade,
  arrive_le timestamptz not null default now(),
  primary key (code, uid)
);
create index salon_joueurs_uid_idx on public.salon_joueurs (uid);
create index salons_hote_idx on public.salons (hote);

alter table public.salons enable row level security;
alter table public.salon_joueurs enable row level security;

-- l'utilisateur courant est-il membre du salon ?
create or replace function public.est_membre(p_code text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.salon_joueurs sj where sj.code = p_code and sj.uid = (select auth.uid()));
$$;

create policy "membres lisent leur salon" on public.salons
  for select to authenticated using ((select public.est_membre(code)));
create policy "membres lisent les joueurs du salon" on public.salon_joueurs
  for select to authenticated using ((select public.est_membre(code)));

-- créer un salon (l'appelant en devient l'hôte)
create or replace function public.creer_salon()
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if v_uid is null then raise exception 'connexion requise'; end if;
  -- ménage : salons de plus d'un jour
  delete from public.salons where cree_le < now() - interval '1 day';
  -- un même joueur ne garde pas plus de 3 salons ouverts
  if (select count(*) from public.salons where hote = v_uid) >= 3 then
    delete from public.salons where code in (select code from public.salons where hote = v_uid order by cree_le asc limit 1);
  end if;
  for attempt in 1..20 loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    end loop;
    begin
      insert into public.salons (code, hote) values (v_code, v_uid);
      insert into public.salon_joueurs (code, uid) values (v_code, v_uid);
      return v_code;
    exception when unique_violation then
      -- code déjà pris : on recommence
    end;
  end loop;
  raise exception 'impossible de créer un salon, réessayez';
end;
$$;

-- rejoindre un salon avec son code (ou y revenir si on en fait déjà partie)
create or replace function public.rejoindre_salon(p_code text)
returns json language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_salon public.salons;
  v_nb int;
begin
  if v_uid is null then raise exception 'connexion requise'; end if;
  select * into v_salon from public.salons where code = v_code for update;
  if not found then raise exception 'salon introuvable'; end if;
  if not exists (select 1 from public.salon_joueurs where code = v_code and uid = v_uid) then
    if v_salon.statut <> 'attente' then raise exception 'la partie a déjà commencé'; end if;
    select count(*) into v_nb from public.salon_joueurs where code = v_code;
    if v_nb >= v_salon.max_joueurs then raise exception 'salon complet'; end if;
    insert into public.salon_joueurs (code, uid) values (v_code, v_uid);
  end if;
  return json_build_object('code', v_salon.code, 'hote', v_salon.hote, 'statut', v_salon.statut);
end;
$$;

-- l'hôte lance la partie : plus personne ne peut entrer
create or replace function public.lancer_salon(p_code text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.salons set statut = 'en_jeu'
  where code = upper(trim(p_code)) and hote = auth.uid() and statut = 'attente';
  if not found then raise exception 'seul l''hôte peut lancer la partie'; end if;
end;
$$;

-- quitter un salon (l'hôte qui part ferme le salon)
create or replace function public.quitter_salon(p_code text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_code text := upper(trim(p_code));
begin
  if exists (select 1 from public.salons where code = v_code and hote = auth.uid()) then
    delete from public.salons where code = v_code;
  else
    delete from public.salon_joueurs where code = v_code and uid = auth.uid();
  end if;
end;
$$;

revoke all on function public.creer_salon() from public, anon;
revoke all on function public.rejoindre_salon(text) from public, anon;
revoke all on function public.lancer_salon(text) from public, anon;
revoke all on function public.quitter_salon(text) from public, anon;
revoke all on function public.est_membre(text) from public, anon;
grant execute on function public.creer_salon() to authenticated;
grant execute on function public.rejoindre_salon(text) to authenticated;
grant execute on function public.lancer_salon(text) to authenticated;
grant execute on function public.quitter_salon(text) to authenticated;
grant execute on function public.est_membre(text) to authenticated;

-- canaux temps réel privés « salon:CODE »
create policy "membres du salon reçoivent" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select realtime.topic()) like 'salon:%'
    and (select public.est_membre(substring((select realtime.topic()) from 7)))
  );
create policy "membres du salon envoient" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select realtime.topic()) like 'salon:%'
    and (select public.est_membre(substring((select realtime.topic()) from 7)))
  );

-- ---------------------------------------------------------------------------------------------
-- Transfert de parties solo entre appareils (migration « sauvegardes_transfert », 14/11/2026)
-- Un code de 6 caractères donne accès à une sauvegarde ; celui qui le connaît peut la récupérer
-- et la mettre à jour. Aucun accès direct à la table : tout passe par les deux fonctions.

create table public.sauvegardes (
  code text primary key check (code ~ '^[A-Z2-9]{6}$'),
  auteur uuid references auth.users (id) on delete set null,
  donnees text not null check (length(donnees) <= 3000000),
  libelle text check (length(libelle) <= 120),
  maj_le timestamptz not null default now()
);
create index sauvegardes_auteur_idx on public.sauvegardes (auteur);
create index sauvegardes_maj_idx on public.sauvegardes (maj_le);
alter table public.sauvegardes enable row level security;

create or replace function public.envoyer_sauvegarde(p_code text, p_donnees text, p_libelle text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if v_uid is null then raise exception 'connexion requise'; end if;
  if p_donnees is null or length(p_donnees) > 3000000 then raise exception 'sauvegarde trop volumineuse'; end if;
  delete from public.sauvegardes where maj_le < now() - interval '60 days';
  if v_code ~ '^[A-Z2-9]{6}$' then
    update public.sauvegardes set donnees = p_donnees, libelle = left(p_libelle, 120), auteur = v_uid, maj_le = now()
      where code = v_code;
    if found then return v_code; end if;
  end if;
  delete from public.sauvegardes where code in (
    select code from public.sauvegardes where auteur = v_uid order by maj_le desc offset 4
  );
  for attempt in 1..20 loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    end loop;
    begin
      insert into public.sauvegardes (code, auteur, donnees, libelle) values (v_code, v_uid, p_donnees, left(p_libelle, 120));
      return v_code;
    exception when unique_violation then
    end;
  end loop;
  raise exception 'impossible de créer le code, réessayez';
end;
$$;

create or replace function public.recuperer_sauvegarde(p_code text)
returns json language plpgsql stable security definer set search_path = ''
as $$
declare v_s public.sauvegardes;
begin
  if auth.uid() is null then raise exception 'connexion requise'; end if;
  select * into v_s from public.sauvegardes where code = upper(trim(p_code));
  if not found then raise exception 'sauvegarde introuvable'; end if;
  return json_build_object('code', v_s.code, 'donnees', v_s.donnees, 'libelle', v_s.libelle, 'maj_le', v_s.maj_le);
end;
$$;

revoke all on function public.envoyer_sauvegarde(text, text, text) from public, anon;
revoke all on function public.recuperer_sauvegarde(text) from public, anon;
grant execute on function public.envoyer_sauvegarde(text, text, text) to authenticated;
grant execute on function public.recuperer_sauvegarde(text) to authenticated;
