import { RecordSource, RecordQueryable, RecordUpdatable } from '@orbit/records';

export interface ServerSource
  extends RecordSource,
    RecordQueryable<unknown>,
    RecordUpdatable<unknown> {}
