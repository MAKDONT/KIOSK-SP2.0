import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from("queue")
    .insert({ student_id: "2021-0001", faculty_id: "fac-001" })
    .select();
    
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Inserted row keys:", data && data.length > 0 ? Object.keys(data[0]) : "No rows");
    
    // cleanup
    await supabase.from("queue").delete().eq("id", data[0].id);
  }
}

run();
