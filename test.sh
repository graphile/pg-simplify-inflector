psql simplify -f test.sql
yarn postgraphile -c simplify -s app_public --simple-collections both -X --export-schema-graphql ./schema.graphql
yarn postgraphile -c simplify -s app_public --simple-collections both -X --export-schema-graphql ./schema.simplified.graphql
