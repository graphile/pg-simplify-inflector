psql simplify -f test.sql
./node_modules/.bin/postgraphile -c simplify -s app_public -X --export-schema-graphql ./schema.graphql
./node_modules/.bin/postgraphile -c simplify -s app_public -X --append-plugins "$(pwd)/index.js" --export-schema-graphql ./schema.simplified.graphql
