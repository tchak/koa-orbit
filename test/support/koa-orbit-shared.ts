import Koa from 'koa';
import supertest, { Response } from 'supertest';
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
      assert.equal(
        response.headers['content-type'],
        'application/vnd.api+json; charset=utf-8'
      );
      assert.deepEqual(response.body, { data: [] });
    });

    test('create planet', async function (assert) {
      const response = await createEarth(subject.app as Koa);

      assert.equal(response.status, 201);
      assert.equal(
        response.headers.location,
        `/planets/${response.body.data.id}`
      );
      assert.equal(response.body.data.type, 'planet');
      assert.ok(response.body.data.id);
      assert.deepEqual(
        response.body.data.attributes,
        compact({
          name: 'Earth',
          createdAt: response.body.data.attributes.createdAt,
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
        type: 'planet',
        id,
        attributes: compact({
          name: 'Earth',
          createdAt: response.body.data.attributes.createdAt,
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
            type: 'planet',
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
        type: 'planet',
        id,
        attributes: compact({
          name: 'Earth 2',
          createdAt: data.attributes.createdAt,
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
            type: 'planet',
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
        someText: 'Some text',
        someNumber: 2,
        someBoolean: true,
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
  const body = options.payload as any;

  headers['accept'] = 'application/vnd.api+json';
  if (method === 'POST' || method === 'PATCH') {
    headers['content-type'] = 'application/vnd.api+json';
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
        type: 'planet',
        attributes: {
          name: 'Earth',
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
        type: 'moon',
        attributes: {
          name: 'Moon',
        },
        relationships: {
          planet: {
            data: {
              type: 'planet',
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

function createTypedModel(app: Koa): Promise<TestResponse> {
  return request(app, {
    method: 'POST',
    url: '/typed-models',
    payload: {
      data: {
        type: 'typedModel',
        attributes: {
          someText: 'Some text',
          someNumber: 2,
          someBoolean: true,
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
        type: 'tag',
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
        type: 'tag',
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
        type: 'tag',
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
        type: 'tag',
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
        type: 'article',
        relationships: {
          tags: {
            data: [
              {
                type: 'tag',
                id: tagId,
              },
            ],
          },
        },
      },
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
