import {
  Record as OrbitRecord,
  RecordSource,
  RecordQueryable,
  RecordUpdatable,
  RecordNotFoundException,
  SchemaError,
  RecordException,
} from '@orbit/records';
import { ClientError, ServerError } from '@orbit/data';
import {
  buildJSONAPISerializerFor,
  JSONAPISerializers,
  JSONAPIDocumentSerializer,
  JSONAPIResourceFieldSerializer,
} from '@orbit/jsonapi';
import {
  SerializerForFn,
  SerializerClassForFn,
  SerializerSettingsForFn,
  buildSerializerSettingsFor,
} from '@orbit/serializers';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import qs from 'qs';

import { queryBuilderParams } from './params';

export interface ServerSource
  extends RecordSource,
    RecordQueryable<unknown>,
    RecordUpdatable<unknown> {}

export interface ServerSettings {
  source: ServerSource;
  prefix?: string;
  readonly?: boolean;
  serializerFor?: SerializerForFn;
  serializerClassFor?: SerializerClassForFn;
  serializerSettingsFor?: SerializerSettingsForFn;
}

const CONTENT_TYPE = 'application/vnd.api+json; charset=utf-8';

async function serializeError(
  source: ServerSource,
  error: Error
): Promise<unknown> {
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

export function orbit(settings: ServerSettings): Router {
  const {
    source,
    prefix,
    readonly,
    serializerFor,
    serializerClassFor,
  } = settings;
  const name = source.name as string;
  const schema = source.schema;
  const _serializerFor = buildJSONAPISerializerFor({
    schema: settings.source.schema,
    serializerFor,
    serializerClassFor,
    serializerSettingsFor: buildSerializerSettingsFor({
      settingsByType: {
        [JSONAPISerializers.ResourceField]: {
          serializationOptions: { inflectors: ['dasherize'] },
        },
      },
    }),
  });
  const documentSerializer = _serializerFor(
    JSONAPISerializers.ResourceDocument
  ) as JSONAPIDocumentSerializer;
  const resourceTypeSerializer = _serializerFor(
    JSONAPISerializers.ResourceTypePath
  );
  const resourceFieldSerializer = _serializerFor(
    JSONAPISerializers.ResourceField
  ) as JSONAPIResourceFieldSerializer;

  const router = new Router({ prefix });

  router.use(bodyParser({ enableTypes: ['json'] }));
  router.use(async (ctx, next) => {
    try {
      ctx.state.query = qs.parse(ctx.querystring);
      await next();

      if (ctx.status === 200 || ctx.status === 201) {
        ctx.type = CONTENT_TYPE;
        ctx.body = documentSerializer.serialize(ctx.body);
      }
    } catch (error) {
      ctx.type = CONTENT_TYPE;
      Object.assign(ctx, serializeError(source, error));
    }
  });

  for (const type of Object.keys(schema.models)) {
    const resourceType = resourceTypeSerializer?.serialize(type);
    const resourcePath = `/${resourceType}`;
    const resourcePathWithId = `/${resourceType}/:id`;

    router.get(`findRecords(${type})`, resourcePath, async (ctx) => {
      const {
        headers,
        state: {
          query: { filter, sort, include },
        },
      } = ctx;

      const records: OrbitRecord[] = await source.query(
        (q) =>
          queryBuilderParams(
            schema,
            resourceFieldSerializer,
            q.findRecords(type),
            type,
            filter,
            sort
          ),
        {
          from: 'jsonapi',
          [name]: {
            headers,
            include,
          },
        }
      );

      ctx.status = 200;
      ctx.body = { data: records };
    });

    router.get(`findRecord(${type})`, resourcePathWithId, async (ctx) => {
      const {
        headers,
        params: { id },
        state: {
          query: { include },
        },
      } = ctx;

      const record: OrbitRecord = await source.query(
        (q) => q.findRecord({ type, id }),
        {
          raiseNotFoundExceptions: true,
          from: 'jsonapi',
          [name]: {
            headers,
            include,
          },
        }
      );

      ctx.status = 200;
      ctx.body = { data: record };
    });

    if (!readonly) {
      router.post(`addRecord(${type})`, resourcePath, async (ctx) => {
        const {
          headers,
          state: {
            query: { include },
          },
        } = ctx;

        ctx.request.body.data.id = '0';
        const { data } = documentSerializer.deserialize(ctx.request.body);
        delete (data as any).id;

        const record: OrbitRecord = await source.update(
          (t) => t.addRecord(data as OrbitRecord),
          {
            from: 'jsonapi',
            [name]: {
              headers,
              include,
            },
          }
        );

        const location = router.url(`findRecord(${type})`, { id: record.id });

        ctx.status = 201;
        ctx.set('location', location);
        ctx.body = { data: record };
      });

      router.patch(`updateRecord(${type})`, resourcePathWithId, async (ctx) => {
        const { data } = documentSerializer.deserialize(ctx.request.body);

        await source.query((q) => q.findRecord(data as OrbitRecord), {
          raiseNotFoundExceptions: true,
          from: 'jsonapi',
          [name]: {
            headers: ctx.headers,
          },
        });
        await source.update((t) => t.updateRecord(data as OrbitRecord), {
          from: 'jsonapi',
          [name]: {
            headers: ctx.headers,
          },
        });

        ctx.status = 204;
      });

      router.delete(
        `removeRecord(${type})`,
        resourcePathWithId,
        async (ctx) => {
          const {
            headers,
            params: { id },
          } = ctx;

          await source.update((t) => t.removeRecord({ type, id }), {
            from: 'jsonapi',
            [name]: { headers },
          });

          ctx.status = 204;
        }
      );
    }

    schema.eachRelationship(
      type,
      (propertyName, { kind, type: relationshipType }) => {
        const relationshipName = resourceFieldSerializer.serialize(
          propertyName,
          { type: relationshipType as string }
        );
        const relationshipPath = `${resourcePathWithId}/${relationshipName}`;

        if (kind === 'hasMany') {
          router.get(
            `findRelatedRecords(${type}, ${relationshipType})`,
            relationshipPath,
            async (ctx) => {
              const {
                headers,
                params: { id },
                state: {
                  query: { filter, sort, include },
                },
              } = ctx;

              const records: OrbitRecord[] = await source.query(
                (q) =>
                  queryBuilderParams(
                    schema,
                    resourceFieldSerializer,
                    q.findRelatedRecords({ type, id }, propertyName),
                    relationshipType as string,
                    filter,
                    sort
                  ),
                {
                  from: 'jsonapi',
                  [name]: {
                    headers,
                    include,
                  },
                }
              );

              ctx.status = 200;
              ctx.body = { data: records };
            }
          );

          if (!readonly) {
            router.patch(
              `replaceRelatedRecords(${type}, ${relationshipType})`,
              relationshipPath,
              async (ctx) => {
                const {
                  headers,
                  params: { id },
                } = ctx;
                const { data } = documentSerializer.deserialize(
                  ctx.request.body
                );

                await source.update(
                  (q) =>
                    q.replaceRelatedRecords(
                      { type, id },
                      propertyName,
                      data as OrbitRecord[]
                    ),
                  {
                    from: 'jsonapi',
                    [name]: { headers },
                  }
                );

                ctx.status = 204;
              }
            );

            router.post(
              `addToRelatedRecords(${type}, ${relationshipType})`,
              relationshipPath,
              async (ctx) => {
                const {
                  headers,
                  params: { id },
                } = ctx;
                const { data } = documentSerializer.deserialize(
                  ctx.request.body
                );

                await source.update(
                  (q) =>
                    (data as OrbitRecord[]).map((identity) =>
                      q.addToRelatedRecords(
                        { type, id },
                        propertyName,
                        identity
                      )
                    ),
                  {
                    from: 'jsonapi',
                    [name]: { headers },
                  }
                );

                ctx.status = 204;
              }
            );

            router.delete(
              `removeFromRelatedRecords(${type}, ${relationshipType})`,
              relationshipPath,
              async (ctx) => {
                const {
                  headers,
                  params: { id },
                } = ctx;
                const { data } = documentSerializer.deserialize(
                  ctx.request.body
                );

                await source.update(
                  (q) =>
                    (data as OrbitRecord[]).map((identity) =>
                      q.removeFromRelatedRecords(
                        { type, id },
                        propertyName,
                        identity
                      )
                    ),
                  {
                    from: 'jsonapi',
                    [name]: { headers },
                  }
                );

                ctx.status = 204;
              }
            );
          }
        } else {
          router.get(
            `findRelatedRecord(${type}, ${relationshipType})`,
            relationshipPath,
            async (ctx) => {
              const {
                headers,
                params: { id },
                state: {
                  query: { include },
                },
              } = ctx;
              const record: OrbitRecord = await source.query(
                (q) => q.findRelatedRecord({ type, id }, propertyName),
                {
                  from: 'jsonapi',
                  [name]: {
                    headers,
                    include,
                  },
                }
              );

              ctx.status = 200;
              ctx.body = { data: record };
            }
          );

          if (!readonly) {
            router.patch(
              `replaceRelatedRecord(${type}, ${relationshipType})`,
              relationshipPath,
              async (ctx) => {
                const {
                  headers,
                  params: { id },
                } = ctx;
                const { data } = documentSerializer.deserialize(
                  ctx.request.body
                );

                await source.update(
                  (q) =>
                    q.replaceRelatedRecord(
                      { type, id },
                      propertyName,
                      data as OrbitRecord
                    ),
                  {
                    from: 'jsonapi',
                    [name]: { headers },
                  }
                );

                ctx.status = 204;
              }
            );
          }
        }
      }
    );
  }

  return router;
}
