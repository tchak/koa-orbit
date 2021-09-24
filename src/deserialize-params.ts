import { SortParam, FilterParam, RecordSchema } from '@orbit/records';
import { JSONAPIResourceFieldSerializer } from '@orbit/jsonapi';

export function deserializeFilterParams(
  schema: RecordSchema,
  serializer: JSONAPIResourceFieldSerializer,
  type: string,
  filter: Record<string, string>
): FilterParam[] {
  const params: FilterParam[] = [];
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

export function deserializeSortParams(
  schema: RecordSchema,
  serializer: JSONAPIResourceFieldSerializer,
  type: string,
  sort: string
): SortParam[] {
  const params: SortParam[] = [];
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
