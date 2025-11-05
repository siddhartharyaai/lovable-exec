-- Add city field to users table for weather forecasting
ALTER TABLE public.users 
ADD COLUMN city TEXT DEFAULT 'Mumbai';

COMMENT ON COLUMN public.users.city IS 'User city for weather forecasts and location-based features';