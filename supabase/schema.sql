-- 온라인 시험 플랫폼 «휴온스 퀴즈 챌린지» DB 스키마 (Supabase SQL Editor 에 통째로 붙여넣고 Run)
-- 테이블은 전부 잠그고 SECURITY DEFINER 함수로만 접근한다.
create extension if not exists pgcrypto with schema extensions;
-- 정답·해설은 시험이 끝나기(ended) 전에는 어떤 공개 함수도 돌려주지 않는다.

create table if not exists hx_admin (id int primary key, pass_hash text not null);

create table if not exists hx_exams (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null default '',
  course text not null default '',
  duration_min int not null default 20 check (duration_min between 1 and 300),
  warn_sec int not null default 60 check (warn_sec between 0 and 3600),
  pass_score numeric not null default 60,
  status text not null default 'draft' check (status in ('draft','live','ended')),
  started_at timestamptz, ends_at timestamptz, ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists hx_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references hx_exams(id) on delete cascade,
  no int not null,
  type text not null check (type in ('single','multi','short','essay')),
  stem text not null,
  choices jsonb not null default '[]',   -- 객관식 보기 4개
  answer jsonb not null default '[]',    -- single/multi: [보기index..], short: [허용정답..], essay: [모범답안]
  explanation text not null default '',
  points numeric not null default 1
);
create index if not exists hx_questions_exam on hx_questions(exam_id, no);

create table if not exists hx_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references hx_exams(id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  name text not null, email text not null default '', dept text not null default '',
  joined_at timestamptz not null default now(),
  submitted_at timestamptz,
  answers jsonb not null default '{}',     -- {question_id: [idx..] | "text"}
  overrides jsonb not null default '{}',   -- {question_id: 점수} 관리자 수동 채점
  graded jsonb not null default '{}',      -- {question_id: {earned, correct, pending}}
  score numeric, max_score numeric,
  emailed_at timestamptz,
  save_seq bigint not null default 0      -- 저장 순서(늦게 도착한 옛 저장 무시)
);
create index if not exists hx_attempts_exam on hx_attempts(exam_id);

alter table hx_admin enable row level security;
alter table hx_exams enable row level security;
alter table hx_questions enable row level security;
alter table hx_attempts enable row level security;
revoke all on hx_admin, hx_exams, hx_questions, hx_attempts from anon, authenticated;

-- 관리자 비밀번호 초기값 123456 (설치 후 README 의 방법으로 꼭 바꾸세요)
insert into hx_admin(id, pass_hash) values (1, extensions.crypt('123456', extensions.gen_salt('bf')))
on conflict (id) do nothing;

