@graphile-contrib/pg-simplify-inflector
=======================================

Simplifies relation names; e.g. `postsByAuthorId` becomes simply `posts`.

## Usage:

```bash
yarn add @graphile-contrib/pg-simplify-inflector
postgraphile --append-plugins @graphile-contrib/pg-simplify-inflector
```

## Conflicts:

If you have two relations that will result in a conflict (e.g.
`postsByAuthorId` and `postsByEditorId` would both become `posts` with this
plugin) then you will need to rename one of them - you can do so using [smart
comments](https://www.graphile.org/postgraphile/smart-comments/), e.g.:

```sql
comment on constraint posts_editor_id_fkey on posts is
  E'@foreignFieldName editedPosts\n@fieldName editor';
```
