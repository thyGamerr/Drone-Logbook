<script>
async function sendTest() {
  const url = 'https://script.google.com/macros/s/AKfycbypQst3AW88aybQfMSMXvax2RPR4E_-t_N6GmdJVfEMg5R8FdBeujsihxw8VSmEnRo3/exec';
  const payload = {
    flightName: 'Test Flight 001',
    project: 'Demo',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 600000).toISOString(),
    lat: 48.3701,
    lon: -123.7356,
    notes: 'Hello from client',
    driveType: 'Shared',
    clientEmail: (window.currentUserEmail || '') // optional
  };

  // If you hit a CORS error, flip mode to 'no-cors' (you won’t be able to read the response, but the row will append):
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // Optional: show server reply if CORS allows it
  try {
    const data = await resp.json();
    console.log('Server says:', data);
    alert(data.ok ? '✅ Log appended' : ('❌ ' + (data.error || 'Unknown error')));
  } catch {
    alert('Posted (response not readable in this browser due to CORS). Check the Sheet.');
  }
}
</script>

<button onclick="sendTest()">Send Test Log</button>
