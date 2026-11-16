-- Glance redesign, step 1: the theme's colours now live in one place.
--
-- Until now every household had its own copy of the "bright" theme's
-- colours in the themes table, and those copies were written over the
-- built-in ones in src/theme/tokens.ts. That meant a new look in the code
-- would not show for any household until its copy was changed too.
--
-- From now on the built-in "bright" theme (src/theme/tokens.ts) is the
-- only source of the colours. A household's row only holds its own
-- changes on top, which is nothing for the built-in theme: {}.
-- (There's no screen for editing theme colours, so no household has
-- changes of its own to keep.)

create or replace function public.bright_theme_tokens()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{}'::jsonb;
$$;

revoke execute on function public.bright_theme_tokens() from public, anon, authenticated;

update public.themes
set tokens = '{}'::jsonb, name = 'Glance'
where slug = 'bright';
