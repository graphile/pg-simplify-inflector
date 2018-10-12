# @graphile-contrib/pg-simplify-inflector

Simplifies relation names; e.g. `postsByAuthorId` becomes simply `posts`, and
`userByAuthorId` becomes simply `author`.

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
const PgSimplifyInflectorPlugin = require("@graphile-contrib/pg-simplify-inflector");

// ...

app.use(
  postgraphile(process.env.AUTH_DATABASE_URL, "app_public", {
    appendPlugins: [PgSimplifyInflectorPlugin],
    // ... other settings ...
  })
);
```

## Naming your foreign key fields

By naming your foreign key along the lines of `author_id` or `author_fk`, e.g.:

```sql
CREATE TABLE posts (
  id serial primary key,
  author_id int not null references users,
  ...
);
```

We can automatically extract the field prefix: `author` and call the relation
`author` rather than the default: `user`. This allows for a post to have an
`author`, `editor`, `reviewer`, etc. all which point to `users`.

The reverse, however, is not so easy - on the User type, we can't call the reverse
of all these relations `posts`. The default inflector refers to these as
`postsByAuthorId`, `postsByEditorId`, etc. but this plugin exists to simplify
these relations.

To this end, we introduce a new inflector: `getOppositeBaseName`. This
inflector is passed a baseName (the part without the `_id`/`_fk` suffix, e.g.
`author`, `editor`, `reviewer` above) and should return the opposite of that
base name which will be prepended to the target type to produce, e.g.
`authoredPosts`, `editedPosts`, `reviewedPosts`. Failing this, we'll just call
the relation 'posts' and it will be up to you to add smart comments to handle
the field conflicts.

## Handling field conflicts:

If you have two relations that will result in a conflict (e.g.
`postsByFooId` and `postsByBarId` would both become `posts` with this
plugin) then you will need to rename one of them - you can do so using [smart
comments](https://www.graphile.org/postgraphile/smart-comments/), e.g.:

```sql
comment on constraint posts_foo_id_fkey on posts is
  E'@foreignFieldName fooPosts\n@fieldName editor';
```
