export type GradeId = "k" | "1" | "2" | "3" | "4" | "5";

export type RecommendationStatus =
  | "Recommended"
  | "Still Reading"
  | "Not Recommended";

export type BookComment = {
  id: string;
  book_post_id: string;
  username: string;
  message: string;
  created_at: string;
};

export type BookPost = {
  id: string;
  grade: GradeId;
  title: string;
  author: string | null;
  cover_image_url: string | null;
  posted_by_username: string;
  rating: number;
  recommendation_status: RecommendationStatus;
  review_text: string;
  created_at: string;
  comments: BookComment[];
};

export type EntrySession = {
  username: string;
  grade: GradeId;
  accessGranted: boolean;
};
