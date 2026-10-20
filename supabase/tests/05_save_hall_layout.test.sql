-- Этап 2.2: save_hall_layout. Данные из seed.sql.
--
-- Демо Бильярд: owner 1111…, admin 2222…, зал aaaaaaaa-2222…, столы aaaaaaaa-3333…01–08
-- Демо PS-клуб: owner2 3333…, зал bbbbbbbb-2222…
begin;
select * from no_plan();

create function pg_temp.login(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
end;
$$;

-- Текущая карта зала в формате параметров функции.
create function pg_temp.layout(p_hall_id uuid, out res jsonb, out obj jsonb)
language sql as $$
  select
    (select coalesce(jsonb_agg(to_jsonb(r) - 'venue_id' - 'hall_id' - 'created_at'), '[]')
     from public.resources r where r.hall_id = p_hall_id),
    (select coalesce(jsonb_agg(to_jsonb(o) - 'hall_id' - 'created_at'), '[]')
     from public.hall_objects o where o.hall_id = p_hall_id);
$$;

grant execute on function pg_temp.layout(uuid) to authenticated;

-- Администратор --------------------------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$select public.save_hall_layout('aaaaaaaa-2222-0000-0000-000000000001', '[]', '[]')$$,
  '42501', null,
  'администратор не сохраняет карту'
);
reset role;

-- Чужой владелец -------------------------------------------------------------

select pg_temp.login('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$select public.save_hall_layout('aaaaaaaa-2222-0000-0000-000000000001', '[]', '[]')$$,
  '42501', null,
  'чужой владелец не сохраняет карту'
);
reset role;

-- Владелец -------------------------------------------------------------------

select pg_temp.login('11111111-1111-1111-1111-111111111111');

-- Двигаем стол 1, удаляем стол 2, добавляем новый стол и подпись, убираем бар.
select lives_ok(
  $$select public.save_hall_layout(
    'aaaaaaaa-2222-0000-0000-000000000001',
    (select jsonb_agg(
       case when r ->> 'id' = 'aaaaaaaa-3333-0000-0000-000000000001'
            then r || '{"x": 500, "y": 600, "rotation": 90}'
            else r end)
     from jsonb_array_elements((pg_temp.layout('aaaaaaaa-2222-0000-0000-000000000001')).res) r
     where r ->> 'id' <> 'aaaaaaaa-3333-0000-0000-000000000002')
    || '[{"kind": "pool_table", "name": "Стол 9", "capacity": null, "x": 0, "y": 0,
          "w": 180, "h": 100, "rotation": 0, "shape": "rect",
          "bookable_online": true, "is_active": true}]',
    (select jsonb_agg(o) from jsonb_array_elements((pg_temp.layout('aaaaaaaa-2222-0000-0000-000000000001')).obj) o
     where o ->> 'kind' <> 'bar')
    || '[{"kind": "label", "label": "VIP", "x": 10, "y": 10, "w": 100, "h": 40, "rotation": 0}]'
  )$$,
  'владелец сохраняет карту'
);

select results_eq(
  $$select x, y, rotation from public.resources where id = 'aaaaaaaa-3333-0000-0000-000000000001'$$,
  $$values (500, 600, 90)$$,
  'стол 1 передвинут и повёрнут'
);
select is_empty(
  $$select 1 from public.resources where id = 'aaaaaaaa-3333-0000-0000-000000000002'$$,
  'стол 2 без истории удалён'
);
select isnt_empty(
  $$select 1 from public.resources where name = 'Стол 9'
      and venue_id = 'aaaaaaaa-1111-0000-0000-000000000001'$$,
  'новый стол создан в заведении зала'
);
select results_eq(
  $$select kind::text from public.hall_objects
    where hall_id = 'aaaaaaaa-2222-0000-0000-000000000001' order by kind$$,
  array['entrance', 'label'],
  'бар удалён, подпись добавлена, вход на месте'
);

select throws_ok(
  $$select public.save_hall_layout(
    'aaaaaaaa-2222-0000-0000-000000000001',
    '[{"kind": "pool_table", "name": "Плохой", "x": 0, "y": 0, "w": 180, "h": 100,
       "rotation": 400, "shape": "rect", "bookable_online": true, "is_active": true}]',
    '[]')$$,
  '23514', null,
  'неверный поворот откатывает всё сохранение'
);
select is(
  (select count(*)::int from public.resources where hall_id = 'aaaaaaaa-2222-0000-0000-000000000001'),
  8,
  'после ошибки карта не изменилась'
);
select lives_ok(
  $$select public.save_hall_layout(
    'aaaaaaaa-2222-0000-0000-000000000001',
    '[{"id": "bbbbbbbb-3333-0000-0000-000000000001", "kind": "ps_zone", "name": "Взлом",
       "x": 0, "y": 0, "w": 10, "h": 10, "rotation": 0, "shape": "rect",
       "bookable_online": true, "is_active": true}]',
    '[]')$$,
  'чужой id в списке не вызывает ошибку'
);
reset role;

select is(
  (select name from public.resources where id = 'bbbbbbbb-3333-0000-0000-000000000001'),
  'PS-1',
  'ресурс чужого заведения не изменился'
);

select * from finish();
rollback;
