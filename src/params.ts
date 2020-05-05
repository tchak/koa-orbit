import {
  SortQBParam,
  FilterQBParam,
  FindRecordsTerm,
  FindRelatedRecordsTerm,
} from '@orbit/data';
import { JSONAPISerializer } from '@orbit/jsonapi';

export function queryBuilderParams(
  serializer: JSONAPISerializer,
  term: FindRecordsTerm | FindRelatedRecordsTerm,
  type: string,
  filter?: Record<string, string>,
  sort?: string
): FindRecordsTerm | FindRelatedRecordsTerm {
  if (filter) {
    term = term.filter(...filterQBParams(serializer, type, filter));
  }
  if (sort) {
    term = term.sort(...sortQBParams(serializer, type, sort));
  }
  return term;
}

function filterQBParams(
  serializer: JSONAPISerializer,
  type: string,
  filter: Record<string, string>
): FilterQBParam[] {
  const params: FilterQBParam[] = [];
  for (const property in filter) {
    const attribute = serializer.recordAttribute(type, property);
    if (serializer.schema.hasAttribute(type, attribute)) {
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
  serializer: JSONAPISerializer,
  type: string,
  sort: string
): SortQBParam[] {
  const params: SortQBParam[] = [];
  for (const property of sort.split(',')) {
    const desc = property.startsWith('-');
    const attribute = serializer.recordAttribute(
      type,
      desc ? property.substring(1) : property
    );
    if (serializer.schema.hasAttribute(type, attribute)) {
      params.push({
        attribute,
        order: desc ? 'descending' : 'ascending',
      });
    }
  }
  return params;
}
