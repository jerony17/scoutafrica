-- TEST project gdoadajmggmawiiyoaus ONLY. Regression test for the NULL-safe participant
-- guard in supabase/migrations/053_messaging_participant_checks.sql (bad_pair query).
-- OLD = the guard before the fix. NEW = the guard after the fix (same logic, one line).
-- Each case inserts temporary rows as the SQL owner (the guard runs as the owner
-- on Production too), counts OLD and NEW, then is undone by its own savepoint.
-- Nothing persists: the whole DO block always ends with RAISE EXCEPTION.
--   scout S = 943db811-997d-4af4-b0d1-eca584b6e04d, player account B = 69859922-6ad1-41df-af36-8a46e11debf8,
--   third party A = e5deb56b-d5bc-4d2e-bc72-45a9680eb508 (test accounts only)
DO $t$
DECLARE
  s uuid := '943db811-997d-4af4-b0d1-eca584b6e04d';
  b uuid := '69859922-6ad1-41df-af36-8a46e11debf8';
  a uuid := 'e5deb56b-d5bc-4d2e-bc72-45a9680eb508';
  old_q text := 'SELECT ' || '(SELECT count(*) FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id LEFT JOIN public.player p ON p.id = c.player_id WHERE NOT ((m.sender_id = c.scout_id AND m.receiver_id = p.user_id) OR (m.sender_id = p.user_id AND m.receiver_id = c.scout_id)))';
  new_q text := 'SELECT ' || '(SELECT count(*) FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id LEFT JOIN public.player p ON p.id = c.player_id WHERE p.user_id IS NULL OR c.scout_id IS NULL OR m.sender_id IS NULL OR m.receiver_id IS NULL OR NOT ((m.sender_id = c.scout_id AND m.receiver_id = p.user_id) OR (m.sender_id = p.user_id AND m.receiver_id = c.scout_id)))';
  r text[] := '{}';
  pid bigint; cid bigint; o bigint; n bigint; g text;
  cname text; exp_old bigint; exp_new bigint;
