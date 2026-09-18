const SUPABASE_URL = "https://dvxfxbvdsubigemrqiph.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_P-5YSZbmqvAB4FhG8olsFw_BebFz2Wz";

const { createClient } = supabase;

const db = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);
