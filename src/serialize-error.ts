import {
  RecordNotFoundException,
  SchemaError,
  RecordException,
} from '@orbit/records';
import { ClientError, ServerError } from '@orbit/data';
import { uuid } from '@orbit/utils';

export async function serializeError(
  error: Error
): Promise<{ status: number; body: unknown }> {
  const id = uuid();
  const title = error.message;
  let detail = '';
  let code = 500;

  if (error instanceof RecordNotFoundException) {
    detail = error.description;
    code = 404;
  } else if (error instanceof ClientError || error instanceof ServerError) {
    detail = error.description;
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
