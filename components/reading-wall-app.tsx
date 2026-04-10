"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  fakeUsernameExamples,
  grades,
  reactionOptions,
  readingBadges,
  recommendationOptions,
  sessionStorageKeys
} from "@/lib/constants";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { BookPost, EntrySession, GradeId, RecommendationStatus } from "@/lib/types";

type SortMode = "newest" | "highest" | "discussed";

type EntryFormState = {
  username: string;
  grade: GradeId;
  accessCode: string;
};

type BookComposerState = {
  title: string;
  author: string;
  username: string;
  readerBadge: string;
  rating: number;
  recommendationStatus: RecommendationStatus;
  reviewText: string;
  coverUrl: string;
};

type ReactionKey =
  | "loved_it_count"
  | "want_to_read_count"
  | "popular_count"
  | "funny_count";

const emptyComposer = (username: string): BookComposerState => ({
  title: "",
  author: "",
  username,
  readerBadge: "Great for Summer",
  rating: 4,
  recommendationStatus: "Recommended",
  reviewText: "",
  coverUrl: ""
});

export function ReadingWallApp() {
  const [supabaseReady, setSupabaseReady] = useState(true);
  const [session, setSession] = useState<EntrySession | null>(null);
  const [entryForm, setEntryForm] = useState<EntryFormState>({
    username: "",
    grade: "3",
    accessCode: ""
  });
  const [entryError, setEntryError] = useState("");
  const [books, setBooks] = useState<BookPost[]>([]);
  const [booksError, setBooksError] = useState("");
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [onlyRecommended, setOnlyRecommended] = useState(false);
  const [composerOpen, setComposerOpen] = useState(true);
  const [composer, setComposer] = useState<BookComposerState>(emptyComposer(""));
  const [composerFeedback, setComposerFeedback] = useState("");
  const [postingBook, setPostingBook] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [postingCommentId, setPostingCommentId] = useState<string | null>(null);

  useEffect(() => {
    try {
      getSupabaseBrowserClient();
      setSupabaseReady(true);
    } catch (error) {
      console.error(error);
      setSupabaseReady(false);
    }
  }, []);

  useEffect(() => {
    const storedUsername = window.localStorage.getItem(sessionStorageKeys.username);
    const storedGrade = window.localStorage.getItem(sessionStorageKeys.grade) as GradeId | null;
    const storedAccess = window.localStorage.getItem(sessionStorageKeys.accessGranted);

    if (storedUsername) {
      setEntryForm((current) => ({ ...current, username: storedUsername }));
      setComposer((current) => ({ ...current, username: storedUsername }));
    }

    if (storedGrade && grades.some((grade) => grade.id === storedGrade)) {
      setEntryForm((current) => ({ ...current, grade: storedGrade }));
    }

    if (storedUsername && storedGrade && storedAccess === "true") {
      setSession({
        username: storedUsername,
        grade: storedGrade,
        accessGranted: true
      });
      setComposer(emptyComposer(storedUsername));
    }
  }, []);

  useEffect(() => {
    void loadBooks();
  }, []);

  const visibleBooks = useMemo(() => {
    if (!session) {
      return [];
    }

    const filtered = books.filter((book) => {
      const sameGrade = book.grade === session.grade;
      const matchesRecommendation = onlyRecommended
        ? book.recommendation_status === "Recommended"
        : true;

      return sameGrade && matchesRecommendation;
    });

    return filtered.sort((left, right) => {
      if (sortMode === "discussed") {
        return right.comments.length - left.comments.length;
      }

      if (sortMode === "highest") {
        return right.rating - left.rating;
      }

      return (
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      );
    });
  }, [books, onlyRecommended, session, sortMode]);

  const headerStats = useMemo(() => {
    const readers = new Set(visibleBooks.map((book) => book.posted_by_username)).size;
    const topRatedBook = [...visibleBooks].sort(
      (left, right) =>
        right.rating - left.rating || right.loved_it_count - left.loved_it_count
    )[0];
    const newCommentsToday = visibleBooks.reduce((count, book) => {
      return (
        count +
        book.comments.filter((comment) => isToday(comment.created_at)).length
      );
    }, 0);

    return {
      booksPosted: visibleBooks.length,
      readersThisWeek: readers,
      topRatedBook: topRatedBook?.title ?? "No books yet",
      newCommentsToday
    };
  }, [visibleBooks]);

  const featuredBooks = useMemo(() => {
    const topRated = [...visibleBooks].sort(
      (left, right) =>
        right.rating - left.rating || right.loved_it_count - left.loved_it_count
    )[0];
    const mostDiscussed = [...visibleBooks].sort(
      (left, right) => right.comments.length - left.comments.length
    )[0];
    const mostRecommended = [...visibleBooks]
      .filter((book) => book.recommendation_status === "Recommended")
      .sort(
        (left, right) =>
          right.loved_it_count - left.loved_it_count || right.rating - left.rating
      )[0];

    return [
      { label: "Top Rated", book: topRated },
      { label: "Most Discussed", book: mostDiscussed },
      { label: "Most Recommended", book: mostRecommended }
    ];
  }, [visibleBooks]);

  async function loadBooks() {
    let client;
    try {
      client = getSupabaseBrowserClient();
    } catch (error) {
      setBooks([]);
      setBooksError(
        error instanceof Error ? error.message : "Supabase is not configured."
      );
      setLoadingBooks(false);
      return;
    }

    setLoadingBooks(true);
    setBooksError("");

    const { data, error } = await client
      .from("book_posts")
      .select(
        "id, grade, title, author, cover_image_url, posted_by_username, reader_badge, rating, recommendation_status, review_text, loved_it_count, want_to_read_count, popular_count, funny_count, created_at, comments:book_comments(id, book_post_id, username, message, created_at)"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setBooks([]);
      setBooksError(error.message);
      setLoadingBooks(false);
      return;
    }

    const normalized = ((data ?? []) as BookPost[]).map((book) => ({
      ...book,
      reader_badge: book.reader_badge ?? null,
      loved_it_count: book.loved_it_count ?? 0,
      want_to_read_count: book.want_to_read_count ?? 0,
      popular_count: book.popular_count ?? 0,
      funny_count: book.funny_count ?? 0,
      comments: [...(book.comments ?? [])].sort(
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      )
    }));

    setBooks(normalized);
    setLoadingBooks(false);
  }

  async function handleEntrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEntryError("");
    if (!supabaseReady) {
      setEntryError("Supabase environment variables are missing.");
      return;
    }

    if (containsRealNamePattern(entryForm.username)) {
      setEntryError("Use a pretend username only. Do not use a real first and last name.");
      return;
    }

    const response = await fetch("/api/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessCode: entryForm.accessCode })
    });

    const result = (await response.json()) as { ok: boolean; message?: string };

    if (!response.ok || !result.ok) {
      setEntryError(result.message ?? "That room code does not match.");
      return;
    }

    const nextSession: EntrySession = {
      username: entryForm.username.trim(),
      grade: entryForm.grade,
      accessGranted: true
    };

    window.localStorage.setItem(sessionStorageKeys.username, nextSession.username);
    window.localStorage.setItem(sessionStorageKeys.grade, nextSession.grade);
    window.localStorage.setItem(sessionStorageKeys.accessGranted, "true");
    setComposer(emptyComposer(nextSession.username));
    setSession(nextSession);
  }

  async function handleBookSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setComposerFeedback("");

    if (!composer.title.trim() || !composer.reviewText.trim() || !composer.username.trim()) {
      setComposerFeedback("Please fill in the title, pretend username, and short review.");
      return;
    }

    if (containsRealNamePattern(composer.username)) {
      setComposerFeedback("Please use a pretend username only.");
      return;
    }

    setPostingBook(true);
    const client = getSupabaseBrowserClient();

    const { error } = await client.from("book_posts").insert({
      grade: session.grade,
      title: composer.title.trim(),
      author: composer.author.trim() || null,
      cover_image_url: composer.coverUrl.trim() || null,
      posted_by_username: composer.username.trim(),
      reader_badge: composer.readerBadge,
      rating: composer.rating,
      recommendation_status: composer.recommendationStatus,
      review_text: composer.reviewText.trim()
    });

    setPostingBook(false);

    if (error) {
      setComposerFeedback(error.message);
      return;
    }

    window.localStorage.setItem(sessionStorageKeys.username, composer.username.trim());
    setSession({ ...session, username: composer.username.trim() });
    setComposer(emptyComposer(composer.username.trim()));
    setComposerFeedback("Book posted to the wall.");
    await loadBooks();
  }

  async function handleCoverUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setComposerFeedback("Uploading cover image...");
    const client = getSupabaseBrowserClient();
    const extension = file.name.split(".").pop() ?? "jpg";
    const filePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const { error } = await client.storage
      .from("book-covers")
      .upload(filePath, file, { cacheControl: "3600", upsert: false });

    if (error) {
      setComposerFeedback(error.message);
      return;
    }

    const {
      data: { publicUrl }
    } = client.storage.from("book-covers").getPublicUrl(filePath);

    setComposer((current) => ({ ...current, coverUrl: publicUrl }));
    setComposerFeedback("Cover uploaded.");
  }

  async function handleCommentSubmit(bookId: string) {
    if (!session) {
      return;
    }

    const message = commentDrafts[bookId]?.trim();
    if (!message) {
      return;
    }

    setPostingCommentId(bookId);
    const client = getSupabaseBrowserClient();
    const { error } = await client.from("book_comments").insert({
      book_post_id: bookId,
      username: session.username,
      message
    });
    setPostingCommentId(null);

    if (error) {
      setBooksError(error.message);
      return;
    }

    setCommentDrafts((current) => ({ ...current, [bookId]: "" }));
    await loadBooks();
  }

  async function handleReaction(book: BookPost, reactionKey: ReactionKey) {
    const client = getSupabaseBrowserClient();
    const nextValue = (book[reactionKey] ?? 0) + 1;
    const { error } = await client
      .from("book_posts")
      .update({ [reactionKey]: nextValue })
      .eq("id", book.id);

    if (error) {
      setBooksError(error.message);
      return;
    }

    setBooks((current) =>
      current.map((item) =>
        item.id === book.id ? { ...item, [reactionKey]: nextValue } : item
      )
    );
  }

  function changeGrade(nextGrade: GradeId) {
    if (!session) {
      setEntryForm((current) => ({ ...current, grade: nextGrade }));
      return;
    }

    window.localStorage.setItem(sessionStorageKeys.grade, nextGrade);
    setSession({ ...session, grade: nextGrade });
  }

  function resetEntry() {
    window.localStorage.removeItem(sessionStorageKeys.accessGranted);
    setSession(null);
    setEntryForm((current) => ({ ...current, accessCode: "" }));
  }

  if (!session) {
    return (
      <main className="page-shell">
        <section className="entry-screen">
          <div className="entry-card">
            <div className="entry-hero">
              <div className="eyebrow">Summer Book Club</div>
              <h1>One reading wall for every grade.</h1>
              <p>
                Kids can share books, give simple ratings, recommend favorites,
                and leave kind comments right under each book.
              </p>
              <div className="entry-notice">
                <strong>
                  Use a pretend username only. Do not use your real name.
                </strong>
              </div>
              <div className="footer-note">
                Sample usernames:{" "}
                {fakeUsernameExamples.map((name, index) => (
                  <span key={name}>
                    <strong>{name}</strong>
                    {index < fakeUsernameExamples.length - 1 ? ", " : ""}
                  </span>
                ))}
              </div>
            </div>

            <form className="entry-form-card" onSubmit={handleEntrySubmit}>
              <div>
                <h2>Enter the book club</h2>
                <p className="muted">
                  Pick a grade room, type your made-up username, and enter the
                  shared room code.
                </p>
              </div>

              <div className="form-grid">
                <label>
                  Grade room
                  <select
                    value={entryForm.grade}
                    onChange={(event) =>
                      changeGrade(event.target.value as GradeId)
                    }
                  >
                    {grades.map((grade) => (
                      <option key={grade.id} value={grade.id}>
                        {grade.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Pretend username
                  <input
                    value={entryForm.username}
                    onChange={(event) =>
                      setEntryForm((current) => ({
                        ...current,
                        username: event.target.value
                      }))
                    }
                    placeholder="StarReader22"
                    maxLength={24}
                    required
                  />
                </label>

                <label>
                  Shared site code
                  <input
                    type="password"
                    value={entryForm.accessCode}
                    onChange={(event) =>
                      setEntryForm((current) => ({
                        ...current,
                        accessCode: event.target.value
                      }))
                    }
                    placeholder="Enter the room code"
                    required
                  />
                </label>
              </div>

              <div className="safety-note">
                This site uses a shared access code only. No email, no passwords,
                and no private messaging.
              </div>

              <button className="primary-button" type="submit">
                Enter Reading Wall
              </button>
              <p className="muted" aria-live="polite">
                {entryError}
              </p>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="room-screen">
        <div className="room-layout room-layout-simplified">
          <div className="room-main">
            <section className="surface-card story-header">
              <div className="story-header-copy">
                <div className="eyebrow">Summer Reading Wall</div>
                <h1>See what kids in your grade are reading.</h1>
                <p className="muted">
                  Share books, react to favorites, and discover what your class is
                  loving this summer.
                </p>
              </div>
              <div className="favorite-badge">
                <span>This Week&apos;s Favorite</span>
                <strong>{headerStats.topRatedBook}</strong>
              </div>
              <div className="story-stats">
                <div className="story-stat-card">
                  <span className="story-stat-label">Books Posted</span>
                  <strong>{headerStats.booksPosted}</strong>
                </div>
                <div className="story-stat-card">
                  <span className="story-stat-label">Readers This Week</span>
                  <strong>{headerStats.readersThisWeek}</strong>
                </div>
                <div className="story-stat-card">
                  <span className="story-stat-label">New Comments Today</span>
                  <strong>{headerStats.newCommentsToday}</strong>
                </div>
              </div>
            </section>

            <section className="surface-card highlights-panel">
              {featuredBooks.map((item, index) => (
                <article className="highlight-card" key={item.label}>
                  <span className="highlight-rank">#{index + 1}</span>
                  <div>
                    <p className="highlight-label">{item.label}</p>
                    <h3>{item.book?.title ?? "Waiting for a favorite"}</h3>
                    <p className="muted">
                      {item.book
                        ? `${item.book.posted_by_username} · ${item.book.comments.length} comments`
                        : "Post a few books to fill this spot."}
                    </p>
                  </div>
                </article>
              ))}
            </section>

            <section className="surface-card feed-controls">
              <div className="book-actions">
                <button
                  className={`sort-button ${sortMode === "newest" ? "is-active" : ""}`}
                  onClick={() => setSortMode("newest")}
                  type="button"
                >
                  Newest
                </button>
                <button
                  className={`sort-button ${sortMode === "highest" ? "is-active" : ""}`}
                  onClick={() => setSortMode("highest")}
                  type="button"
                >
                  Highest Rated
                </button>
                <button
                  className={`sort-button ${sortMode === "discussed" ? "is-active" : ""}`}
                  onClick={() => setSortMode("discussed")}
                  type="button"
                >
                  Most Discussed
                </button>
                <button
                  className={`toggle-button ${onlyRecommended ? "is-active" : ""}`}
                  onClick={() => setOnlyRecommended((current) => !current)}
                  type="button"
                >
                  Recommended Only
                </button>
              </div>
            </section>

            {booksError ? (
              <section className="surface-card">
                <p className="error-text">Supabase error: {booksError}</p>
              </section>
            ) : null}

            <section className="feed">
            {loadingBooks ? (
              <div className="surface-card empty-state">
                <h3>Loading books...</h3>
                <p className="muted">Pulling the latest posts from Supabase.</p>
              </div>
            ) : visibleBooks.length ? (
              visibleBooks.map((book) => (
                <article className="book-card compact-book-card" key={book.id}>
                  <div className="book-top compact-book-top">
                    <div className="cover-frame compact-cover-frame">
                      {book.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={book.cover_image_url} alt={`Cover for ${book.title}`} />
                      ) : (
                        <div className="cover-fallback">
                          <span>Summer Book</span>
                          <strong>{book.title}</strong>
                        </div>
                      )}
                    </div>

                    <div className="book-content">
                      <div className="book-heading compact-book-heading">
                        <div className="book-title-wrap">
                          <h2>{book.title}</h2>
                          <p className="book-meta">
                            {book.author ? `by ${book.author}` : "Author not listed"}
                          </p>
                        </div>
                        <span
                          className={`status-badge ${badgeClassName(
                            book.recommendation_status
                          )}`}
                        >
                          {book.recommendation_status}
                        </span>
                      </div>

                      <div className="rating-row compact-rating-row">
                        <span className="posted-by">
                          {book.posted_by_username}
                        </span>
                        {book.reader_badge ? (
                          <span className="reader-badge">{book.reader_badge}</span>
                        ) : null}
                        <span className="stars" aria-label={`${book.rating} out of 5 stars`}>
                          {Array.from({ length: 5 }, (_, index) => (
                            <span
                              key={`${book.id}-${index}`}
                              className={index < book.rating ? "filled" : ""}
                            >
                              &#9733;
                            </span>
                          ))}
                        </span>
                        <span className="muted">{book.rating}/5</span>
                      </div>

                      <div className="review-box compact-review-box">
                        <p>{book.review_text}</p>
                      </div>

                      <div className="comments-shell inline-comments-shell">
                        <div className="section-title">
                          <h3>Discussion</h3>
                          <span className="muted">
                            {book.comments.length} comment
                            {book.comments.length === 1 ? "" : "s"}
                          </span>
                        </div>

                        <div className="comment-list chat-list">
                          {book.comments.length ? (
                            book.comments.map((comment) => (
                              <article className="comment-item chat-item" key={comment.id}>
                                <div className="comment-head">
                                  <strong>{comment.username}</strong>
                                  <span className="muted">
                                    {formatTimestamp(comment.created_at)}
                                  </span>
                                </div>
                                <p>{comment.message}</p>
                              </article>
                            ))
                          ) : (
                            <div className="comment-item chat-item chat-empty">
                              <p className="muted">
                                No comments yet. Be the first to share a thought.
                              </p>
                            </div>
                          )}
                        </div>

                        <form
                          className="comment-form chat-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void handleCommentSubmit(book.id);
                          }}
                        >
                          <label className="chat-label">
                            <span className="sr-only">Write about this book</span>
                            <textarea
                              maxLength={220}
                              placeholder="Write about this book..."
                              value={commentDrafts[book.id] ?? ""}
                              onChange={(event) =>
                                setCommentDrafts((current) => ({
                                  ...current,
                                  [book.id]: event.target.value
                                }))
                              }
                            />
                          </label>
                          <div className="comment-actions">
                            <button className="primary-button" type="submit">
                              {postingCommentId === book.id ? "Posting..." : "Send"}
                            </button>
                          </div>
                        </form>

                        <div className="reaction-row">
                          {reactionOptions.map((reaction) => (
                            <button
                              className="reaction-button"
                              key={reaction.key}
                              onClick={() =>
                                void handleReaction(book, reaction.key as ReactionKey)
                              }
                              type="button"
                            >
                              <span className="reaction-icon">{reaction.icon}</span>
                              <span>{reaction.label}</span>
                              <strong>{book[reaction.key as ReactionKey]}</strong>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="surface-card empty-state">
                <h3>No books yet for {gradeLabel(session.grade)}.</h3>
                <p className="muted">Start the room by adding the first summer book below.</p>
              </div>
            )}
            </section>

            <section className="composer-card">
            <div className="composer-header">
              <div>
                <h2>Add a Book</h2>
              </div>
              <button
                className={`toggle-button ${composerOpen ? "is-active" : ""}`}
                onClick={() => setComposerOpen((current) => !current)}
                type="button"
              >
                {composerOpen ? "Hide Composer" : "Show Composer"}
              </button>
            </div>

            {composerOpen ? (
              <form className="form-grid" onSubmit={handleBookSubmit}>
                <div className="form-grid two-up">
                  <label>
                    Pretend username
                    <input
                      maxLength={24}
                      value={composer.username}
                      onChange={(event) =>
                        setComposer((current) => ({
                          ...current,
                          username: event.target.value
                        }))
                      }
                      required
                    />
                  </label>

                    <label>
                      Rating
                    <div className="stars-row composer-rating-row">
                      {Array.from({ length: 5 }, (_, index) => {
                        const value = index + 1;
                        return (
                          <button
                            className={value === composer.rating ? "is-selected" : ""}
                            key={value}
                            onClick={() =>
                              setComposer((current) => ({ ...current, rating: value }))
                            }
                            type="button"
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                    <span className="field-help">Tap a number from 1 to 5.</span>
                  </label>
                </div>

                <div className="form-grid two-up">
                  <label>
                    Book title
                    <input
                      value={composer.title}
                      onChange={(event) =>
                        setComposer((current) => ({
                          ...current,
                          title: event.target.value
                        }))
                      }
                      required
                    />
                  </label>

                  <label>
                    Author
                    <input
                      value={composer.author}
                      onChange={(event) =>
                        setComposer((current) => ({
                          ...current,
                          author: event.target.value
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="form-grid two-up">
                  <label>
                    Upload cover image
                    <input accept="image/*" onChange={handleCoverUpload} type="file" />
                  </label>

                  <label>
                    Or paste image URL
                    <input
                      type="url"
                      value={composer.coverUrl}
                      onChange={(event) =>
                        setComposer((current) => ({
                          ...current,
                          coverUrl: event.target.value
                        }))
                      }
                      placeholder="https://..."
                    />
                  </label>
                </div>

                <label>
                  Reading badge
                  <select
                    value={composer.readerBadge}
                    onChange={(event) =>
                      setComposer((current) => ({
                        ...current,
                        readerBadge: event.target.value
                      }))
                    }
                  >
                    {readingBadges.map((badge) => (
                      <option key={badge} value={badge}>
                        {badge}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Recommendation
                  <select
                    value={composer.recommendationStatus}
                    onChange={(event) =>
                      setComposer((current) => ({
                        ...current,
                        recommendationStatus:
                          event.target.value as RecommendationStatus
                      }))
                    }
                  >
                    {recommendationOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Short review
                  <textarea
                    maxLength={280}
                    placeholder="This book is funny. I liked the dragon part."
                    value={composer.reviewText}
                    onChange={(event) =>
                      setComposer((current) => ({
                        ...current,
                        reviewText: event.target.value
                      }))
                    }
                    required
                  />
                </label>

                <div className="composer-actions">
                  <button className="primary-button" disabled={postingBook} type="submit">
                    {postingBook ? "Posting..." : "Post Book"}
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => {
                      setComposer(emptyComposer(session.username));
                      setComposerFeedback("");
                    }}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
                <p className="muted" aria-live="polite">
                  {composerFeedback}
                </p>
              </form>
            ) : null}
            </section>
          </div>

          <aside className="surface-card grade-rail" aria-label="Grade rooms">
            <div className="grade-rail-head">
              <div className="grade-rail-label">Grades</div>
              <div className="toolbar-copy grade-count">
                {visibleBooks.length} book{visibleBooks.length === 1 ? "" : "s"}
              </div>
              <button
                className="ghost-button grade-rail-change"
                onClick={resetEntry}
                type="button"
              >
                Change Username
              </button>
            </div>
            <div className="grade-rail-tabs" role="tablist">
              {grades.map((grade) => (
                <button
                  key={grade.id}
                  className={`tab-button grade-rail-button ${
                    session.grade === grade.id ? "is-active" : ""
                  }`}
                  onClick={() => changeGrade(grade.id)}
                  type="button"
                >
                  <span className="grade-rail-short">{grade.shortLabel}</span>
                  <span className="grade-rail-text">{grade.label}</span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function gradeLabel(gradeId: GradeId) {
  return grades.find((grade) => grade.id === gradeId)?.label ?? "Grade";
}

function badgeClassName(status: RecommendationStatus) {
  if (status === "Recommended") {
    return "status-recommended";
  }

  if (status === "Not Recommended") {
    return "status-not-recommended";
  }

  return "status-still-reading";
}

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function isToday(timestamp: string) {
  const value = new Date(timestamp);
  const today = new Date();

  return (
    value.getFullYear() === today.getFullYear() &&
    value.getMonth() === today.getMonth() &&
    value.getDate() === today.getDate()
  );
}

function containsRealNamePattern(value: string) {
  return /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(value.trim());
}
