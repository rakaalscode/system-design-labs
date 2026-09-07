import http from 'http';

const endpoint = process.argv[2] || '/buy-bad';
const TOTAL_REQUESTS = 50;

console.log(`\n[Load Test] Menembak ${TOTAL_REQUESTS} request bersamaan ke ${endpoint}...`);

let successCount = 0;
let failedCount = 0;
let completedCount = 0;

const startTime = Date.now();

function sendRequest(): void {
  const options: http.RequestOptions = {
    hostname: 'localhost',
    port: 3000,
    path: endpoint,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const req = http.request(options, (res) => {
    if (res.statusCode === 200) {
      successCount++;
    } else {
      failedCount++;
    }

    completedCount++;
    if (completedCount === TOTAL_REQUESTS) {
      printResult();
    }
  });

  req.on('error', () => {
    failedCount++;
    completedCount++;
    if (completedCount === TOTAL_REQUESTS) {
      printResult();
    }
  });

  req.end();
}

function printResult(): void {
  // Hitung total durasi waktu yang dihabiskan
  const durationMs = Date.now() - startTime;

  console.log('\n================ HASIL AKHIR ================');
  console.log(`Target Endpoint : ${endpoint}`);
  console.log(`Total Request   : ${completedCount}`);
  console.log(`Sukses (200 OK) : ${successCount}`);
  console.log(`Gagal  (400/500): ${failedCount}`);
  console.log(`Durasi Total    : ${durationMs} ms (${(durationMs / 1000).toFixed(2)} detik)`);
  console.log(`Rata-rata/Req   : ${(durationMs / completedCount).toFixed(2)} ms`);
  console.log('=============================================\n');
}

// Tembak 50 request secara paralel
for (let i = 0; i < TOTAL_REQUESTS; i++) {
  sendRequest();
}