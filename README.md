# @graphile-contrib/pg-simplify-inflector

Simplifies relation names; e.g. `postsByAuthorId` becomes simply `posts`.

## Installation:

```bash
yarn add @graphile-contrib/pg-simplify-inflector
```

or

```bash
npm install --save @graphile-contrib/pg-simplify-inflector
```

## Usage:

CLI:

```bash
postgraphile --append-plugins @graphile-contrib/pg-simplify-inflector
```

Library:

```js
const PgSimplifyInflectorPlugin =
  require('@graphile-contrib/pg-simplify-inflector');

// ...

app.use(
  postgraphile(process.env.AUTH_DATABASE_URL, "app_public", {
    appendPlugins: [
      PgSimplifyInflectorPlugin,
    ],
    // ... other settings ...
  })
);
```

## Handling field conflicts:

If you have two relations that will result in a conflict (e.g.
`postsByAuthorId` and `postsByEditorId` would both become `posts` with this
plugin) then you will need to rename one of them - you can do so using [smart
comments](https://www.graphile.org/postgraphile/smart-comments/), e.g.:

```sql
comment on constraint posts_editor_id_fkey on posts is
  E'@foreignFieldName editedPosts\n@fieldName editor';
```
