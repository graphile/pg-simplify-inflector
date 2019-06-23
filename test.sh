dropdb pg_simplify_inflectors || true
createdb pg_simplify_inflectors
psql pg_simplify_inflectors -f test.sql
yarn postgraphile -c pg_simplify_inflectors -s app_public --simple-collections both -X --export-schema-graphql ./schema.graphql
yarn postgraphile -c pg_simplify_inflectors -s app_public --simple-collections both -X --export-schema-graphql ./schema.simplified.graphql
