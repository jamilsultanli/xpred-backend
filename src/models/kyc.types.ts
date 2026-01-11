export interface VerificationRequest {
  id: string;
  user_id: string;
  document_url: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  created_at: string;
}

export interface SubmitKYCDto {
  document_url: string;
}

export interface UpdateKYCStatusDto {
  decision: 'approved' | 'rejected';
  admin_notes?: string;
}


