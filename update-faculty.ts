import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from("faculty")
    .update({ status: "available" })
    .neq("status", "available")
    .select();
    
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Updated faculty:", data);
  }
}

run();
