import Koa from 'koa';
import MemorySource from '@orbit/memory';

import schema from './support/test-schema';
import tests, { Subject } from './support/koa-orbit-shared';
import { orbit } from '../src';

let app: Koa;
let source: MemorySource;
const subject: Subject = {};

QUnit.module('Koa Orbit (memory)', function (hooks) {
  hooks.beforeEach(() => {
    app = new Koa();
    source = new MemorySource({ schema });

    const router = orbit({ source });
    app.use(router.routes());
    app.use(router.allowedMethods());

    subject.app = app;
  });

  hooks.afterEach(async () => {
    source.deactivate();
  });

  tests(subject, 'memory');
});
