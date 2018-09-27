/*
 * This plugin removes the 'ByFooIdAndBarId' from the end of relations.
 *
 * If this results in a field conflict in your GraphQL schema, use smart
 * comments to rename the conflicting foreign key constraint:
 *
 *   https://www.graphile.org/postgraphile/smart-comments/#renaming
 *
 */

module.exports = function PgSimplifyInflectorPlugin(
  builder,
  { pgSimpleCollections, pgOmitListSuffix }
) {
  const hasConnections = pgSimpleCollections !== 'only';
  const hasSimpleCollections =
    pgSimpleCollections === 'only' || pgSimpleCollections === 'both';
  if (hasConnections && hasSimpleCollections && pgOmitListSuffix) {
    throw new Error(
      'Cannot omit -list suffix (`pgOmitListSuffix`) if both relay connections and simple collections are enabled.'
    );
  }
  if (
    hasSimpleCollections &&
    !hasConnections &&
    pgOmitListSuffix !== true &&
    pgOmitListSuffix !== false
  ) {
    console.warn(
      'You can simplify the inflector further by adding `{graphileOptions: {pgOmitListSuffix: true}}` to the options passed to PostGraphile, however be aware that doing so will mean that later enabling relay connections will be a breaking change. To dismiss this message, set `pgOmitListSuffix` to false instead.'
    );
  }

  builder.hook('inflection', inflection => {
    return {
      ...inflection,

      singleRelationByKeys(detailedKeys, table, foreignTable, constraint) {
        if (constraint.tags.fieldName) {
          return constraint.tags.fieldName;
        }
        if (detailedKeys.length === 1) {
          const key = detailedKeys[0];
          const columnName = this._columnName(key);
          const matches = columnName.match(/^(.*)(_id|_uuid|Id|Uuid)$/);
          if (matches) {
            return this.camelCase(matches[1]);
          }
        }
        return this.camelCase(`${this._singularizedTableName(table)}`);
      },
      manyRelationByKeys(detailedKeys, table, foreignTable, constraint) {
        if (constraint.tags.foreignFieldName) {
          return constraint.tags.foreignFieldName;
        }
        if (detailedKeys.length === 1) {
          const key = detailedKeys[0];
          const columnName = this._columnName(key);
          const matches = columnName.match(/^(.*)(_id|_uuid|Id|Uuid)$/);
          if (matches) {
            return this.camelCase(
              `${matches[1]}_${this.pluralize(
                this._singularizedTableName(table)
              )}`
            );
          }
        }

        return this.camelCase(
          `${this.pluralize(this._singularizedTableName(table))}`
        );
      },
      manyRelationByKeysSimple(detailedKeys, table, foreignTable, constraint) {
        if (constraint.tags.foreignFieldName) {
          return constraint.tags.foreignFieldName;
        }

        return this.camelCase(
          `${this.pluralize(this._singularizedTableName(table))}` +
            (pgOmitListSuffix ? '' : '-list')
        );
      }
    };
  });
};
