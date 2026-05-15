#!/usr/bin/env node

import http from 'http';

// Test data
const consultationId = '8af7b36b-d8ea-4e5a-a9dd-5afdf8a224a2';  // Existing consultation
const requestBody = JSON.stringify({
  status: 'serving',
  recording_enabled: true,
  meet_link: 'https://meet.google.com/early-start-test-' + Date.now()
});

console.log('🧪 Testing Early Consultation Start Email\n');
console.log(`📋 Details:`);
console.log(`  - Consultation ID: ${consultationId}`);
console.log(`  - Status: serving (will trigger early start detection)`);
console.log(`  - Meet Link: ${JSON.parse(requestBody).meet_link}`);
console.log(`  - Recording: enabled\n`);

const options = {
  hostname: 'localhost',
  port: 3000,
  path: `/api/queue/${consultationId}/status`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(requestBody)
  },
  timeout: 10000
};

console.log('📤 Sending request to server...\n');

const req = http.request(options, (res) => {
  let data = '';
  
  console.log(`📊 Response Status: ${res.statusCode}\n`);

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const responseData = JSON.parse(data);
      console.log('✅ Response received:');
      console.log(JSON.stringify(responseData, null, 2));
    } catch (e) {
      console.log('Response (raw):', data);
    }
    
    console.log('\n💡 Check server logs for:');
    console.log('  ⏰ [EARLY START] Faculty started consultation BEFORE scheduled time!');
    console.log('  ⏰ FAST-TRACK [EARLY_START] HIGH PRIORITY: (email address) (XXXms)');
    console.log('  ✅ Early start email sent to student (HIGH PRIORITY)');
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error('❌ Request failed:', e.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('❌ Request timeout');
  req.destroy();
  process.exit(1);
});

req.write(requestBody);
req.end();
