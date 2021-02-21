import Koa from 'koa';
import JSONAPISource, { JSONAPISerializers } from '@orbit/jsonapi';
import { buildSerializerSettingsFor } from '@orbit/serializers';
import { AddressInfo } from 'net';
import { Server } from 'http';
import Orbit from '@orbit/core';
import fetch from 'node-fetch';
import SQLSource from 'orbit-sql';

import schema from './support/test-schema';
import tests, { Subject } from './support/koa-orbit-shared';
import { orbit } from '../src';

let server: Server;
let app: Koa;
let source: JSONAPISource;
const subject: Subject = {};

Orbit.globals.fetch = fetch;

function createServer(): Promise<Server> {
  const app = new Koa();
  const source = new SQLSource({
    schema,
    knex: {
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    },
  });

  const router = orbit({ source });
  app.use(router.routes());
  app.use(router.allowedMethods());

  return new Promise<Server>((resolve) => {
    server = app.listen(0, () => {
      resolve(server);
    });

    server.once('close', () => {
      source.deactivate();
    });
  });
}

QUnit.module('Koa Orbit (jsonapi)', function (hooks) {
  hooks.beforeEach(async () => {
    const server = await createServer();

    const { port } = server.address() as AddressInfo;
    const host = `http://localhost:${port}`;

    app = new Koa();
    source = new JSONAPISource({
      schema,
      host,
      serializerSettingsFor: buildSerializerSettingsFor({
        settingsByType: {
          [JSONAPISerializers.ResourceField]: {
            serializationOptions: { inflectors: ['dasherize'] },
          },
        },
      }),
    });

    const router = orbit({ source });
    app.use(router.routes());
    app.use(router.allowedMethods());

    subject.app = app;
  });

  hooks.afterEach(async () => {
    await source.deactivate();
    await server.close();
  });

  tests(subject, 'jsonapi');
});
