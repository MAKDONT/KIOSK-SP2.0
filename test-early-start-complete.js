#!/usr/bin/env node

import http from 'http';

// Helper to make HTTP requests
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
  console.log('🧪 Early Consultation Start Email Test\n');
  
  // Step 1: Fetch faculty
  console.log('📋 Step 1: Fetching faculty...');
  const facultyRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/faculty',
    method: 'GET'
  });

  if (facultyRes.status !== 200 || !Array.isArray(facultyRes.data)) {
    console.error('❌ Failed to fetch faculty');
    return;
  }

  const faculty = facultyRes.data[0];
  console.log(`✅ Found faculty: ${faculty.name}\n`);

  // Step 2: Get faculty availability  
  console.log('📋 Step 2: Fetching faculty availability...');
  const availRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/faculty/${faculty.id}/weekly-schedule`,
    method: 'GET'
  });

  if (availRes.status !== 200) {
    console.error('❌ Failed to fetch availability');
    return;
  }

  const slots = availRes.data;
  const availableSlot = slots.find(s => !s.isPast);
  
  if (!availableSlot) {
    console.error('❌ No available slots found');
    return;
  }

  console.log(`✅ Found available slot: ${availableSlot.date} ${availableSlot.start_time}\n`);

  // Step 3: Join queue to create consultation
  // Use Monday since today is Saturday and most faculty don't work weekends
  const bookingDate = new Date(availableSlot.date);
  bookingDate.setDate(bookingDate.getDate() + 2); // Move to Monday
  const formattedDate = bookingDate.toISOString().split('T')[0];
  
  console.log(`📋 Step 3: Booking consultation for ${formattedDate}...`);
  const bookRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/queue/join',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    },
    {
      student_id: 'e9a635da-54c2-412f-bdf4-01e577705636',  // Mark Jerome
      faculty_id: faculty.id,
      purpose: 'Test early start email',
      requested_date: formattedDate
    }
  );

  if (bookRes.status !== 201 && bookRes.status !== 200) {
    console.error(`❌ Booking failed: ${bookRes.status}`, bookRes.data);
    return;
  }

  const consultationId = bookRes.data.id;
  console.log(`✅ Consultation booked: ${consultationId}\n`);

  // Step 4: Update status to "serving" (triggers early start email)
  console.log('📋 Step 4: Starting consultation (will trigger early start email)...');
  const startRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: `/api/queue/${consultationId}/status`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    },
    {
      status: 'serving',
      recording_enabled: true,
      meet_link: 'https://meet.google.com/early-start-test-' + Date.now()
    }
  );

  console.log(`Response Status: ${startRes.status}`);
  console.log('Response:', JSON.stringify(startRes.data, null, 2));
  
  console.log('\n✅ Test Complete!\n');
  console.log('📊 Check server logs for:');
  console.log('  ⏰ [EARLY START] Faculty started consultation BEFORE scheduled time!');
  console.log('  ⏰ FAST-TRACK [EARLY_START] HIGH PRIORITY: (email address) (XXXms)');
  console.log('  ✅ Early start email sent to student (HIGH PRIORITY)');
  console.log('  📧 SendGrid email delivery confirmation\n');
}

testEarlyStart().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
