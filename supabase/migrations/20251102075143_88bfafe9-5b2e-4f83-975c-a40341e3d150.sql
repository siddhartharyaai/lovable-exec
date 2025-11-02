-- Enable RLS on logs table
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- Service accounts can insert logs (using service role key)
-- Users don't need direct access to logs table
CREATE POLICY "Service can insert logs"
ON public.logs
FOR INSERT
WITH CHECK (true);

-- Service can read all logs
CREATE POLICY "Service can read logs"
ON public.logs
FOR SELECT
USING (true);