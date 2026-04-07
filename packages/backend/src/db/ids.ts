import { monotonicFactory } from "ulid";

const createUlid = monotonicFactory();

export function createId(): string {
  return createUlid();
}

export function now(): Date {
  return new Date();
}
