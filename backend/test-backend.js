/**
 * DigitalVision — Backend Automated Test Suite
 *
 * Tests all backend routes, keyword classification, validation,
 * error handling, and timeout behavior against a live server instance.
 */

import http from 'http';
import app from './server.js';

let server;
let passed = 0;
let failed = 0;
const TEST_PORT = 3099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    let payload = null;

    if (body !== null) {
      if (typeof body === 'string') {
        payload = body;
      } else {
        payload = JSON.stringify(body);
        if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING BACKEND TEST SUITE ---');

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Health check
  console.log('\n[1. Health Endpoint]');
  const health = await request('GET', '/api/health');
  assert(health.status === 200, 'GET /api/health returns 200');
  assert(health.body.status === 'ok', 'Health status is "ok"');
  assert(typeof health.body.timestamp === 'string', 'Health includes timestamp');
  assert(typeof health.body.model === 'string', 'Health includes model identifier');

  // 2. Intent validation
  console.log('\n[2. Intent Validation]');
  const missingText = await request('POST', '/api/intent', { lang: 'en-IN' });
  assert(missingText.status === 400, 'Missing text returns 400');
  assert(missingText.body.error.includes('text'), 'Error mentions missing text');

  const missingLang = await request('POST', '/api/intent', { text: 'hello' });
  assert(missingLang.status === 400, 'Missing lang returns 400');

  // 3. Keyword intent classification (English)
  console.log('\n[3. Keyword Intent Classification — English]');
  const englishCases = [
    { text: 'what is around me', expected: 'DESCRIBE_SURROUNDINGS' },
    { text: 'can you read this sign', expected: 'READ_TEXT' },
    { text: 'where is the washroom', expected: 'FIND_WASHROOM' },
    { text: 'is there any obstacle in front of me', expected: 'OBSTACLE_CHECK' },
    { text: 'which way should i walk', expected: 'NAVIGATE_HELP' },
    { text: 'start monitoring', expected: 'START_MONITORING' },
    { text: 'stop talking', expected: 'STOP' },
    { text: 'repeat that please', expected: 'REPEAT' },
    { text: 'what are the commands', expected: 'HELP' },
    { text: 'hello there', expected: 'CHAT' },
    { text: 'find my water bottle', expected: 'FIND_OBJECT', target: 'water bottle' },
    { text: 'quantum mechanics supercalifragilistic', expected: 'UNKNOWN' },
  ];

  for (const tc of englishCases) {
    const res = await request('POST', '/api/intent', { text: tc.text, lang: 'en-IN' });
    assert(res.status === 200, `"${tc.text}" -> 200`);
    assert(res.body.intent === tc.expected, `"${tc.text}" -> ${tc.expected} (got ${res.body.intent})`);
    if (tc.target) {
      assert(res.body.params?.target?.toLowerCase() === tc.target.toLowerCase(), `Target extracted: "${tc.target}" (got "${res.body.params?.target}")`);
    }
  }

  // 4. Multilingual intent classification (Kannada & Hindi)
  console.log('\n[4. Multilingual Intent Classification]');
  const multiCases = [
    { text: 'ಸುತ್ತಮುತ್ತ ಏನಿದೆ', lang: 'kn-IN', expected: 'DESCRIBE_SURROUNDINGS' },
    { text: 'shouchalaya ellide', lang: 'kn-IN', expected: 'FIND_WASHROOM' },
    { text: 'keys huduku', lang: 'kn-IN', expected: 'FIND_OBJECT', target: 'keys' },
    { text: 'nillu', lang: 'kn-IN', expected: 'STOP' },
    { text: 'aas paas kya hai', lang: 'hi-IN', expected: 'DESCRIBE_SURROUNDINGS' },
    { text: 'kya likha hai', lang: 'hi-IN', expected: 'READ_TEXT' },
    { text: 'bathroom kahan hai', lang: 'hi-IN', expected: 'FIND_WASHROOM' },
    { text: 'chasma dhundho', lang: 'hi-IN', expected: 'FIND_OBJECT', target: 'chasma' },
    { text: 'ruk jao', lang: 'hi-IN', expected: 'STOP' },
  ];

  for (const tc of multiCases) {
    const res = await request('POST', '/api/intent', { text: tc.text, lang: tc.lang });
    assert(res.status === 200, `[${tc.lang}] "${tc.text}" -> 200`);
    assert(res.body.intent === tc.expected, `[${tc.lang}] "${tc.text}" -> ${tc.expected} (got ${res.body.intent})`);
  }

  // 5. Vision endpoint validation & error handling
  console.log('\n[5. Vision Endpoint Validation]');
  const visionMissingImg = await request('POST', '/api/vision', { intent: 'DESCRIBE_SURROUNDINGS', lang: 'en-IN' });
  assert(visionMissingImg.status === 400, 'Missing imageBase64 returns 400');

  const visionInvalidIntent = await request('POST', '/api/vision', { imageBase64: 'abc', intent: 'FLY_TO_MARS', lang: 'en-IN' });
  assert(visionInvalidIntent.status === 400, 'Invalid intent returns 400');

  // Oversized image test (> 512KB)
  console.log('\n[6. Image Size Limit Enforcement]');
  // 512 KB * (4/3) base64 characters ≈ 700,000 characters
  const largeBase64 = 'A'.repeat(720 * 1024);
  const oversizedRes = await request('POST', '/api/vision', {
    imageBase64: largeBase64,
    intent: 'DESCRIBE_SURROUNDINGS',
    lang: 'en-IN',
  });
  assert(oversizedRes.status === 413, 'Image > 512KB returns 413 Payload Too Large');

  // 7. Vision service availability without API key
  console.log('\n[7. Vision Service Without API Key]');
  const normalImg = 'data:image/jpeg;base64,' + Buffer.from('fake-pixel').toString('base64');
  const visionNoKey = await request('POST', '/api/vision', {
    imageBase64: normalImg,
    intent: 'DESCRIBE_SURROUNDINGS',
    lang: 'en-IN',
  });
  // Without GEMINI_API_KEY, vision returns 503 AI service unavailable
  assert(visionNoKey.status === 503, 'Vision without API key returns 503 Service Unavailable');
  assert(visionNoKey.body.error.includes('GEMINI_API_KEY'), 'Error explicitly mentions GEMINI_API_KEY blocker');

  // 8. Malformed JSON handling
  console.log('\n[8. Malformed JSON Handling]');
  const malformedRes = await request('POST', '/api/intent', '{ invalid json... }', { 'Content-Type': 'application/json' });
  assert(malformedRes.status === 400, 'Malformed JSON returns 400');
  assert(typeof malformedRes.body.error === 'string', 'Error response is { error: string }');

  console.log(`\n--- TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

server = app.listen(TEST_PORT, async () => {
  try {
    await runTests();
  } catch (err) {
    console.error('Test run error:', err);
    process.exit(1);
  } finally {
    server.close(() => {
      process.exit(failed > 0 ? 1 : 0);
    });
  }
});
