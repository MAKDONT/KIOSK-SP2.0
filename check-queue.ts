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
    .from("queue")
    .select("*")
    .limit(1);
    
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Queue row keys:", data && data.length > 0 ? Object.keys(data[0]) : "No rows");
  }
}

run();
