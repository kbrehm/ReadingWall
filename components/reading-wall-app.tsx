"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  fakeUsernameExamples,
  grades,
  recommendationOptions,
  sessionStorageKeys
} from "@/lib/constants";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { BookPost, EntrySession, GradeId, RecommendationStatus } from "@/lib/types";

type SortMode = "newest" | "highest";

type EntryFormState = {
  username: string;
  grade: GradeId;
  accessCode: string;
};

type BookComposerState = {
  title: string;
  author: string;
  username: string;
  rating: number;
  recommendationStatus: RecommendationStatus;
  reviewText: string;
  coverUrl: string;
};

const emptyComposer = (username: string): BookComposerState => ({
  title: "",
  author: "",
  username,
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
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});
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
      if (sortMode === "highest") {
        return right.rating - left.rating;
      }

      return (
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      );
    });
  }, [books, onlyRecommended, session, sortMode]);

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
        "id, grade, title, author, cover_image_url, posted_by_username, rating, recommendation_status, review_text, created_at, comments:book_comments(id, book_post_id, username, message, created_at)"
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
    setOpenThreads((current) => ({ ...current, [bookId]: false }));
    await loadBooks();
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
        <div className="room-layout">
          <section className="surface-card room-header">
            <div>
              <div className="eyebrow">Reading Wall</div>
              <h1>{gradeLabel(session.grade)} Book Room</h1>
              <p>
                Share what you&apos;re reading, recommend books, and talk about
                them.
              </p>
              <div className="room-subline">
                <span className="chip">
                  In room as <strong>{session.username}</strong>
                </span>
                <span className="chip">Supabase-backed posts and comments</span>
              </div>
            </div>
            <button className="secondary-button" onClick={resetEntry} type="button">
              Change Username
            </button>
          </section>

          <section className="surface-card">
            <div className="grade-tabs" role="tablist" aria-label="Grade rooms">
              {grades.map((grade) => (
                <button
                  key={grade.id}
                  className={`tab-button ${
                    session.grade === grade.id ? "is-active" : ""
                  }`}
                  onClick={() => changeGrade(grade.id)}
                  type="button"
                >
                  {grade.label}
                </button>
              ))}
            </div>
          </section>

          <section className="surface-card">
            <div className="toolbar-row">
              <div className="toolbar-copy">
                {visibleBooks.length} book{visibleBooks.length === 1 ? "" : "s"} in
                this room
              </div>
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
                  className={`toggle-button ${onlyRecommended ? "is-active" : ""}`}
                  onClick={() => setOnlyRecommended((current) => !current)}
                  type="button"
                >
                  Recommended Only
                </button>
              </div>
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
                <article className="book-card" key={book.id}>
                  <div className="book-top">
                    <div className="cover-frame">
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

                    <div>
                      <div className="book-heading">
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

                      <div className="rating-row">
                        <span className="posted-by">
                          Posted by: {book.posted_by_username}
                        </span>
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

                      <div className="review-box">
                        <p>{book.review_text}</p>
                      </div>

                      <div className="book-actions top-gap">
                        <button
                          className="secondary-button"
                          onClick={() =>
                            setOpenThreads((current) => ({
                              ...current,
                              [book.id]: true
                            }))
                          }
                          type="button"
                        >
                          Join Discussion
                        </button>
                        <button
                          className="ghost-button"
                          onClick={() =>
                            setOpenThreads((current) => ({
                              ...current,
                              [book.id]: true
                            }))
                          }
                          type="button"
                        >
                          Add Update
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="comments-shell">
                    <div className="section-title">
                      <h3>Book Discussion</h3>
                      <span className="muted">
                        {book.comments.length} comment{book.comments.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="comment-list">
                      {book.comments.length ? (
                        book.comments.map((comment) => (
                          <article className="comment-item" key={comment.id}>
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
                        <div className="comment-item">
                          <p className="muted">
                            No comments yet. Be the first to share a thought
                            about this book.
                          </p>
                        </div>
                      )}
                    </div>

                    {openThreads[book.id] ? (
                      <form
                        className="comment-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void handleCommentSubmit(book.id);
                        }}
                      >
                        <label>
                          Write about this book...
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
                            {postingCommentId === book.id ? "Posting..." : "Post Comment"}
                          </button>
                          <button
                            className="ghost-button"
                            onClick={() =>
                              setOpenThreads((current) => ({
                                ...current,
                                [book.id]: false
                              }))
                            }
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : null}
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
                <p className="muted">
                  Upload a cover to the <code>book-covers</code> bucket or paste an image URL.
                </p>
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
                    <div className="stars-row">
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
                    <span className="field-help">
                      Uploads directly to the public <code>book-covers</code> bucket.
                    </span>
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

function containsRealNamePattern(value: string) {
  return /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(value.trim());
}