-- ───────── 내부 도우미 ─────────
create or replace function hx_is_admin(p text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists(select 1 from hx_admin where pass_hash = crypt(coalesce(p,''), pass_hash));
$$;

create or replace function hx_assert_admin(p text) returns void
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not hx_is_admin(p) then raise exception 'unauthorized' using errcode = '42501'; end if;
end $$;

create or replace function hx_norm(t text) returns text language sql immutable as $$
  select lower(regexp_replace(coalesce(t,''), '[\s\.,·\-_()\[\]"''`~!?/]', '', 'g'));
$$;

create or replace function hx_int_set(j jsonb) returns int[] language sql immutable as $$
  select coalesce(array(select distinct (x)::int from jsonb_array_elements_text(
    case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) x order by 1), '{}');
$$;

-- 한 문항 자동 채점: earned(null=서술형 채점대기)
create or replace function hx_auto_grade(q hx_questions, resp jsonb) returns numeric
language plpgsql immutable as $$
begin
  if resp is null or resp = 'null'::jsonb or (jsonb_typeof(resp) = 'string' and btrim(resp #>> '{}') = '') then
    return 0;   -- 무응답은 0점(빈 서술형도 채점 대기 아님)
  end if;
  if q.type in ('single','multi') then
    return case when cardinality(hx_int_set(resp)) > 0 and hx_int_set(resp) = hx_int_set(q.answer) then q.points else 0 end;
  elsif q.type = 'short' then
    return case when exists(select 1 from jsonb_array_elements_text(q.answer) a
                            where hx_norm(a) <> '' and hx_norm(a) = hx_norm(resp #>> '{}')) then q.points else 0 end;
  else
    return null;
  end if;
end $$;

create or replace function hx_grade_attempt(a_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare a hx_attempts; q hx_questions; g jsonb := '{}'; e numeric; tot numeric := 0; mx numeric := 0; pend boolean;
begin
  select * into a from hx_attempts where id = a_id;
  for q in select * from hx_questions where exam_id = a.exam_id order by no loop
    if a.overrides ? q.id::text then
      e := (a.overrides ->> q.id::text)::numeric; pend := false;
    else
      e := hx_auto_grade(q, a.answers -> q.id::text); pend := e is null;
    end if;
    g := g || jsonb_build_object(q.id::text, jsonb_build_object(
      'earned', coalesce(e,0), 'correct', coalesce(e,0) >= q.points, 'pending', pend));
    tot := tot + coalesce(e,0); mx := mx + q.points;
  end loop;
  update hx_attempts set graded = g, score = tot, max_score = mx,
    submitted_at = coalesce(submitted_at, (select coalesce(ended_at, now()) from hx_exams where id = a.exam_id))
  where id = a_id;
end $$;

create or replace function hx_regrade_exam(e_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  for r in select id from hx_attempts where exam_id = e_id loop perform hx_grade_attempt(r.id); end loop;
end $$;

-- 시간이 지난 live 시험은 자동 종료 + 채점
create or replace function hx_touch(e_id uuid) returns hx_exams
language plpgsql security definer set search_path = public, extensions as $$
declare e hx_exams;
begin
  select * into e from hx_exams where id = e_id;
  if e.status = 'live' and now() >= e.ends_at then
    update hx_exams set status = 'ended', ended_at = e.ends_at where id = e_id returning * into e;
    perform hx_regrade_exam(e_id);
  end if;
  return e;
end $$;

create or replace function hx_public_questions(e_id uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'no', no, 'type', type, 'stem', stem,
    'choices', choices, 'points', points) order by no), '[]') from hx_questions where exam_id = e_id;
$$;

-- ───────── 학습자(공개) 함수 ─────────
create or replace function hx_exam_public(p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare e hx_exams; eid uuid;
begin
  select id into eid from hx_exams where code = upper(p_code);
  if eid is null then return null; end if;
  e := hx_touch(eid);
  return jsonb_build_object('id', e.id, 'code', e.code, 'title', e.title, 'course', e.course,
    'status', e.status, 'duration_min', e.duration_min, 'warn_sec', e.warn_sec,
    'started_at', e.started_at, 'ends_at', e.ends_at, 'server_now', now(),
    'n_questions', (select count(*) from hx_questions where exam_id = e.id),
    'questions', case when e.status in ('live','ended') then hx_public_questions(e.id) else '[]'::jsonb end);
end $$;

create or replace function hx_join(p_code text, p_name text, p_email text, p_dept text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare e hx_exams; a hx_attempts; eid uuid;
begin
  if length(trim(coalesce(p_name,''))) = 0 or length(p_name) > 40 then raise exception '이름을 확인해 주세요'; end if;
  if coalesce(p_email,'') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 120 then raise exception '이메일 형식을 확인해 주세요'; end if;
  select id into eid from hx_exams where code = upper(p_code);
  if eid is null then raise exception '시험을 찾을 수 없습니다'; end if;
  e := hx_touch(eid);
  -- 같은 이름+이메일로 다시 들어오면 기존 응시를 이어간다(폰 새로고침·재접속)
  select * into a from hx_attempts where exam_id = e.id and lower(email) = lower(trim(p_email)) and name = trim(p_name);
  if a.id is null then
    if e.status = 'ended' then raise exception '이미 종료된 시험입니다'; end if;
    insert into hx_attempts(exam_id, name, email, dept)
      values (e.id, trim(p_name), lower(trim(p_email)), left(trim(coalesce(p_dept,'')), 60)) returning * into a;
  end if;
  return jsonb_build_object('attempt_id', a.id, 'token', a.token);
end $$;

create or replace function hx_attempt_state(p_attempt uuid, p_token uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object('name', name, 'dept', dept, 'answers', answers, 'submitted_at', submitted_at)
  from hx_attempts where id = p_attempt and token = p_token;
$$;

create or replace function hx_save(p_attempt uuid, p_token uuid, p_answers jsonb, p_submit boolean, p_seq bigint default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare a hx_attempts; e hx_exams;
begin
  select * into a from hx_attempts where id = p_attempt and token = p_token for update;
  if a.id is null then raise exception '응시 정보가 없습니다'; end if;
  e := hx_touch(a.exam_id);
  if a.submitted_at is not null then return jsonb_build_object('ok', false, 'reason', 'submitted'); end if;
  if e.status <> 'live' then return jsonb_build_object('ok', false, 'reason', e.status); end if;
  if jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 200000 then raise exception '잘못된 답안'; end if;
  if p_seq is not null and p_seq <= a.save_seq and not p_submit then
    return jsonb_build_object('ok', true, 'stale', true);
  end if;
  update hx_attempts set answers = p_answers, save_seq = greatest(save_seq, coalesce(p_seq, save_seq)),
    submitted_at = case when p_submit then now() else null end where id = a.id;
  if p_submit then perform hx_grade_attempt(a.id); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function hx_my_result(p_attempt uuid, p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare a hx_attempts; e hx_exams; n int; better int; avg_s numeric;
begin
  select * into a from hx_attempts where id = p_attempt and token = p_token;
  if a.id is null then raise exception '응시 정보가 없습니다'; end if;
  e := hx_touch(a.exam_id);
  if e.status <> 'ended' then return jsonb_build_object('status', e.status); end if;
  select * into a from hx_attempts where id = p_attempt;
  select count(*), count(*) filter (where score > a.score), avg(score)
    into n, better, avg_s from hx_attempts where exam_id = e.id;
  return jsonb_build_object('status', 'ended', 'title', e.title, 'course', e.course, 'pass_score', e.pass_score,
    'name', a.name, 'dept', a.dept, 'score', a.score, 'max_score', a.max_score,
    'rank', better + 1, 'n', n, 'avg', round(avg_s, 1),
    'items', (select jsonb_agg(jsonb_build_object('no', q.no, 'type', q.type, 'stem', q.stem, 'choices', q.choices,
        'answer', q.answer, 'explanation', q.explanation, 'points', q.points,
        'my', a.answers -> q.id::text, 'earned', a.graded #> array[q.id::text, 'earned'],
        'correct', a.graded #> array[q.id::text, 'correct'], 'pending', a.graded #> array[q.id::text, 'pending'])
        order by q.no) from hx_questions q where q.exam_id = e.id));
end $$;

-- ───────── 관리자 함수 ─────────
create or replace function hx_admin_login(p text) returns boolean
language sql stable security definer set search_path = public, extensions as $$ select hx_is_admin(p); $$;

create or replace function hx_admin_list(p text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  perform hx_assert_admin(p);
  for r in select id from hx_exams where status = 'live' loop perform hx_touch(r.id); end loop;
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'code', e.code, 'title', e.title, 'course', e.course,
    'status', e.status, 'duration_min', e.duration_min, 'created_at', e.created_at, 'started_at', e.started_at,
    'n_questions', (select count(*) from hx_questions where exam_id = e.id),
    'n_attempts', (select count(*) from hx_attempts where exam_id = e.id)) order by e.created_at desc)
    from hx_exams e), '[]');
end $$;

create or replace function hx_admin_get(p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare e hx_exams;
begin
  perform hx_assert_admin(p);
  e := hx_touch(p_id);
  return jsonb_build_object('exam', to_jsonb(e), 'server_now', now(),
    'questions', coalesce((select jsonb_agg(to_jsonb(q) order by q.no) from hx_questions q where q.exam_id = p_id), '[]'));
end $$;

create or replace function hx_admin_save(p text, p_exam jsonb, p_questions jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare eid uuid := nullif(p_exam->>'id','')::uuid; st text; q jsonb; i int := 0;
begin
  perform hx_assert_admin(p);
  if eid is null then
    insert into hx_exams(code, title) values (upper(substr(md5(random()::text), 1, 6)), '') returning id into eid;
  end if;
  select status into st from hx_exams where id = eid;
  if st = 'live' then raise exception '진행 중인 시험은 수정할 수 없습니다'; end if;
  update hx_exams set title = coalesce(p_exam->>'title', title), course = coalesce(p_exam->>'course', course),
    duration_min = coalesce((p_exam->>'duration_min')::int, duration_min),
    warn_sec = coalesce((p_exam->>'warn_sec')::int, warn_sec),
    pass_score = coalesce((p_exam->>'pass_score')::numeric, pass_score) where id = eid;
  if p_questions is not null then
    delete from hx_questions where exam_id = eid and not (id::text in (
      select x->>'id' from jsonb_array_elements(p_questions) x where x->>'id' is not null));
    for q in select * from jsonb_array_elements(p_questions) loop
      i := i + 1;
      insert into hx_questions(id, exam_id, no, type, stem, choices, answer, explanation, points)
      values (coalesce(nullif(q->>'id','')::uuid, gen_random_uuid()), eid, i, q->>'type', q->>'stem',
              coalesce(q->'choices','[]'), coalesce(q->'answer','[]'), coalesce(q->>'explanation',''),
              coalesce((q->>'points')::numeric, 1))
      on conflict (id) do update set no = excluded.no, type = excluded.type, stem = excluded.stem,
        choices = excluded.choices, answer = excluded.answer, explanation = excluded.explanation, points = excluded.points;
    end loop;
  end if;
  if st = 'ended' then perform hx_regrade_exam(eid); end if;   -- 종료 후 정답 정정 → 재채점
  return eid;
end $$;

create or replace function hx_admin_action(p text, p_id uuid, p_action text, p_min int default 0) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare e hx_exams;
begin
  perform hx_assert_admin(p);
  e := hx_touch(p_id);
  if p_action = 'start' then
    if (select count(*) from hx_questions where exam_id = p_id) = 0 then raise exception '문항이 없습니다'; end if;
    update hx_exams set status = 'live', started_at = now(), ended_at = null,
      ends_at = now() + make_interval(mins => duration_min) where id = p_id;
  elsif p_action = 'end' and e.status = 'live' then
    update hx_exams set status = 'ended', ended_at = now(), ends_at = now() where id = p_id;
    perform hx_regrade_exam(p_id);
  elsif p_action = 'extend' and e.status = 'live' then
    update hx_exams set ends_at = ends_at + make_interval(mins => greatest(p_min, 1)) where id = p_id;
  elsif p_action = 'reset' then
    delete from hx_attempts where exam_id = p_id;
    update hx_exams set status = 'draft', started_at = null, ends_at = null, ended_at = null where id = p_id;
  elsif p_action = 'delete' then
    delete from hx_exams where id = p_id;
  elsif p_action = 'duplicate' then
    insert into hx_exams(code, title, course, duration_min, warn_sec, pass_score)
      select upper(substr(md5(random()::text), 1, 6)), title || ' (복사본)', course, duration_min, warn_sec, pass_score
      from hx_exams where id = p_id returning * into e;
    insert into hx_questions(exam_id, no, type, stem, choices, answer, explanation, points)
      select e.id, no, type, stem, choices, answer, explanation, points from hx_questions where exam_id = p_id;
    return jsonb_build_object('id', e.id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function hx_admin_live(p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare e hx_exams;
begin
  perform hx_assert_admin(p);
  e := hx_touch(p_id);
  return jsonb_build_object('status', e.status, 'ends_at', e.ends_at, 'server_now', now(),
    'people', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'dept', dept,
      'answered', (select count(*) from jsonb_object_keys(answers)), 'submitted', submitted_at is not null)
      order by joined_at) from hx_attempts where exam_id = p_id), '[]'));
end $$;

create or replace function hx_admin_results(p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare e hx_exams;
begin
  perform hx_assert_admin(p);
  e := hx_touch(p_id);
  return jsonb_build_object('exam', to_jsonb(e),
    'questions', coalesce((select jsonb_agg(to_jsonb(q) order by q.no) from hx_questions q where q.exam_id = p_id), '[]'),
    'attempts', coalesce((select jsonb_agg(to_jsonb(a) - 'token' order by a.score desc nulls last)
      from hx_attempts a where a.exam_id = p_id), '[]'));
end $$;

create or replace function hx_admin_override(p text, p_attempt uuid, p_qid uuid, p_score numeric) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform hx_assert_admin(p);
  update hx_attempts set overrides = case when p_score is null then overrides - p_qid::text
    else overrides || jsonb_build_object(p_qid::text, p_score) end where id = p_attempt;
  perform hx_grade_attempt(p_attempt);
end $$;

create or replace function hx_admin_mark_emailed(p text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform hx_assert_admin(p);
  update hx_attempts set emailed_at = now() where id = any(p_ids);
end $$;

-- 내부 함수는 외부 호출 차단, 공개/관리자 함수만 anon 에 연다
-- (공유 프로젝트라 hx_ 함수에만 적용한다)
do $$ declare f text; begin
  foreach f in array array['hx_is_admin(text)','hx_assert_admin(text)','hx_norm(text)','hx_int_set(jsonb)',
    'hx_auto_grade(hx_questions,jsonb)','hx_grade_attempt(uuid)','hx_regrade_exam(uuid)','hx_touch(uuid)','hx_public_questions(uuid)']
  loop execute format('revoke execute on function %s from public, anon, authenticated', f); end loop;
  foreach f in array array['hx_exam_public(text)','hx_join(text,text,text,text)','hx_attempt_state(uuid,uuid)',
    'hx_save(uuid,uuid,jsonb,boolean,bigint)','hx_my_result(uuid,uuid)','hx_admin_login(text)','hx_admin_list(text)',
    'hx_admin_get(text,uuid)','hx_admin_save(text,jsonb,jsonb)','hx_admin_action(text,uuid,text,int)',
    'hx_admin_live(text,uuid)','hx_admin_results(text,uuid)','hx_admin_override(text,uuid,uuid,numeric)',
    'hx_admin_mark_emailed(text,uuid[])']
  loop execute format('grant execute on function %s to anon, authenticated', f); end loop;
end $$;
