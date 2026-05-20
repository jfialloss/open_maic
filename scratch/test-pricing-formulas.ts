import { calculateCost } from '../lib/server/token-logger';

function testFormula(modelString: string, promptTokens: number, completionTokens: number, expectedCost: number, tolerance = 0.000001) {
  const actualCost = calculateCost(modelString, promptTokens, completionTokens);
  const diff = Math.abs(actualCost - expectedCost);
  const passed = diff <= tolerance;
  
  console.log(`Model: "${modelString}" | Prompt: ${promptTokens}, Completion: ${completionTokens}`);
  console.log(`  Expected Cost: $${expectedCost.toFixed(6)}`);
  console.log(`  Actual Cost:   $${actualCost.toFixed(6)}`);
  console.log(`  Result:        ${passed ? '✅ PASS' : '❌ FAIL'}`);
  if (!passed) {
    console.error(`  Difference: ${diff}`);
  }
  console.log('--------------------------------------------------');
  return passed;
}

function runTests() {
  console.log('==================================================');
  console.log('RUNNING AI COSTING & PRICING FORMULA TESTS');
  console.log('==================================================\n');
  
  let allPassed = true;

  // 1. LLM Models
  // gemini-2.5-flash: input: $0.075 / 1M, output: $0.30 / 1M
  // 1M prompt + 1M completion = $0.075 + $0.30 = $0.375
  allPassed = testFormula('gemini-2.5-flash', 1_000_000, 1_000_000, 0.375) && allPassed;
  allPassed = testFormula('Gemini 2.5 Flash', 500_000, 200_000, (500_000/1_000_000)*0.075 + (200_000/1_000_000)*0.30) && allPassed;

  // gemini-1.5-pro: input: $1.25 / 1M, output: $5.00 / 1M
  allPassed = testFormula('gemini-1.5-pro', 1_000_000, 1_000_000, 1.25 + 5.00) && allPassed;

  // 2. TTS Models (cost per 1M characters, completionTokens is 0)
  // google-tts: input: $16.00 / 1M chars
  // Test 1000 characters: cost should be (1000 / 1M) * 16 = $0.016
  allPassed = testFormula('google-tts', 1000, 0, (1000 / 1_000_000) * 16.00) && allPassed;
  
  // azure-tts: input: $16.00 / 1M chars
  allPassed = testFormula('azure-tts', 5000, 0, (5000 / 1_000_000) * 16.00) && allPassed;

  // elevenlabs: input: $300.00 / 1M chars
  allPassed = testFormula('elevenlabs', 1000, 0, (1000 / 1_000_000) * 300.00) && allPassed;

  // 3. Image Models (flat-rate per image)
  // nano-banana: input: $0.03, output: $0.03 (flat $0.03 per image)
  // 1 image gets logged with promptTokens: 1,000,000 to trigger the fixed cost.
  // 1M / 1M * 0.03 = $0.03
  allPassed = testFormula('nano-banana', 1_000_000, 0, 0.03) && allPassed;
  
  // imagen-3: input: $0.03
  allPassed = testFormula('imagen-3', 1_000_000, 0, 0.03) && allPassed;

  if (allPassed) {
    console.log('🎉 ALL PRICING FORMULA TESTS PASSED SUCCESSFULLY! 🎉');
  } else {
    console.error('❌ SOME PRICING FORMULA TESTS FAILED!');
    process.exit(1);
  }
}

runTests();
