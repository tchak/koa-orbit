import {
  Record as OrbitRecord,
  Source as OrbitSource,
  Queryable,
  Updatable,
  RecordNotFoundException,
  ClientError,
  ServerError,
  SchemaError,
  RecordException,
} from '@orbit/data';
import { JSONAPISerializer, JSONAPISerializerSettings } from '@orbit/jsonapi';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import qs from 'qs';

import { queryBuilderParams } from './params';

export interface Source extends OrbitSource, Queryable, Updatable {}

export interface ServerSettings {
  source: Source;
  prefix?: string;
  readonly?: boolean;
  SerializerClass?: new (
    settings: JSONAPISerializerSettings
  ) => JSONAPISerializer;
}

const CONTENT_TYPE = 'application/vnd.api+json; charset=utf-8';

async function serializeError(source: Source, error: Error): Promise<unknown> {
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

export function orbit(settings: ServerSettings): Router {
  const {
    source,
    prefix,
    readonly,
    SerializerClass = JSONAPISerializer,
  } = settings;
  const schema = source.schema;
  const serializer = new SerializerClass({
    schema: settings.source.schema,
  });
  const router = new Router({ prefix });

  router.use(bodyParser({ enableTypes: ['json'] }));
  router.use(async (ctx, next) => {
    try {
      ctx.state.query = qs.parse(ctx.querystring);
      await next();

      if (ctx.status === 200 || ctx.status === 201) {
        ctx.type = CONTENT_TYPE;
        ctx.body = serializer.serialize(ctx.body);
      }
    } catch (error) {
      ctx.type = CONTENT_TYPE;
      Object.assign(ctx, serializeError(source, error));
    }
  });

  for (const type of Object.keys(schema.models)) {
    const resourceType = serializer.resourceType(type);
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
            serializer,
            q.findRecords(type),
            type,
            filter,
            sort
          ),
        {
          from: 'jsonapi',
          [source.name]: {
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
          from: 'jsonapi',
          [source.name]: {
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

        const { data } = serializer.deserialize(ctx.request.body);

        const record: OrbitRecord = await source.update(
          (t) => t.addRecord(data as OrbitRecord),
          {
            from: 'jsonapi',
            [source.name]: {
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
        const { data } = serializer.deserialize(ctx.request.body);

        await source.update((t) => t.updateRecord(data as OrbitRecord), {
          from: 'jsonapi',
          [source.name]: {
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
            [source.name]: { headers },
          });

          ctx.status = 204;
        }
      );
    }

    schema.eachRelationship(
      type,
      (propertyName, { type: kind, model: relationshipType }) => {
        const relationshipName = serializer.resourceRelationship(
          relationshipType as string,
          propertyName
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
                    serializer,
                    q.findRelatedRecords({ type, id }, propertyName),
                    relationshipType as string,
                    filter,
                    sort
                  ),
                {
                  from: 'jsonapi',
                  [source.name]: {
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
                const { data } = serializer.deserialize(ctx.request.body);

                await source.update(
                  (q) =>
                    q.replaceRelatedRecords(
                      { type, id },
                      propertyName,
                      data as OrbitRecord[]
                    ),
                  {
                    from: 'jsonapi',
                    [source.name]: { headers },
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
                const { data } = serializer.deserialize(ctx.request.body);

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
                    [source.name]: { headers },
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
                const { data } = serializer.deserialize(ctx.request.body);

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
                    [source.name]: { headers },
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
                  [source.name]: {
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
                const { data } = serializer.deserialize(ctx.request.body);

                await source.update(
                  (q) =>
                    q.replaceRelatedRecord(
                      { type, id },
                      propertyName,
                      data as OrbitRecord
                    ),
                  {
                    from: 'jsonapi',
                    [source.name]: { headers },
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
