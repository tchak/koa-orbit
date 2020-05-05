import Koa from 'koa';
import SQLSource from 'orbit-sql';

import schema from './support/test-schema';
import tests, { Subject } from './support/koa-orbit-shared';
import { orbit } from '../src';

let app: Koa;
let source: SQLSource;
const subject: Subject = {};

QUnit.module('Koa Orbit (sql)', function (hooks) {
  hooks.beforeEach(() => {
    app = new Koa();
    source = new SQLSource({
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

    subject.app = app;
  });

  hooks.afterEach(async () => {
    source.deactivate();
  });

  tests(subject, 'sql');
});
