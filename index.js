/*
 * This plugin removes the 'ByFooIdAndBarId' from the end of relations.
 *
 * If this results in a field conflict in your GraphQL schema, use smart
 * comments to rename the conflicting foreign key constraint:
 *
 *   https://www.graphile.org/postgraphile/smart-comments/#renaming
 *
 */

module.exports = function PgSimplifyInflectorPlugin(builder) {
  builder.hook("inflection", inflection => {
    return {
      ...inflection,

      singleRelationByKeys(detailedKeys, table, _foreignTable, constraint) {
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
      manyRelationByKeys(detailedKeys, table, _foreignTable, constraint) {
        if (constraint.tags.foreignFieldName) {
          return constraint.tags.foreignFieldName;
        }
        return this.camelCase(
          `${this.pluralize(this._singularizedTableName(table))}`
        );
      },
      manyRelationByKeysSimple(detailedKeys, table, _foreignTable, constraint) {
        if (constraint.tags.foreignFieldName) {
          return constraint.tags.foreignFieldName;
        }
        return this.camelCase(
          `${this.pluralize(this._singularizedTableName(table))}`
        );
      },
    };
  });
};
