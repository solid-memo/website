import type { ShapeName, VersionedRecord } from "@solid-memo/vocab/types.generated";

/** The record of one kind at one version. */
export type RecordAt<S extends ShapeName, V extends number> = Extract<
  VersionedRecord[S],
  { version: V }
>["data"];

/**
 * What a step may know besides the record: the IRI of the subject being
 * migrated, for a step that names new resources beside it.
 */
export interface MigrationContext {
  readonly subject: string;
}

/**
 * How a record of one shape version becomes a record of the next: pure,
 * total over every valid `From` record, never mutating its input. One
 * module per step lives beside this one; the chain of steps from 1 to
 * the latest version of every kind is what `migrate` walks.
 */
export interface MigrationStep<S extends ShapeName, From extends number, To extends number> {
  readonly shape: S;
  readonly from: From;
  readonly to: To;
  up(data: RecordAt<S, From>, context: MigrationContext): RecordAt<S, To>;
}

/** A step with its record types erased, as the registry holds it. */
export interface AnyMigrationStep {
  readonly shape: ShapeName;
  readonly from: number;
  readonly to: number;
  up(data: unknown, context: MigrationContext): unknown;
}
