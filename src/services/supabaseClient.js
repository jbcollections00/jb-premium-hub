import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwazrebdlzdkwdhrintr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3YXpyZWJkbHpka3dkaHJpbnRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NTk4MzcsImV4cCI6MjEwMjIzNTgzN30.LpesgGVwChr1dgjwFHuWXMCcYw1eFBw6rosqlX_vO-A';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);