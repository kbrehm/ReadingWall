# Reading Wall

Reading Wall is a lightweight summer book club site for elementary school kids in grades K-5. Kids enter with a fake username, pick a grade room, type a shared access code, and then post books and public comments. There is no email/password auth and no real-name field anywhere.

## Stack

- Next.js App Router
- TypeScript
- Supabase Postgres for `book_posts` and `book_comments`
- Supabase Storage bucket `book-covers`
- Vercel for deployment

## Environment variables

Create a local `.env.local` file from `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SITE_ACCESS_CODE=your-shared-room-code
```

What each variable does:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL used by the browser client
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key used for reading/writing posts, comments, and cover uploads
- `SITE_ACCESS_CODE`: shared room code checked by `app/api/entry/route.ts`

## Local development

1. Install dependencies:

```powershell
npm.cmd install --no-audit --no-fund
```

2. Add `.env.local` with the three environment variables above.

3. Start the dev server:

```powershell
npm.cmd run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Supabase setup

### 1. Create the project

Create a new Supabase project and copy:

- Project URL
- anon public key

### 2. Run the schema

Open the Supabase SQL Editor and run [supabase/schema.sql](/C:/Users/Kevin%20Brehm/Desktop/ReadingWall/supabase/schema.sql).

That script creates:

- `book_posts`
- `book_comments`
- row-level security policies that allow anonymous `select` and `insert`
- a few sample posts/comments

### 3. Create the storage bucket

In Supabase Storage, create a bucket named `book-covers`.

Recommended settings:

- Public bucket: `true`
- File size limit: optional
- Allowed MIME types: optional, but images only is a good fit

### 4. Add storage policies

If your bucket is public, add policies so anonymous users can upload and read files. In SQL Editor, run:

```sql
create policy "anon can view book covers"
on storage.objects
for select
to anon
using (bucket_id = 'book-covers');

create policy "anon can upload book covers"
on storage.objects
for insert
to anon
with check (bucket_id = 'book-covers');
```

If you need stricter moderation later, this is the first place to tighten.

## Vercel deployment

### 1. Push this project to GitHub

Vercel deploys most smoothly from a Git repository.

### 2. Import into Vercel

In Vercel:

1. Click `Add New...`
2. Choose `Project`
3. Import the repository

Vercel should detect Next.js automatically.

### 3. Add environment variables in Vercel

In the Vercel project settings, add:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SITE_ACCESS_CODE`

Use the same values you used locally.

### 4. Deploy

Trigger the first deployment. Vercel will run the standard Next.js build.

### 5. Test the deployed site

Verify:

- entry screen accepts the correct shared code
- fake username is saved locally in the browser
- books load from Supabase
- adding a book writes to `book_posts`
- adding a comment writes to `book_comments`
- cover uploads land in the `book-covers` bucket

## Data model

### `book_posts`

- `id`
- `grade`
- `title`
- `author`
- `cover_image_url`
- `posted_by_username`
- `rating`
- `recommendation_status`
- `review_text`
- `created_at`

### `book_comments`

- `id`
- `book_post_id`
- `username`
- `message`
- `created_at`

## Important behavior

- Fake username only
- No email/password auth
- Shared access code is checked server-side
- Fake username and selected grade are stored in browser storage
- Comments are public and attached to a single book card
- There is no private messaging, profile page, or real-name field

## Files to know

- [app/page.tsx](/C:/Users/Kevin%20Brehm/Desktop/ReadingWall/app/page.tsx)
- [components/reading-wall-app.tsx](/C:/Users/Kevin%20Brehm/Desktop/ReadingWall/components/reading-wall-app.tsx)
- [app/api/entry/route.ts](/C:/Users/Kevin%20Brehm/Desktop/ReadingWall/app/api/entry/route.ts)
- [lib/supabase.ts](/C:/Users/Kevin%20Brehm/Desktop/ReadingWall/lib/supabase.ts)
- [supabase/schema.sql](/C:/Users/Kevin%20Brehm/Desktop/ReadingWall/supabase/schema.sql)
