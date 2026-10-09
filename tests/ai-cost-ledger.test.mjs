import assert from "node:assert/strict";
import test from "node:test";

const { calculateImageProviderCost } = await import("../lib/ai-cost-ledger.ts");

test("current image model usage produces exact immutable NET and GROSS micro-USD", () => {
  const result = calculateImageProviderCost("gpt-image-2.5-sunburst", "openai.images.edits", {
    input_tokens: 111,
    output_tokens: 22,
    total_tokens: 133,
    input_tokens_details: { text_tokens: 11, image_tokens: 100 },
  }, 2.2);
  assert.equal(result.netMicroUsd, 1515);
  assert.equal(result.grossMicroUsd, 3333);
  assert.equal(result.pricingSnapshot?.inputTextUsd, 5);
  assert.equal(result.pricingSnapshot?.inputImageUsd, 8);
  assert.equal(result.pricingSnapshot?.outputImageUsd, 30);
  assert.equal(result.pricingSnapshot?.cachedInputApplied, false);
});

test("unknown models and incomplete provider usage are never presented as exact cost", () => {
  assert.equal(calculateImageProviderCost("future-image-model", "openai.images.edits", {
    input_tokens: 10,
    output_tokens: 20,
    input_tokens_details: { text_tokens: 2, image_tokens: 8 },
  }, 2.2).netMicroUsd, null);
  assert.equal(calculateImageProviderCost("gpt-image-2.5-sunburst", "openai.images.edits", {
    input_tokens: 10,
    output_tokens: 20,
  }, 2.2).netMicroUsd, null);
});
