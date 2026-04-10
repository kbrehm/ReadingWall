export const grades = [
  { id: "k", label: "Kindergarten", shortLabel: "K" },
  { id: "1", label: "1st Grade", shortLabel: "1" },
  { id: "2", label: "2nd Grade", shortLabel: "2" },
  { id: "3", label: "3rd Grade", shortLabel: "3" },
  { id: "4", label: "4th Grade", shortLabel: "4" },
  { id: "5", label: "5th Grade", shortLabel: "5" }
] as const;

export const recommendationOptions = [
  "Recommended",
  "Still Reading",
  "Not Recommended"
] as const;

export const fakeUsernameExamples = [
  "StarReader22",
  "BookBugK",
  "RocketBookmarks",
  "MoonPage3",
  "QuietQuill"
];

export const readingBadges = [
  "Adventure Pick",
  "Funny Book",
  "Great for Summer",
  "Big Surprise Ending",
  "Easy Read",
  "Challenge Book"
] as const;

export const reactionOptions = [
  { key: "loved_it_count", label: "Loved it", icon: "STAR" },
  { key: "want_to_read_count", label: "Want to read", icon: "BOOK" },
  { key: "popular_count", label: "Popular", icon: "FIRE" },
  { key: "funny_count", label: "Funny", icon: "SMILE" }
] as const;

export const sessionStorageKeys = {
  username: "reading-wall-username",
  grade: "reading-wall-grade",
  accessGranted: "reading-wall-access-granted"
} as const;
