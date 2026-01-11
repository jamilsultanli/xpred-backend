export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  balance_xp: number;
  balance_xc: number;
  is_verified: boolean;
  is_banned: boolean;
  role: 'user' | 'admin' | 'moderator';
  created_at: string;
}

export interface CreateUserDto {
  email: string;
  password: string;
  full_name?: string;
  username?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface UpdateProfileDto {
  full_name?: string;
  username?: string;
  bio?: string;
  city?: string;
  country?: string;
  website?: string;
  avatar_url?: string;
}


