import Koa from 'koa';
import supertest, { Response } from 'supertest';

export interface RequestOptions {
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

export async function request(
  app: Koa,
  options: RequestOptions
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
