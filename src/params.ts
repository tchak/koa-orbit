import {
  SortQBParam,
  FilterQBParam,
  FindRecordsTerm,
  FindRelatedRecordsTerm,
  RecordSchema,
} from '@orbit/records';
import { JSONAPIResourceFieldSerializer } from '@orbit/jsonapi';

export function queryBuilderParams(
  schema: RecordSchema,
  serializer: JSONAPIResourceFieldSerializer,
  term: FindRecordsTerm | FindRelatedRecordsTerm,
  type: string,
  filter?: Record<string, string>,
  sort?: string
): FindRecordsTerm | FindRelatedRecordsTerm {
  if (filter) {
    term = term.filter(...filterQBParams(schema, serializer, type, filter));
  }
  if (sort) {
    term = term.sort(...sortQBParams(schema, serializer, type, sort));
  }
  return term;
}

function filterQBParams(
  schema: RecordSchema,
  serializer: JSONAPIResourceFieldSerializer,
  type: string,
  filter: Record<string, string>
): FilterQBParam[] {
  const params: FilterQBParam[] = [];
  for (const property in filter) {
    const attribute = serializer.deserialize(property, { type }) as string;
    if (schema.hasAttribute(type, attribute)) {
      params.push({
        op: 'equal',
        attribute,
        value: filter[property],
      });
    }
  }
  return params;
}

function sortQBParams(
  schema: RecordSchema,
  serializer: JSONAPIResourceFieldSerializer,
  type: string,
  sort: string
): SortQBParam[] {
  const params: SortQBParam[] = [];
  for (const property of sort.split(',')) {
    const desc = property.startsWith('-');
    const attribute = serializer.deserialize(
      desc ? property.substring(1) : property,
      { type }
    ) as string;
    if (schema.hasAttribute(type, attribute)) {
      params.push({
        attribute,
        order: desc ? 'descending' : 'ascending',
      });
    }
  }
  return params;
}
