-- Create table for interaction feedback and learning
CREATE TABLE public.interaction_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  interaction_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  tools_used TEXT[] DEFAULT '{}',
  success_score INTEGER CHECK (success_score >= 1 AND success_score <= 5),
  failure_reason TEXT,
  reflection_analysis JSONB,
  user_feedback TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for learned patterns
CREATE TABLE public.learned_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_type TEXT NOT NULL, -- 'success', 'failure', 'user_preference'
  pattern_description TEXT NOT NULL,
  frequency INTEGER DEFAULT 1,
  context JSONB,
  prompt_rule TEXT, -- Rule to add to system prompt
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for user preferences
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  preference_type TEXT NOT NULL,
  preference_value JSONB NOT NULL,
  confidence_score FLOAT DEFAULT 0.5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, preference_type)
);

-- Enable RLS
ALTER TABLE public.interaction_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learned_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for interaction_feedback
CREATE POLICY "Users can view their own feedback"
  ON public.interaction_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert feedback"
  ON public.interaction_feedback FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update feedback"
  ON public.interaction_feedback FOR UPDATE
  USING (true);

-- RLS Policies for learned_patterns (system-wide, readable by all)
CREATE POLICY "Everyone can view active patterns"
  ON public.learned_patterns FOR SELECT
  USING (is_active = true);

CREATE POLICY "System can manage patterns"
  ON public.learned_patterns FOR ALL
  USING (true);

-- RLS Policies for user_preferences
CREATE POLICY "Users can view their own preferences"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can manage user preferences"
  ON public.user_preferences FOR ALL
  USING (true);

-- Create indexes for performance
CREATE INDEX idx_interaction_feedback_user_id ON public.interaction_feedback(user_id);
CREATE INDEX idx_interaction_feedback_created_at ON public.interaction_feedback(created_at DESC);
CREATE INDEX idx_interaction_feedback_success_score ON public.interaction_feedback(success_score);
CREATE INDEX idx_learned_patterns_active ON public.learned_patterns(is_active) WHERE is_active = true;
CREATE INDEX idx_user_preferences_user_id ON public.user_preferences(user_id);

-- Trigger for updating learned_patterns updated_at
CREATE TRIGGER update_learned_patterns_updated_at
  BEFORE UPDATE ON public.learned_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updating user_preferences updated_at
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();