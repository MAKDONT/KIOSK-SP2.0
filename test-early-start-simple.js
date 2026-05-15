#!/usr/bin/env node

import http from 'http';

function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000);
    
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testEarlyStart() {
  console.log('🧪 Testing Early Consultation Email\n');
  
  // Fixed data based on database
  const studentId = 'e9a635da-54c2-412f-bdf4-01e577705636';  // Mark Jerome
  const facultyId = 'dd469e5a-8d94-4fc8-b011-5e92fdb2f2de';   // Engr. Bernard Fabro
  const bookingDate = '2026-05-18';  // Monday (2 days from today - Saturday)
  
  console.log('📋 Booking consultation...');
  const bookRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/queue/join',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    {
      student_id: studentId,
      faculty_id: facultyId,
      purpose: 'Testing early start notification',
      queue_date: bookingDate
    }
  );

  if (bookRes.status !== 201 && bookRes.status !== 200) {
    console.error(`❌ Booking failed: ${bookRes.status}`);
    console.error(JSON.stringify(bookRes.data, null, 2));
    return;
  }

  const consultationId = bookRes.data.id;
  console.log(`✅ Consultation created: ${consultationId}\n`);

  // Wait 1 second before triggering status update
  await new Promise(r => setTimeout(r, 1000));

  console.log('📋 Triggering early start (status = serving)...');
  console.log(`   This happens BEFORE the scheduled time, so it should send early start email\n`);
  
  const startRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: `/api/queue/${consultationId}/status`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    {
      status: 'serving',
      recording_enabled: true,
      meet_link: 'https://meet.google.com/early-start-test-' + Date.now()
    }
  );

  console.log(`📊 Response Status: ${startRes.status}`);
  if (startRes.status === 200) {
    console.log('✅ Status update successful\n');
  } else {
    console.error('❌ Status update failed:', startRes.data);
    return;
  }
  
  console.log('✅ Test Complete!\n');
  console.log('📊 Expected logs from server:');
  console.log('  ⏰ [EARLY START] Faculty started consultation BEFORE scheduled time!');
  console.log('  ⏰ FAST-TRACK [EARLY_START] HIGH PRIORITY: (email address) (~400-550ms)');
  console.log('  ✅ Early start email sent to student (HIGH PRIORITY)');
  console.log('  🔔 Early start broadcast sent to student dashboard\n');
  
  console.log('📧 Email should be sent to: mackadoodledoo100@gmail.com');
  console.log('   Subject: Your Consultation is Starting Early!');
  console.log('   Priority: HIGH (EARLY_START)');
}

testEarlyStart().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
