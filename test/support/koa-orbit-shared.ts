import Koa from 'koa';
import supertest, { Response } from 'supertest';
import { uuid } from '@orbit/utils';
import qs from 'qs';

export interface Subject {
  app?: Koa;
}

QUnit.config.testTimeout = 1000;

const { test } = QUnit;

export default function (subject: Subject, sourceName: string): void {
  QUnit.module('jsonapi', function () {
    test('get planets (empty)', async function (assert) {
      const response = await getPlanets(subject.app as Koa);

      assert.equal(response.status, 200);
      // assert.equal(
      //   response.headers['content-type'],
      //   'application/vnd.api+json; charset=utf-8'
      // );
      assert.deepEqual(response.body, { data: [] });
    });

    test('create planet', async function (assert) {
      const response = await createEarth(subject.app as Koa);

      assert.equal(response.status, 201);
      assert.equal(
        response.headers.location,
        `/planets/${response.body.data.id}`
      );
      assert.equal(response.body.data.type, 'planets');
      assert.ok(response.body.data.id);
      assert.deepEqual(
        response.body.data.attributes,
        compact({
          name: 'Earth',
          'created-at': response.body.data.attributes['created-at'],
        })
      );
    });

    test('get planets', async function (assert) {
      await createEarth(subject.app as Koa);
      const response = await getPlanets(subject.app as Koa);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 1);
    });

    test('get planet', async function (assert) {
      const { body } = await createEarth(subject.app as Koa);
      const id = body.data.id;

      const response = await getPlanet(subject.app as Koa, id);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, {
        type: 'planets',
        id,
        attributes: compact({
          name: 'Earth',
          'created-at': response.body.data.attributes['created-at'],
        }),
      });
    });

    test('update planet', async function (assert) {
      const { body } = await createEarth(subject.app as Koa);
      const id = body.data.id;

      const response = await request(subject.app as Koa, {
        method: 'PATCH',
        url: `/planets/${id}`,
        payload: {
          data: {
            id,
            type: 'planets',
            attributes: {
              name: 'Earth 2',
            },
          },
        },
      });

      assert.equal(response.status, 204);

      const {
        status,
        body: { data },
      } = await getPlanet(subject.app as Koa, id);

      assert.equal(status, 200);
      assert.deepEqual(data, {
        type: 'planets',
        id,
        attributes: compact({
          name: 'Earth 2',
          'created-at': data.attributes['created-at'],
        }),
      });
    });

    test('update not found', async function (assert) {
      if (sourceName == 'memory') {
        assert.ok(true);
        return;
      }
      const response = await request(subject.app as Koa, {
        method: 'PATCH',
        url: `/planets/123`,
        payload: {
          data: {
            id: '123',
            type: 'planets',
            attributes: {
              name: 'Earth 2',
            },
          },
        },
      });

      assert.equal(response.status, 404);
    });

    test('remove planet', async function (assert) {
      const { body } = await createEarth(subject.app as Koa);
      const id = body.data.id;

      const response = await request(subject.app as Koa, {
        method: 'DELETE',
        url: `/planets/${id}`,
      });

      assert.equal(response.status, 204);

      const { status } = await getPlanet(subject.app as Koa, id);

      assert.equal(status, 404);

      const { status: newStatus } = await createEarth(subject.app as Koa);
      assert.equal(newStatus, 201);
    });

    test('create moon', async function (assert) {
      const { body } = await createEarth(subject.app as Koa);
      const id = body.data.id;

      const response = await createMoon(subject.app as Koa, id);

      assert.equal(response.status, 201);
    });

    test('get planet moons', async function (assert) {
      const { body } = await createEarth(subject.app as Koa);
      const id = body.data.id;
      await createMoon(subject.app as Koa, id);

      const response = await getPlanetMoons(subject.app as Koa, id);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 1);
    });

    test('create typedModels', async function (assert) {
      const { body } = await createTypedModel(subject.app as Koa);
      const id = body.data.id;

      const response = await request(subject.app as Koa, {
        url: `/typed-models/${id}`,
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data.attributes, {
        'some-text': 'Some text',
        'some-number': 2,
        'some-boolean': true,
      });
    });

    test('many to many', async function (assert) {
      const { body } = await createTag(subject.app as Koa);
      const id = body.data.id;

      const response = await createArticle(subject.app as Koa, id);
      assert.equal(response.status, 201);
    });

    test('filter', async function (assert) {
      await createTags(subject.app as Koa);

      const response = await request(subject.app as Koa, {
        url: `/tags`,
        query: qs.stringify({
          filter: {
            name: 'b',
          },
        }),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 1);
      assert.deepEqual(response.body.data[0].attributes, {
        name: 'b',
      });
    });

    test('sort (asc)', async function (assert) {
      await createTags(subject.app as Koa);

      const response = await request(subject.app as Koa, {
        url: `/tags`,
        query: qs.stringify({
          sort: 'name',
        }),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 3);
      assert.deepEqual(response.body.data[0].attributes.name, 'a');
      assert.deepEqual(response.body.data[1].attributes.name, 'b');
      assert.deepEqual(response.body.data[2].attributes.name, 'c');
    });

    test('sort (desc)', async function (assert) {
      await createTags(subject.app as Koa);

      const response = await request(subject.app as Koa, {
        url: `/tags`,
        query: qs.stringify({
          sort: '-name',
        }),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 3);
      assert.deepEqual(response.body.data[0].attributes.name, 'c');
      assert.deepEqual(response.body.data[1].attributes.name, 'b');
      assert.deepEqual(response.body.data[2].attributes.name, 'a');
    });

    QUnit.skip('operations', async function (assert) {
      if (sourceName == 'jsonapi' || sourceName === 'sql') {
        assert.ok(true);
        return;
      }
      const {
        body: {
          data: { id: earthId },
        },
      } = await createEarth(subject.app as Koa);
      const {
        body: {
          data: { id: marsId },
        },
      } = await createMars(subject.app as Koa);
      const {
        body: {
          data: { id: moonId },
        },
      } = await createMoon(subject.app as Koa, earthId);

      const response = await operationsWithEarthAndMars(
        subject.app as Koa,
        earthId,
        marsId,
        moonId
      );

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        operations: [
          {
            data: compact({
              type: 'planets',
              id: earthId,
              attributes: compact({
                name: 'Beautiful Earth',
                'created-at':
                  response.body.operations[0].data.attributes['created-at'],
              }),
              relationships: response.body.operations[0].data.relationships,
            }),
          },
          {
            data: {
              type: 'moons',
              id: moonId,
              attributes: {
                name: 'Moon',
              },
              relationships: {
                planet: {
                  data: {
                    type: 'planets',
                    id: earthId,
                  },
                },
              },
            },
          },
          {
            data: {
              type: 'moons',
              id: response.body.operations[2].data.id,
              attributes: {
                name: 'Phobos',
              },
            },
          },
          {
            data: {
              type: 'moons',
              id: response.body.operations[3].data.id,
              attributes: {
                name: 'Deimos',
              },
            },
          },
          {
            data: {
              type: 'planets',
              id: marsId,
              attributes: compact({
                name: 'Mars',
                'created-at':
                  response.body.operations[4].data.attributes['created-at'],
              }),
              relationships: response.body.operations[4].data.relationships,
            },
          },
          {
            data: {
              type: 'moons',
              id: response.body.operations[3].data.id,
              attributes: {
                name: 'Deimos',
              },
              relationships: {
                planet: {
                  data: {
                    type: 'planets',
                    id: marsId,
                  },
                },
              },
            },
          },
        ],
      });
    });
  });

  QUnit.skip('graphql', function () {
    test('get planets (empty)', async function (assert) {
      const response = await getGQLPlanets(subject.app as Koa);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, { planets: [] });
    });

    test('get planets', async function (assert) {
      await createEarth(subject.app as Koa);
      const response = await getGQLPlanets(subject.app as Koa);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.planets.length, 1);
    });

    test('get planet', async function (assert) {
      const { body } = await createEarth(subject.app as Koa);
      const id = body.data.id;

      const response = await getGQLPlanet(subject.app as Koa, id);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data.planet, {
        __typename: 'Planet',
        id,
        name: 'Earth',
      });
    });

    test('get planet moons', async function (assert) {
      const { body } = await createEarth(subject.app as Koa);
      const id = body.data.id;
      await createMoon(subject.app as Koa, id);

      const response = await getGQLPlanetMoons(subject.app as Koa, id);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, {
        planet: {
          __typename: 'Planet',
          moons: [
            {
              __typename: 'Moon',
              name: 'Moon',
              planet: {
                name: 'Earth',
              },
            },
          ],
        },
      });
    });

    test('get typedModels', async function (assert) {
      const { body } = await createTypedModel(subject.app as Koa);
      const id = body.data.id;

      const response = await request(subject.app as Koa, {
        method: 'POST',
        url: '/graphql',
        payload: {
          query: `{ typedModel(id: "${id}") { someText someNumber someBoolean } }`,
        },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data.typedModel, {
        someText: 'Some text',
        someNumber: 2,
        someBoolean: true,
      });
    });

    test('filter', async function (assert) {
      await createTags(subject.app as Koa);

      const response = await request(subject.app as Koa, {
        method: 'POST',
        url: `/graphql`,
        payload: {
          query: `{ tags(where: { name: "b" }) { name } }`,
        },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, {
        tags: [
          {
            name: 'b',
          },
        ],
      });
    });

    test('sort (asc)', async function (assert) {
      await createTags(subject.app as Koa);

      const response = await request(subject.app as Koa, {
        method: 'POST',
        url: `/graphql`,
        payload: {
          query: `{ tags(orderBy: name_ASC) { name } }`,
        },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, {
        tags: [
          {
            name: 'a',
          },
          {
            name: 'b',
          },
          {
            name: 'c',
          },
        ],
      });
    });

    test('sort (desc)', async function (assert) {
      await createTags(subject.app as Koa);

      const response = await request(subject.app as Koa, {
        method: 'POST',
        url: `/graphql`,
        payload: {
          query: `{ tags(orderBy: name_DESC) { name } }`,
        },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, {
        tags: [
          {
            name: 'c',
          },
          {
            name: 'b',
          },
          {
            name: 'a',
          },
        ],
      });
    });
  });
}

interface InjectOptions {
  url: string;
  query?: unknown;
  method?: string;
  headers?: Record<string, string>;
  payload?: unknown;
}

interface TestResponse {
  status: number;
  headers: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

async function request(
  app: Koa,
  options: InjectOptions
): Promise<TestResponse> {
  const url = options.url + (options.query ? `?${options.query}` : '');
  const method = options.method || 'GET';
  const headers = options.headers || {};
  const body = options.payload as object;

  if (url !== '/graphql') {
    headers['accept'] = 'application/vnd.api+json';
    if (method === 'POST' || method === 'PATCH') {
      headers['content-type'] = 'application/vnd.api+json';
    }
  }

  let response: Response;
  switch (method) {
    case 'POST':
      response = await supertest(app.callback())
        .post(url)
        .set(headers)
        .send(body);
      break;
    case 'PATCH':
      response = await supertest(app.callback())
        .patch(url)
        .set(headers)
        .send(body);
      break;
    case 'DELETE':
      response = await supertest(app.callback()).delete(url).set(headers);
      break;
    default:
      response = await supertest(app.callback()).get(url).set(headers);
  }

  return {
    status: response.status,
    headers: response.header,
    body: response.body,
  };
}

function createEarth(app: Koa): Promise<TestResponse> {
  return request(app, {
    method: 'POST',
    url: '/planets',
    payload: {
      data: {
        type: 'planets',
        attributes: {
          name: 'Earth',
        },
      },
    },
  });
}

function createMars(app: Koa): Promise<TestResponse> {
  return request(app, {
    method: 'POST',
    url: '/planets',
    payload: {
      data: {
        type: 'planets',
        attributes: {
          name: 'Mars',
        },
      },
    },
  });
}

function createMoon(app: Koa, earthId: string): Promise<TestResponse> {
  return request(app, {
    method: 'POST',
    url: '/moons',
    payload: {
      data: {
        type: 'moons',
        attributes: {
          name: 'Moon',
        },
        relationships: {
          planet: {
            data: {
              type: 'planets',
              id: earthId,
            },
          },
        },
      },
    },
  });
}

function getPlanet(app: Koa, id: string): Promise<TestResponse> {
  return request(app, {
    url: `/planets/${id}`,
  });
}

function getPlanets(app: Koa): Promise<TestResponse> {
  return request(app, {
    url: '/planets',
  });
}

function getPlanetMoons(app: Koa, id: string): Promise<TestResponse> {
  return request(app, {
    url: `/planets/${id}/moons`,
  });
}

function operationsWithEarthAndMars(
  app: Koa,
  earthId: string,
  marsId: string,
  moonId: string
): Promise<TestResponse> {
  const phobosId = uuid();
  const deimosId = uuid();

  return request(app, {
    method: 'PATCH',
    url: '/batch',
    payload: {
      operations: [
        {
          op: 'update',
          ref: {
            type: 'planets',
            id: earthId,
          },
          data: {
            type: 'planets',
            id: earthId,
            attributes: {
              name: 'Beautiful Earth',
            },
          },
        },
        {
          op: 'remove',
          ref: {
            type: 'moons',
            id: moonId,
          },
        },
        {
          op: 'add',
          ref: {
            type: 'moons',
            id: phobosId,
          },
          data: {
            type: 'moons',
            id: phobosId,
            attributes: {
              name: 'Phobos',
            },
          },
        },
        {
          op: 'add',
          ref: {
            type: 'moons',
            id: deimosId,
          },
          data: {
            type: 'moons',
            id: deimosId,
            attributes: {
              name: 'Deimos',
            },
          },
        },
        {
          op: 'add',
          ref: {
            type: 'planets',
            id: marsId,
            relationship: 'moons',
          },
          data: {
            type: 'moons',
            id: phobosId,
          },
        },
        {
          op: 'update',
          ref: {
            type: 'moons',
            id: deimosId,
            relationship: 'planet',
          },
          data: {
            type: 'planets',
            id: marsId,
          },
        },
      ],
    },
  });
}

function createTypedModel(app: Koa): Promise<TestResponse> {
  return request(app, {
    method: 'POST',
    url: '/typed-models',
    payload: {
      data: {
        type: 'typed-models',
        attributes: {
          'some-text': 'Some text',
          'some-number': 2,
          'some-boolean': true,
        },
      },
    },
  });
}

function createTag(app: Koa): Promise<TestResponse> {
  return request(app, {
    method: 'POST',
    url: '/tags',
    payload: {
      data: {
        type: 'tags',
      },
    },
  });
}

async function createTags(app: Koa): Promise<void> {
  await request(app, {
    method: 'POST',
    url: '/tags',
    payload: {
      data: {
        type: 'tags',
        attributes: {
          name: 'a',
        },
      },
    },
  });
  await request(app, {
    method: 'POST',
    url: '/tags',
    payload: {
      data: {
        type: 'tags',
        attributes: {
          name: 'c',
        },
      },
    },
  });
  await request(app, {
    method: 'POST',
    url: '/tags',
    payload: {
      data: {
        type: 'tags',
        attributes: {
          name: 'b',
        },
      },
    },
  });
}

function createArticle(app: Koa, tagId: string): Promise<TestResponse> {
  return request(app, {
    method: 'POST',
    url: '/articles',
    payload: {
      data: {
        type: 'articles',
        relationships: {
          tags: {
            data: [
              {
                type: 'tags',
                id: tagId,
              },
            ],
          },
        },
      },
    },
  });
}

function getGQLPlanets(app: Koa): Promise<TestResponse> {
  return request(app, {
    method: 'POST',
    url: '/graphql',
    payload: {
      query: '{ planets { __typename id name } }',
    },
  });
}

function getGQLPlanet(app: Koa, id: string): Promise<TestResponse> {
  return request(app, {
    method: 'POST',
    url: '/graphql',
    payload: {
      query: `{ planet(id: "${id}") { __typename id name } }`,
    },
  });
}

function getGQLPlanetMoons(app: Koa, id: string): Promise<TestResponse> {
  return request(app, {
    method: 'POST',
    url: '/graphql',
    payload: {
      query: `{ planet(id: "${id}") {
        __typename
        moons {
          __typename
          name
          planet { name }
        }
      } }`,
    },
  });
}

function compact(obj: Record<string, unknown>): Record<string, unknown> {
  for (const key in obj) {
    if (obj[key] === undefined) {
      delete obj[key];
    }
  }
  return obj;
}
