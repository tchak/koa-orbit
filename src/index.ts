import {
  Record as InitializedRecord,
  RecordQuery,
  RecordSource,
  RecordQueryable,
  RecordUpdatable,
} from '@orbit/records';
import { buildQuery } from '@orbit/data';
import {
  SerializerForFn,
  SerializerClassForFn,
  SerializerSettingsForFn,
} from '@orbit/serializers';
import { Request } from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import qs from 'qs';

import {
  deserializeFilterQBParams,
  deserializeSortQBParams,
} from './deserialize-params';
import { serializeError } from './serialize-error';
import { Serializer } from './serializer';

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
  filterQuery?: (query: RecordQuery, req: Request) => Promise<void>;
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
  const filterQuery = settings.filterQuery ?? (async () => true);

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
      await source.requestQueue.clear().catch(() => true);
      Object.assign(ctx, serializeError(error));
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

      const term = source.queryBuilder.findRecords(type);
      if (filter) {
        term.filter(
          ...deserializeFilterQBParams(
            source.schema,
            serializer.resourceFieldParamSerializer(),
            type,
            filter
          )
        );
      }
      if (sort) {
        term.sort(
          ...deserializeSortQBParams(
            schema,
            serializer.resourceFieldParamSerializer(),
            type,
            sort
          )
        );
      }
      const query = buildQuery(
        term.toQueryExpression(),
        {
          from: 'jsonapi',
          [name]: { headers, include },
        },
        undefined,
        source.queryBuilder
      );

      await filterQuery(query, ctx.request);
      const records = await source.query<InitializedRecord[]>(query);

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
      const term = source.queryBuilder.findRecord(recordIdentity);
      const query = buildQuery(
        term,
        {
          raiseNotFoundExceptions: true,
          from: 'jsonapi',
          [name]: { headers, include },
        },
        undefined,
        source.queryBuilder
      );

      await filterQuery(query, ctx.request);
      const record = await source.query<InitializedRecord>(query);

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

        await source.update(
          (t) => t.updateRecord({ ...record, ...recordIdentity }),
          {
            raiseNotFoundExceptions: true,
            from: 'jsonapi',
            [name]: { headers },
          }
        );

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

          await source.update((t) => t.removeRecord(recordIdentity), {
            raiseNotFoundExceptions: true,
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
              const term = source.queryBuilder.findRelatedRecords(
                recordIdentity,
                propertyName
              );
              if (filter) {
                term.filter(
                  ...deserializeFilterQBParams(
                    source.schema,
                    serializer.resourceFieldParamSerializer(),
                    relationshipType as string,
                    filter
                  )
                );
              }
              if (sort) {
                term.sort(
                  ...deserializeSortQBParams(
                    schema,
                    serializer.resourceFieldParamSerializer(),
                    relationshipType as string,
                    sort
                  )
                );
              }
              const query = buildQuery(
                term,
                {
                  from: 'jsonapi',
                  [name]: { headers, include },
                },
                undefined,
                source.queryBuilder
              );

              await filterQuery(query, ctx.request);
              const records = await source.query<InitializedRecord[]>(query);

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
              const term = source.queryBuilder.findRelatedRecord(
                recordIdentity,
                propertyName
              );
              const query = buildQuery(
                term,
                { from: 'jsonapi', [name]: { headers, include } },
                undefined,
                source.queryBuilder
              );

              await filterQuery(query, ctx.request);
              const record = await source.query<InitializedRecord>(query);

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
