create extension if not exists pgcrypto;

create table if not exists public.book_posts (
  id uuid primary key default gen_random_uuid(),
  grade text not null check (grade in ('k', '1', '2', '3', '4', '5')),
  title text not null,
  author text,
  cover_image_url text,
  posted_by_username text not null,
  reader_badge text,
  rating integer not null check (rating between 1 and 5),
  recommendation_status text not null check (
    recommendation_status in ('Recommended', 'Still Reading', 'Not Recommended')
  ),
  review_text text not null,
  loved_it_count integer not null default 0,
  want_to_read_count integer not null default 0,
  popular_count integer not null default 0,
  funny_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.book_comments (
  id uuid primary key default gen_random_uuid(),
  book_post_id uuid not null references public.book_posts(id) on delete cascade,
  username text not null,
  message text not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.book_posts enable row level security;
alter table public.book_comments enable row level security;

alter table public.book_posts
  add column if not exists reader_badge text,
  add column if not exists loved_it_count integer not null default 0,
  add column if not exists want_to_read_count integer not null default 0,
  add column if not exists popular_count integer not null default 0,
  add column if not exists funny_count integer not null default 0;

drop policy if exists "anon can read book posts" on public.book_posts;
create policy "anon can read book posts"
on public.book_posts
for select
to anon
using (true);

drop policy if exists "anon can insert book posts" on public.book_posts;
create policy "anon can insert book posts"
on public.book_posts
for insert
to anon
with check (true);

drop policy if exists "anon can update book posts" on public.book_posts;
create policy "anon can update book posts"
on public.book_posts
for update
to anon
using (true)
with check (true);

drop policy if exists "anon can read book comments" on public.book_comments;
create policy "anon can read book comments"
on public.book_comments
for select
to anon
using (true);

drop policy if exists "anon can insert book comments" on public.book_comments;
create policy "anon can insert book comments"
on public.book_comments
for insert
to anon
with check (true);

insert into public.book_posts (
  grade,
  title,
  author,
  cover_image_url,
  posted_by_username,
  rating,
  recommendation_status,
  review_text
)
select *
from (
  values
    ('k', 'The Pigeon HAS to Go to School!', 'Mo Willems', null, 'SunshinePages', 5, 'Recommended', 'The pigeon is silly and made me laugh the whole time.'),
    ('3', 'Dragon Masters: Rise of the Earth Dragon', 'Tracey West', null, 'StarReader22', 5, 'Recommended', 'I liked the dragon training part and the ending made me want the next book.'),
    ('5', 'Wonder', 'R. J. Palacio', null, 'NovaNotebook', 5, 'Recommended', 'It is thoughtful and made me care about a lot of characters.')
) as seed_data (
  grade,
  title,
  author,
  cover_image_url,
  posted_by_username,
  rating,
  recommendation_status,
  review_text
)
where not exists (
  select 1 from public.book_posts existing where existing.title = seed_data.title
);

insert into public.book_comments (book_post_id, username, message)
select dragon.id, 'MoonPage3', 'I am reading this too. The dragon cave was my favorite.'
from public.book_posts dragon
where dragon.title = 'Dragon Masters: Rise of the Earth Dragon'
  and not exists (
    select 1
    from public.book_comments existing
    where existing.book_post_id = dragon.id
      and existing.username = 'MoonPage3'
      and existing.message = 'I am reading this too. The dragon cave was my favorite.'
  );
