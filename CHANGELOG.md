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
