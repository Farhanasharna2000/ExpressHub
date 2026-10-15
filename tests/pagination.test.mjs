import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const {
  calculatePagination,
  buildPaginationMeta,
  paginateTransaction,
} = await import("../lib/db/pagination.ts");

test("calculatePagination computes correct skip and take offsets", () => {
  assert.deepEqual(calculatePagination({ page: 1, limit: 10 }), {
    skip: 0,
    take: 10,
  });
  assert.deepEqual(calculatePagination({ page: 3, limit: 20 }), {
    skip: 40,
    take: 20,
  });
  assert.deepEqual(calculatePagination({ page: 5, limit: 50 }), {
    skip: 200,
    take: 50,
  });
});

test("buildPaginationMeta constructs correct metadata and totalPages", () => {
  assert.deepEqual(buildPaginationMeta(0, { page: 1, limit: 20 }), {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  assert.deepEqual(buildPaginationMeta(1, { page: 1, limit: 20 }), {
    page: 1,
    limit: 20,
    total: 1,
    totalPages: 1,
  });

  assert.deepEqual(buildPaginationMeta(20, { page: 1, limit: 20 }), {
    page: 1,
    limit: 20,
    total: 20,
    totalPages: 1,
  });

  assert.deepEqual(buildPaginationMeta(21, { page: 2, limit: 20 }), {
    page: 2,
    limit: 20,
    total: 21,
    totalPages: 2,
  });

  assert.deepEqual(buildPaginationMeta(95, { page: 3, limit: 20 }), {
    page: 3,
    limit: 20,
    total: 95,
    totalPages: 5,
  });
});

test("paginateTransaction executes transaction with RepeatableRead and returns paginated result", async () => {
  let transactionArgs = null;
  let transactionOptions = null;

  const mockItems = [{ id: "1" }, { id: "2" }];
  const mockTotal = 42;

  const mockClient = {
    $transaction: async (queries, options) => {
      transactionArgs = queries;
      transactionOptions = options;
      return [mockItems, mockTotal];
    },
  };

  const fakeFindMany = { name: "findManyPromise" };
  const fakeCount = { name: "countPromise" };

  const result = await paginateTransaction(
    (bounds) => {
      assert.deepEqual(bounds, { skip: 20, take: 10 });
      return [fakeFindMany, fakeCount];
    },
    { page: 3, limit: 10 },
    { client: mockClient },
  );

  assert.deepEqual(transactionArgs, [fakeFindMany, fakeCount]);
  assert.equal(transactionOptions?.isolationLevel, "RepeatableRead");
  assert.deepEqual(result, {
    items: mockItems,
    total: mockTotal,
    pagination: {
      page: 3,
      limit: 10,
      total: 42,
      totalPages: 5,
    },
  });
});

test("paginateTransaction supports passing pre-constructed tuple of promises", async () => {
  const mockItems = ["itemA", "itemB"];
  const mockTotal = 2;

  const mockClient = {
    $transaction: async () => [mockItems, mockTotal],
  };

  const fakeFindMany = { name: "findMany" };
  const fakeCount = { name: "count" };

  const result = await paginateTransaction(
    [fakeFindMany, fakeCount],
    { page: 1, limit: 10 },
    { client: mockClient },
  );

  assert.deepEqual(result, {
    items: mockItems,
    total: 2,
    pagination: {
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
    },
  });
});
