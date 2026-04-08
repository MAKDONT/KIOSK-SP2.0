import fetch from 'node-fetch';
async function run() {
  const res = await fetch('http://localhost:3000/api/queue/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_id: 'TEST1234',
      faculty_id: '123e4567-e89b-12d3-a456-426614174000',
      source: 'web',
      student_name: 'Test Student',
      student_email: 'test@example.com',
      course: 'BSCS',
      purpose: 'Test',
      time_period: '08:00-09:00'
    })
  });
  const data = await res.json();
  console.log(data);
}
run();
