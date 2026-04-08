async function run() {
  const res = await fetch('http://localhost:3000/api/check-constraint');
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
run();
