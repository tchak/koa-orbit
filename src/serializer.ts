import {
  Record as InitializedRecord,
  RecordSchema,
  UninitializedRecord,
} from '@orbit/records';
import {
  buildJSONAPISerializerFor,
  JSONAPISerializers,
  JSONAPIDocumentSerializer,
  JSONAPIResourceFieldSerializer,
  RecordDocument,
  ResourceDocument,
} from '@orbit/jsonapi';
import {
  Serializer as OrbitSerializer,
  SerializerForFn,
  SerializerClassForFn,
  SerializerSettingsForFn,
} from '@orbit/serializers';

export interface SerializerSettings {
  schema: RecordSchema;
  serializerFor?: SerializerForFn;
  serializerClassFor?: SerializerClassForFn;
  serializerSettingsFor?: SerializerSettingsForFn;
}

export class Serializer {
  #serializerFor: SerializerForFn;

  constructor(settings: SerializerSettings) {
    this.#serializerFor = buildJSONAPISerializerFor(settings);
  }

  serializeDocument(document: RecordDocument): ResourceDocument {
    const serializer = this.#serializerFor(
      JSONAPISerializers.ResourceDocument
    ) as JSONAPIDocumentSerializer;
    return serializer.serialize(document);
  }

  deserializeDocument(document: ResourceDocument): InitializedRecord {
    const serializer = this.#serializerFor(
      JSONAPISerializers.ResourceDocument
    ) as JSONAPIDocumentSerializer;
    return serializer.deserialize(document).data as InitializedRecord;
  }

  deserializeDocuments(document: ResourceDocument): InitializedRecord[] {
    const serializer = this.#serializerFor(
      JSONAPISerializers.ResourceDocument
    ) as JSONAPIDocumentSerializer;
    return serializer.deserialize(document).data as InitializedRecord[];
  }

  deserializeUninitializedDocument(
    document: ResourceDocument
  ): UninitializedRecord {
    if (document.data && !Array.isArray(document.data) && !document.data?.id) {
      document.data.id = 'yolo';
    }
    const serializer = this.#serializerFor(
      JSONAPISerializers.ResourceDocument
    ) as JSONAPIDocumentSerializer;
    const record = serializer.deserialize(document).data as UninitializedRecord;
    delete record.id;
    return record;
  }

  serializeResourceTypePath(type: string): string {
    const serializer = this.#serializerFor(
      JSONAPISerializers.ResourceTypePath
    ) as OrbitSerializer;
    return serializer.serialize(type) as string;
  }

  serializeResourceFieldPath(
    relationhip: string,
    type: string | string[] | undefined
  ): string {
    const serializer = this.#serializerFor(
      JSONAPISerializers.ResourceFieldPath
    ) as JSONAPIResourceFieldSerializer;
    return serializer.serialize(relationhip, {
      type: type as string,
    }) as string;
  }

  resourceFieldParamSerializer(): JSONAPIResourceFieldSerializer {
    return this.#serializerFor(
      JSONAPISerializers.ResourceFieldParam
    ) as JSONAPIResourceFieldSerializer;
  }
}
