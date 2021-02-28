import {
  RecordNotFoundException,
  SchemaError,
  RecordException,
} from '@orbit/records';
import { ClientError, ServerError } from '@orbit/data';

import { ServerSource } from './server-source';

export async function serializeError(
  source: ServerSource,
  error: Error
): Promise<{ status: number; body: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  await source.requestQueue.clear().catch(() => {});

  const id = source.schema.generateId();
  const title = error.message;
  let detail = '';
  let code = 500;

  if (error instanceof RecordNotFoundException) {
    detail = error.description;
    code = 404;
  } else if (error instanceof ClientError || error instanceof ServerError) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    detail = (error as any).description;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code = (error as any).response.status;
  } else if (error instanceof SchemaError || error instanceof RecordException) {
    detail = error.description;
    code = 400;
  }

  return {
    status: code,
    body: { errors: [{ id, title, detail, code }] },
  };
}
