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
            'description', c.description
          )
          order by c.id desc
        )
        from public.categories c
      ),
      '[]'::jsonb
    )
  );
$$;

grant execute on function public.get_categories_page_data() to anon, authenticated;
