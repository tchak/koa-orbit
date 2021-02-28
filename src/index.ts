import { Record as InitializedRecord } from '@orbit/records';
import {
  SerializerForFn,
  SerializerClassForFn,
  SerializerSettingsForFn,
} from '@orbit/serializers';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import qs from 'qs';

import { ServerSource } from './server-source';
import { queryBuilderParams } from './params';
import { serializeError } from './serialize-error';
import { Serializer } from './serializer';

export interface ServerSettings {
  source: ServerSource;
  prefix?: string;
  readonly?: boolean;
  serializerFor?: SerializerForFn;
  serializerClassFor?: SerializerClassForFn;
  serializerSettingsFor?: SerializerSettingsForFn;
}

const CONTENT_TYPE = 'application/vnd.api+json; charset=utf-8';

export default function createJSONAPIRouter(settings: ServerSettings): Router {
  const {
    source,
    prefix,
    readonly,
    serializerFor,
    serializerClassFor,
    serializerSettingsFor,
  } = settings;
  const name = source.name as string;
  const schema = source.schema;

  const serializer = new Serializer({
    schema,
    serializerFor,
    serializerClassFor,
    serializerSettingsFor,
  });
  const router = new Router({ prefix });

  router.use(bodyParser({ enableTypes: ['json'] }));
  router.use(async (ctx, next) => {
    try {
      ctx.state.query = qs.parse(ctx.querystring);
      await next();

      if (ctx.status === 200 || ctx.status === 201) {
        ctx.body = serializer.serializeDocument(ctx.body);
        ctx.type = CONTENT_TYPE;
      }
    } catch (error) {
      Object.assign(ctx, await serializeError(source, error));
      ctx.type = CONTENT_TYPE;
    }
  });

  for (const type of Object.keys(schema.models)) {
    const resourceType = serializer.serializeResourceTypePath(type);
    const resourcePath = `/${resourceType}`;
    const resourcePathWithId = `/${resourceType}/:id`;

    router.get(`findRecords(${type})`, resourcePath, async (ctx) => {
      const {
        headers,
        state: {
          query: { filter, sort, include },
        },
      } = ctx;

      const records = await source.query<InitializedRecord[]>(
        (q) =>
          queryBuilderParams(
            schema,
            serializer.resourceFieldParamSerializer(),
            q.findRecords(type),
            type,
            filter,
            sort
          ),
        {
          from: 'jsonapi',
          [name]: { headers, include },
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
      const recordIdentity = { type, id };

      const record = await source.query<InitializedRecord>(
        (q) => q.findRecord(recordIdentity),
        {
          raiseNotFoundExceptions: true,
          from: 'jsonapi',
          [name]: { headers, include },
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

        const uninitializedRecord = serializer.deserializeUninitializedDocument(
          ctx.request.body
        );

        const record = await source.update<InitializedRecord>(
          (t) => t.addRecord(uninitializedRecord),
          {
            from: 'jsonapi',
            [name]: { headers, include },
          }
        );

        const location = router.url(`findRecord(${type})`, { id: record.id });

        ctx.status = 201;
        ctx.set('location', location);
        ctx.body = { data: record };
      });

      router.patch(`updateRecord(${type})`, resourcePathWithId, async (ctx) => {
        const {
          headers,
          params: { id },
        } = ctx;
        const recordIdentity = { type, id };
        const record = serializer.deserializeDocument(ctx.request.body);

        await source.query((q) => q.findRecord(recordIdentity), {
          raiseNotFoundExceptions: true,
          from: 'jsonapi',
          [name]: { headers },
        });
        await source.update((t) => t.updateRecord(record), {
          from: 'jsonapi',
          [name]: { headers },
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
          const recordIdentity = { type, id };

          await source.query((q) => q.findRecord(recordIdentity), {
            raiseNotFoundExceptions: true,
            from: 'jsonapi',
            [name]: { headers },
          });
          await source.update((t) => t.removeRecord(recordIdentity), {
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
        const relationshipName = serializer.serializeResourceFieldPath(
          propertyName,
          relationshipType
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
              const recordIdentity = { type, id };

              const records = await source.query<InitializedRecord[]>(
                (q) =>
                  queryBuilderParams(
                    schema,
                    serializer.resourceFieldParamSerializer(),
                    q.findRelatedRecords(recordIdentity, propertyName),
                    relationshipType as string,
                    filter,
                    sort
                  ),
                {
                  from: 'jsonapi',
                  [name]: { headers, include },
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
                const recordIdentity = { type, id };
                const records = serializer.deserializeDocuments(
                  ctx.request.body
                );

                await source.update(
                  (q) =>
                    q.replaceRelatedRecords(
                      recordIdentity,
                      propertyName,
                      records
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
                const recordIdentity = { type, id };
                const records = serializer.deserializeDocuments(
                  ctx.request.body
                );

                await source.update(
                  (q) =>
                    records.map((record) =>
                      q.addToRelatedRecords(
                        recordIdentity,
                        propertyName,
                        record
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
                const recordIdentity = { type, id };
                const records = serializer.deserializeDocuments(
                  ctx.request.body
                );

                await source.update(
                  (q) =>
                    records.map((record) =>
                      q.removeFromRelatedRecords(
                        recordIdentity,
                        propertyName,
                        record
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
              const recordIdentity = { type, id };

              const record = await source.query<InitializedRecord>(
                (q) => q.findRelatedRecord(recordIdentity, propertyName),
                {
                  from: 'jsonapi',
                  [name]: { headers, include },
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
                const recordIdentity = { type, id };
                const record = serializer.deserializeDocument(ctx.request.body);

                await source.update(
                  (q) =>
                    q.replaceRelatedRecord(
                      recordIdentity,
                      propertyName,
                      record
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
