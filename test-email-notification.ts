/**
 * Test Script for New Email Notification System
 * Tests that next student gets email when previous consultation completes
 * 
 * Usage: npx ts-node test-email-notification.ts
 */

const BASE_URL = "http://localhost:3000";

async function apiCall(endpoint: string, method: string = "GET", body?: any) {
  const options: any = {
    method,
    headers: { "Content-Type": "application/json" }
  };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`API Error [${response.status}]: ${JSON.stringify(data)}`);
  }
  
  return data;
}

async function testEmailNotificationSystem() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║    EMAIL NOTIFICATION SYSTEM TEST                          ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  try {
    // Step 1: Get faculty list
    console.log("📋 Step 1: Fetching faculty members...");
    const faculty = await apiCall("/api/faculty");
    if (!faculty || faculty.length === 0) {
      throw new Error("No faculty found! Please add faculty members first.");
    }
    const facultyId = faculty[0].id;
    const facultyName = faculty[0].name;
    console.log(`✓ Found faculty: ${facultyName} (${facultyId})\n`);

    // Step 2: Queue first student
    console.log("📋 Step 2: Queueing STUDENT 1...");
    const student1Id = `TSTD${Math.random().toString().slice(2, 8)}`;
    const student1Response = await apiCall("/api/queue/join", "POST", {
      student_id: student1Id,
      faculty_id: facultyId,
      source: "web",
      student_name: "Student One",
      student_email: "student1@test.com",
      course: "BSCS",
      purpose: "Test Consultation 1",
      time_period: "10:00-10:30"
    });
    const consultationId1 = student1Response.id;
    console.log(`✓ Student 1 queued with email: student1@test.com`);
    console.log(`  Consultation ID: ${consultationId1}\n`);

    // Step 3: Queue second student
    console.log("📋 Step 3: Queueing STUDENT 2 (NEXT)...");
    const student2Id = `TSTD${Math.random().toString().slice(2, 8)}`;
    const student2Response = await apiCall("/api/queue/join", "POST", {
      student_id: student2Id,
      faculty_id: facultyId,
      source: "web",
      student_name: "Student Two",
      student_email: "student2@test.com",
      course: "BSCS",
      purpose: "Test Consultation 2",
      time_period: "10:30-11:00"
    });
    const consultationId2 = student2Response.id;
    console.log(`✓ Student 2 (next in queue) queued with email: student2@test.com`);
    console.log(`  Consultation ID: ${consultationId2}\n`);

    // Step 4: Get meet link for consultation 1
    console.log("📋 Step 4: Generating Google Meet link for Student 1...");
    const meetLinkResponse = await apiCall(`/api/queue/${consultationId1}/meet-link`, "POST");
    const meetLink = meetLinkResponse.meet_link;
    console.log(`✓ Meet link generated: ${meetLink}\n`);

    // Step 5: Mark consultation 1 as "serving"
    console.log("📋 Step 5: Marking Student 1 consultation as SERVING...");
    await apiCall(`/api/queue/${consultationId1}/status`, "POST", {
      status: "serving",
      meet_link: meetLink,
      recording_enabled: true
    });
    console.log(`✓ Consultation 1 marked as SERVING\n`);

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 6: Mark consultation 1 as "completed" - THIS SHOULD TRIGGER EMAIL TO STUDENT 2!
    console.log("📋 Step 6: Marking Student 1 consultation as COMPLETED...");
    console.log("   (This should trigger email to Student 2)\n");
    
    await apiCall(`/api/queue/${consultationId1}/status`, "POST", {
      status: "completed",
      recording_enabled: true
    });
    console.log(`✓ Consultation 1 marked as COMPLETED\n`);

    // Summary
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║    TEST COMPLETED - CHECK SERVER LOGS                      ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");
    
    console.log("📧 Expected Email Notification:");
    console.log("  TO: student2@test.com");
    console.log("  SUBJECT: Your turn is coming up!");
    console.log("  CONTENT: Next in Queue notification with meet link\n");

    console.log("🔍 CHECK SERVER CONSOLE FOR:");
    console.log("  ✓ Queue Status Update - ID: [id], Status: completed");
    console.log("  ✓ Meet Link Debug - actual_link: [meet_link]");
    console.log("  ✓ ✓ Next student notified: student2@test.com");
    console.log("  ✓   - Meet link: YES - [meet_link]\n");

    console.log("📩 CHECK SENDGRID DASHBOARD:");
    console.log("  1. Go to https://app.sendgrid.com/");
    console.log("  2. Navigate to Logs");
    console.log("  3. Search for 'student2@test.com'");
    console.log("  4. Verify email was sent with subject 'Your turn is coming up!'\n");

  } catch (error) {
    console.error("\n❌ Test Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testEmailNotificationSystem().then(() => {
  console.log("✅ Test script completed successfully!\n");
  process.exit(0);
}).catch(err => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
