# Koa Orbit [![Build Status](https://github.com/tchak/koa-orbit/workflows/CI/badge.svg)](https://github.com/tchak/koa-orbit/actions)

A server interface for Orbit sources

## Getting started

A getting started template is available at [orbit-server-template](https://github.com/tchak/orbit-server-template)

## Installation

Install with yarn:

```
yarn add koa-orbit
```

```ts
import koaOrbit from 'koa-orbit';
import SQLSource from 'orbit-sql';
import { RecordSchema } from '@orbit/records';

const app = new Koa();
const source = new SQLSource({
  schema: new RecordSchema({
    models: {
      todo: {
        attributes: {
          title: { type: 'string' },
          checked: { type: 'boolean' }
        }
      }
    }
  }),
  knex: {
    client: 'sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  },
});

const router = koaOrbit({ source });
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(3000);
```
