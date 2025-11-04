-- Create user_documents table for PDF/DOC/DOCX uploads
CREATE TABLE IF NOT EXISTS public.user_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  content_text TEXT NOT NULL, -- Full extracted text
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster user document queries
CREATE INDEX idx_user_documents_user_id ON public.user_documents(user_id);
CREATE INDEX idx_user_documents_created_at ON public.user_documents(created_at DESC);

-- Enable RLS
ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;

-- Users can view their own documents
CREATE POLICY "Users can view their own documents"
  ON public.user_documents
  FOR SELECT
  USING (auth.uid() = user_id);

-- System can insert documents
CREATE POLICY "System can insert documents"
  ON public.user_documents
  FOR INSERT
  WITH CHECK (true);

-- System can update documents
CREATE POLICY "System can update documents"
  ON public.user_documents
  FOR UPDATE
  USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_user_documents_updated_at
  BEFORE UPDATE ON public.user_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();