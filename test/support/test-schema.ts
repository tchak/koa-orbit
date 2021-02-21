import { RecordSchema } from '@orbit/records';

export default new RecordSchema({
  models: {
    planet: {
      attributes: {
        name: {
          type: 'string',
        },
        description: {
          type: 'string',
        },
        createdAt: {
          type: 'datetime',
        },
      },
      relationships: {
        moons: {
          kind: 'hasMany',
          type: 'moon',
          inverse: 'planet',
          dependent: 'remove',
        },
      },
    },
    moon: {
      attributes: {
        name: {
          type: 'string',
        },
      },
      relationships: {
        planet: {
          kind: 'hasOne',
          type: 'planet',
          inverse: 'moons',
        },
      },
    },
    typedModel: {
      attributes: {
        someText: { type: 'string' },
        someNumber: { type: 'number' },
        someDate: { type: 'date' },
        someDateTime: { type: 'datetime' },
        someBoolean: { type: 'boolean' },
      },
    },
    article: {
      relationships: {
        tags: {
          kind: 'hasMany',
          type: 'tag',
          inverse: 'articles',
        },
      },
    },
    tag: {
      attributes: {
        name: { type: 'string' },
      },
      relationships: {
        articles: {
          kind: 'hasMany',
          type: 'article',
          inverse: 'tags',
        },
      },
    },
  },
});
