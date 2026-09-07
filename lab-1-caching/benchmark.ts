import autocannon from 'autocannon';

const targetEndpoint = process.argv[2] || 'no-cache';
const url = `http://localhost:3001/articles/${targetEndpoint}/system-design-roadmap`;

console.log(`\n======================================================`);
console.log(`Menjalankan Benchmark selama 5 detik ke:`);
console.log(`[URL] ${url}`);
console.log(`======================================================\n`);

async function runBenchmark() {
  const result = await autocannon({
    url,
    connections: 20, // 20 koneksi paralel terus-menerus
    duration: 5,     // Tes selama 5 detik
    pipelining: 1,
  });

  console.log('--- HASIL PENGUJIAN ---');
  console.log(`Throughput  : ${result.requests.average} Req / Detik`);
  console.log(`Total Req   : ${result.requests.total} request selesai`);
  console.log(`Latency Avg : ${result.latency.average} ms`);
  console.log(`Latency p99 : ${result.latency.p99} ms (99% request di bawah angka ini)`);
  console.log(`Throughput MB: ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);
  console.log('-----------------------\n');
}

runBenchmark();