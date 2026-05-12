-- Add category-wise expense totals to the Categories page RPC.
-- Value is the sum of expense_value for all expense records linked to each category.

create or replace function public.get_categories_page_data()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'categories',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'description', c.description,
            'expense_value_total', coalesce(category_totals.total_value, 0)
          )
          order by c.id desc
        )
        from public.categories c
        left join (
          select e.category_id, coalesce(sum(e.expense_value), 0) as total_value
          from public.expenses e
          group by e.category_id
        ) category_totals on category_totals.category_id = c.id
      ),
      '[]'::jsonb
    )
  );
$$;

grant execute on function public.get_categories_page_data() to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