BEGIN
  -- TEST identity (same fingerprints as the earlier TEST scripts)
  IF to_regclass('public.founder_profile') IS NOT NULL OR to_regclass('public.club_profiles') IS NOT NULL
     OR to_regclass('public.academy_profiles') IS NOT NULL OR to_regclass('public.agent_profiles') IS NOT NULL THEN
    RAISE EXCEPTION 'I1 refused: Production-only tables found';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '001_enable_rls_videos') THEN
    RAISE EXCEPTION 'I2 refused: Production migration history found';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE name LIKE 'test_env_%') <> 3 THEN
    RAISE EXCEPTION 'I2 refused: test-only migrations not all recorded';
  END IF;
  IF (SELECT string_agg(id, ',' ORDER BY id) FROM storage.buckets) IS DISTINCT FROM 'cover-photos,highlight-videos,player-photos,profile-photos' THEN
    RAISE EXCEPTION 'I3 refused: storage buckets are not the test set';
  END IF;
  IF (SELECT count(*) FROM auth.users WHERE id IN (s, b, a)) <> 3 THEN
    RAISE EXCEPTION 'I5 refused: test accounts not all present';
  END IF;
  IF (SELECT count(*) FROM public.conversations) <> 0 OR (SELECT count(*) FROM public.messages) <> 0 THEN
    RAISE EXCEPTION 'TEST project has conversations or messages - aborting so counts stay exact';
  END IF;
  EXECUTE old_q INTO o; EXECUTE new_q INTO n;
  r := array_append(r, CASE WHEN o = 0 AND n = 0 THEN 'PASS T0 baseline old=0 new=0' ELSE 'FAIL T0 baseline old=' || o || ' new=' || n END);

  FOR i IN 1..10 LOOP
    BEGIN
      INSERT INTO public.player (user_id) VALUES (b) RETURNING id INTO pid;
      CASE i
      WHEN 1 THEN cname := 'V1 valid: scout -> player, existing player'; exp_old := 0; exp_new := 0;
        INSERT INTO public.conversations (player_id, scout_id) VALUES (pid, s) RETURNING id INTO cid;
        INSERT INTO public.messages (conversation_id, sender_id, receiver_id, message) VALUES (cid, s, b, 't');
      WHEN 2 THEN cname := 'V2 valid: both directions, existing player'; exp_old := 0; exp_new := 0;
        INSERT INTO public.conversations (player_id, scout_id) VALUES (pid, s) RETURNING id INTO cid;
        INSERT INTO public.messages (conversation_id, sender_id, receiver_id, message) VALUES (cid, s, b, 't'), (cid, b, s, 't');
      WHEN 3 THEN cname := 'M1 conversation player deleted (player_id points to no row)'; exp_old := 0; exp_new := 1;
        INSERT INTO public.conversations (player_id, scout_id) VALUES (pid + 1000000, s) RETURNING id INTO cid;
        INSERT INTO public.messages (conversation_id, sender_id, receiver_id, message) VALUES (cid, s, b, 't');
      WHEN 4 THEN cname := 'M2 conversation player_id NULL'; exp_old := 0; exp_new := 1;
        INSERT INTO public.conversations (player_id, scout_id) VALUES (NULL, s) RETURNING id INTO cid;
        INSERT INTO public.messages (conversation_id, sender_id, receiver_id, message) VALUES (cid, s, b, 't');
      WHEN 5 THEN cname := 'M3 player row exists but has no account (user_id NULL)'; exp_old := 0; exp_new := 1;
        UPDATE public.player SET user_id = NULL WHERE id = pid;
        INSERT INTO public.conversations (player_id, scout_id) VALUES (pid, s) RETURNING id INTO cid;
        INSERT INTO public.messages (conversation_id, sender_id, receiver_id, message) VALUES (cid, s, b, 't');
      WHEN 6 THEN cname := 'M4 conversation scout_id NULL'; exp_old := 0; exp_new := 1;
        INSERT INTO public.conversations (player_id, scout_id) VALUES (pid, NULL) RETURNING id INTO cid;
        INSERT INTO public.messages (conversation_id, sender_id, receiver_id, message) VALUES (cid, b, s, 't');
      WHEN 7 THEN cname := 'M5 message sender NULL'; exp_old := 0; exp_new := 1;
        INSERT INTO public.conversations (player_id, scout_id) VALUES (pid, s) RETURNING id INTO cid;
        INSERT INTO public.messages (conversation_id, sender_id, receiver_id, message) VALUES (cid, NULL, b, 't');
      WHEN 8 THEN cname := 'X1 existing participants, third party sends to player'; exp_old := 1; exp_new := 1;
        INSERT INTO public.conversations (player_id, scout_id) VALUES (pid, s) RETURNING id INTO cid;
        INSERT INTO public.messages (conversation_id, sender_id, receiver_id, message) VALUES (cid, a, b, 't');
      WHEN 9 THEN cname := 'X2 existing participants, scout sends to self'; exp_old := 1; exp_new := 1;
        INSERT INTO public.conversations (player_id, scout_id) VALUES (pid, s) RETURNING id INTO cid;
        INSERT INTO public.messages (conversation_id, sender_id, receiver_id, message) VALUES (cid, s, s, 't');
      WHEN 10 THEN cname := 'MIX one valid + one deleted-player message'; exp_old := 0; exp_new := 1;
        INSERT INTO public.conversations (player_id, scout_id) VALUES (pid, s) RETURNING id INTO cid;
        INSERT INTO public.messages (conversation_id, sender_id, receiver_id, message) VALUES (cid, s, b, 't');
        INSERT INTO public.conversations (player_id, scout_id) VALUES (pid + 1000000, s) RETURNING id INTO cid;
        INSERT INTO public.messages (conversation_id, sender_id, receiver_id, message) VALUES (cid, b, s, 't');
      END CASE;
      EXECUTE old_q INTO o; EXECUTE new_q INTO n;
      -- the corrected guard decision, as in the execution file
      BEGIN
        IF n > 0 THEN
          RAISE EXCEPTION 'G9 refused: % existing message(s) are not between the two conversation participants', n;
        END IF;
        g := 'guard passes';
      EXCEPTION WHEN raise_exception THEN g := 'guard refuses';
      END;
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'undo-case';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'undo-case' THEN r := array_append(r, 'FAIL ' || i || ' unexpected ' || SQLERRM); CONTINUE; END IF;
      r := array_append(r, CASE WHEN o = exp_old AND n = exp_new THEN 'PASS ' ELSE 'FAIL ' END || cname
        || ' (old=' || o || ' new=' || n || ', ' || g || ')');
    WHEN OTHERS THEN
      r := array_append(r, 'FAIL case ' || i || ' setup error ' || SQLSTATE || ' ' || SQLERRM);
    END;
  END LOOP;

  IF (SELECT count(*) FROM public.conversations) <> 0 OR (SELECT count(*) FROM public.messages) <> 0 THEN
    r := array_append(r, 'FAIL cleanup: rows left behind');
  ELSE
    r := array_append(r, 'PASS cleanup: every case undone');
  END IF;
  RAISE EXCEPTION 'TEST 053 G9 NULL-SAFE RESULTS (rolled back): %', array_to_string(r, ' | ');
END
$t$;
