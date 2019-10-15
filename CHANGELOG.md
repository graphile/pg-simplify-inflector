# v5.0.0-beta.1

# v5.0.0-beta.0

More advanced guesses at field names for reverse relations. Ability to omit
list suffix, simplify patch names, turn on/off simplifying of the 'all' from
'allUsers', ability to change the 'ById' primary key fields to not have that
suffix and instead have the node ID fetchers have a suffix.

# v3.0.0

Simplifies naming in more of the schema.

# v2.0.0

Breaking change: single relation names based on a single key are now named
after the key rather than the target table so long as the key is of the form
`foo_id`, `foo_uuid`.

```sql
create table posts (
  id serial primary key,
  author_id int not null references users,
  body text not null
);
```

```diff
 type Post {
   nodeId: ID!
   id: Int!
   authorId: Int!
-  user: User
+  author: User
   body: String!
 }
```

# v1.0.0

Initial release
