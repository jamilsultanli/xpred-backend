export interface Post {
  id: string;
  user_id: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
}

export interface CreatePostDto {
  content: string;
  image_url?: string;
}

export interface UpdatePostDto {
  content?: string;
  image_url?: string;
}

export interface Comment {
  id: string;
  user_id: string;
  post_id: string;
  content: string;
  created_at: string;
}

export interface CreateCommentDto {
  content: string;
}


