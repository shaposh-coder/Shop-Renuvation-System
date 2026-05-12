-- Shop-wise expense totals for a selected category.

create or replace function public.get_category_expense_shop_details(p_category_id bigint)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'location_id', grouped.location_id,
        'shop_name', grouped.shop_name,
        'expense_value_total', grouped.expense_value_total,
        'expense_count', grouped.expense_count
      )
      order by grouped.expense_value_total desc, grouped.shop_name
    ),
    '[]'::jsonb
  )
  from (
    select
      e.location_id,
      coalesce(l.shop_name, 'Unknown shop') as shop_name,
      coalesce(sum(e.expense_value), 0) as expense_value_total,
      count(*)::integer as expense_count
    from public.expenses e
    left join public.locations l on l.id = e.location_id
    where e.category_id = p_category_id
    group by e.location_id, l.shop_name
  ) grouped;
$$;

grant execute on function public.get_category_expense_shop_details(bigint) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
