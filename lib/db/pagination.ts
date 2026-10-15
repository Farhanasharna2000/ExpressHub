import "server-only";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { PaginationMeta } from "@/types/api";

export type { PaginationMeta };

export interface PaginationInput {
  page: number;
  limit: number;
}

export interface PaginationBounds {
  skip: number;
  take: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  pagination: PaginationMeta;
}

/**
 * Calculates Prisma `skip` and `take` offsets from page and limit.
 */
export function calculatePagination(input: PaginationInput): PaginationBounds {
  return {
    skip: (input.page - 1) * input.limit,
    take: input.limit,
  };
}

/**
 * Builds standard pagination metadata from record count and pagination input.
 */
export function buildPaginationMeta(
  total: number,
  input: PaginationInput,
): PaginationMeta {
  const safeLimit = input.limit > 0 ? input.limit : 1;
  return {
    page: input.page,
    limit: input.limit,
    total,
    totalPages: Math.ceil(total / safeLimit),
  };
}

export interface PaginateTransactionOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  client?: {
    $transaction: <P extends Prisma.PrismaPromise<unknown>[]>(
      arg: [...P],
      options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
    ) => Promise<unknown>;
  };
}

/**
 * Executes findMany and count queries in a parallel transaction with RepeatableRead
 * isolation level, returning the fetched items alongside calculated pagination metadata.
 */
export async function paginateTransaction<T>(
  queries:
    | [Prisma.PrismaPromise<T[]>, Prisma.PrismaPromise<number>]
    | ((bounds: PaginationBounds) => [
        Prisma.PrismaPromise<T[]>,
        Prisma.PrismaPromise<number>,
      ]),
  input: PaginationInput,
  options?: PaginateTransactionOptions,
): Promise<PaginatedResult<T>> {
  const bounds = calculatePagination(input);
  const [findManyPromise, countPromise] =
    typeof queries === "function" ? queries(bounds) : queries;

  const dbClient = options?.client ?? prisma;
  const [items, total] = (await dbClient.$transaction(
    [findManyPromise, countPromise],
    {
      isolationLevel:
        options?.isolationLevel ??
        Prisma.TransactionIsolationLevel.RepeatableRead,
    },
  )) as [T[], number];

  return {
    items,
    total,
    pagination: buildPaginationMeta(total, input),
  };
}
