#!/bin/bash
set -e -x
dropdb pg_simplify_inflectors || true
createdb pg_simplify_inflectors
psql pg_simplify_inflectors -f test.sql
npx postgraphile -c pg_simplify_inflectors -s app_public --simple-collections both -X --export-schema-graphql ./schema.graphql
npx postgraphile -c pg_simplify_inflectors -s app_public --simple-collections both -X --append-plugins "`pwd`/index.js" --export-schema-graphql ./schema.simplified.graphql
if command -v colordiff; then
  COLORDIFF="colordiff"
else
  COLORDIFF="cat"
fi;
diff -u ./schema.graphql ./schema.simplified.graphql | tee schema.diff | $COLORDIFF
