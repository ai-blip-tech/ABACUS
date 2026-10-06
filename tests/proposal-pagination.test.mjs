import test from "node:test";
import assert from "node:assert/strict";
import { paginateProposalSpecification } from "../lib/commercial-proposal.ts";

test("short specifications stay on one final page", () => {
  assert.deepEqual(paginateProposalSpecification([1, 2, 3, 4, 5]), [[1, 2, 3, 4, 5]]);
});

test("long specifications reserve a non-overlapping final page", () => {
  const products = Array.from({ length: 24 }, (_, index) => index + 1);
  const pages = paginateProposalSpecification(products);
  assert.deepEqual(pages.flat(), products);
  assert.ok(pages.slice(0, -1).every((page) => page.length <= 9));
  assert.ok(pages.at(-1).length <= 5);
});
