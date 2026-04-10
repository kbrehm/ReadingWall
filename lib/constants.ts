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

export const sessionStorageKeys = {
  username: "reading-wall-username",
  grade: "reading-wall-grade",
  accessGranted: "reading-wall-access-granted"
} as const;
