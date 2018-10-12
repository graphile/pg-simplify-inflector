# @graphile-contrib/pg-simplify-inflector

This plugin simplifies relation names in the PostGraphile schema; e.g.
`User.postsByAuthorId` becomes simply `User.posts`, and `Post.userByAuthorId`
becomes simply `Post.author`.

_Adding this plugin to your schema is almost certainly a breaking change, so do
it before you ship anything!_

This is recommended for most PostGraphile users, but it does require
familiarity with smart comments to override certain potential naming conflicts
(e.g. `Company.beveragesByManufacturerId` and
`Company.beveragesByDistributorId` both want to become simply
`Company.beverages` which would cause a conflict).

## Changes:

Given these tables:

```sql
create table companies (
  id serial primary key,
  name text not null
);
create table beverages (
  id serial primary key,
  name text not null,
  manufacturer_id int references companies,
  distributor_id int references companies
);
comment on constraint "beverages_distributor_id_fkey" on "beverages" is
  E'@foreignFieldName distributedBeverages';
```

- `Beverage.companyByManufacturerId` and `Beverage.companyByDistributorId`
  become `Beverage.manufacturer` and `Beverage.distributor` respectively
- `Company.beveragesByManufacturerId` and `Company.beveragesByDistributorId`
  would both become `Company.beverages` and cause an error (but we have a smart
  comment above to rename the latter to `Company.distributedBeverages` to avoid
  the issue)
- `Query.allCompanies` and `Query.allBeverages` become `Query.companies` and
  `Query.beverages` respectively (disable via `pgSimplifyAllRows = false`)
- All update mutations now accept `patch` instead of `companyPatch` /
  `beveragePatch` (disable via `pgSimplifyPatch = false`)
- If you are using `pgSimpleCollections = "only"` then you can set
  `pgOmitListSuffix = true` to omit the `List` suffix

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

In most cases, the conflict errors will guide you on how to fix these issues:

```
⚠️⚠️⚠️ An error occured when building the schema on watch:
Error: A naming conflict has occurred - two entities have tried to define the same key 'beverages'.

  The first entity was:

    Backward relation (connection) for constraint "beverages_manufacturer_id_fkey" on table "a"."beverages". To rename this relation with smart comments:

      COMMENT ON CONSTRAINT "beverages_manufacturer_id_fkey" ON "a"."beverages" IS E'@foreignFieldName newNameHere';

  The second entity was:

    Backward relation (connection) for constraint "beverages_distributor_id_fkey" on table "a"."beverages". To rename this relation with smart comments:

      COMMENT ON CONSTRAINT "beverages_distributor_id_fkey" ON "a"."beverages" IS E'@foreignFieldName newNameHere';
```

If you have two relations that will result in a conflict (e.g.
`postsByFooId` and `postsByBarId` would both become `posts` with this
plugin) then you will need to rename one of them - you can do so using [smart
comments](https://www.graphile.org/postgraphile/smart-comments/), e.g.:

```sql
comment on constraint posts_foo_id_fkey on posts is
  E'@foreignFieldName fooPosts\n@fieldName editor';
```
