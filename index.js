/*
 * This plugin removes the 'ByFooIdAndBarId' from the end of relations.
 *
 * If this results in a field conflict in your GraphQL schema, use smart
 * comments to rename the conflicting foreign key constraint:
 *
 *   https://www.graphile.org/postgraphile/smart-comments/#renaming
 *
 */

function fixCapitalisedPlural(fn) {
  return function(str) {
    const original = fn.call(this, str);
    return original.replace(/[0-9]S(?=[A-Z]|$)/g, match => match.toLowerCase());
  };
}

module.exports = function PgSimplifyInflectorPlugin(
  builder,
  {
    pgSimpleCollections,
    pgOmitListSuffix,
    pgSimplifyPatch = true,
    pgSimplifyAllRows = true,
  }
) {
  const hasConnections = pgSimpleCollections !== "only";
  const hasSimpleCollections =
    pgSimpleCollections === "only" || pgSimpleCollections === "both";

  if (hasConnections && hasSimpleCollections && pgOmitListSuffix) {
    throw new Error(
      "Cannot omit -list suffix (`pgOmitListSuffix`) if both relay connections and simple collections are enabled."
    );
  }

  if (
    hasSimpleCollections &&
    !hasConnections &&
    pgOmitListSuffix !== true &&
    pgOmitListSuffix !== false
  ) {
    console.warn(
      "You can simplify the inflector further by adding `{graphileBuildOptions: {pgOmitListSuffix: true}}` to the options passed to PostGraphile, however be aware that doing so will mean that later enabling relay connections will be a breaking change. To dismiss this message, set `pgOmitListSuffix` to false instead."
    );
  }

  builder.hook("inflection", oldInflection => {
    return {
      ...oldInflection,

      /*
       * This solves the issue with `blah-table1s` becoming `blahTable1S`
       * (i.e. the capital S at the end) or `table1-connection becoming `Table1SConnection`
       */
      camelCase: fixCapitalisedPlural(oldInflection.camelCase),
      upperCamelCase: fixCapitalisedPlural(oldInflection.upperCamelCase),

      distinctPluralize(str) {
        const singular = this.singularize(str);
        const plural = this.pluralize(singular);
        if (singular !== plural) {
          return plural;
        }
        if (
          plural.endsWith("ch") ||
          plural.endsWith("s") ||
          plural.endsWith("sh") ||
          plural.endsWith("x") ||
          plural.endsWith("z")
        ) {
          return plural + "es";
        } else if (plural.endsWith("y")) {
          return plural.slice(0, -1) + "ies";
        } else {
          return plural + "s";
        }
      },

      getBaseName(columnName) {
        const matches = columnName.match(
          /^(.+?)(_row_id|_id|_uuid|_fk|RowId|Id|Uuid|UUID|Fk)$/
        );
        if (matches) {
          return matches[1];
        }
        return null;
      },

      baseNameMatches(baseName, otherName) {
        const singularizedName = this.singularize(otherName);
        return baseName === singularizedName;
      },

      /* This is a good method to override. */
      getOppositeBaseName(baseName) {
        return (
          {
            /*
             * Changes to this list are breaking changes and will require a
             * major version update, so we need to group as many together as
             * possible! Rather than sending a PR, please look for an open
             * issue called something like "Add more opposites" (if there isn't
             * one then please open it) and add your suggestions to the GitHub
             * comments.
             */
            parent: "child",
            child: "parent",
            author: "authored",
            editor: "edited",
            reviewer: "reviewed",
          }[baseName] || null
        );
      },

      getBaseNameFromKeys(detailedKeys) {
        if (detailedKeys.length === 1) {
          const key = detailedKeys[0];
          const columnName = this._columnName(key);
          return this.getBaseName(columnName);
        }
        return null;
      },

      ...(pgSimplifyPatch
        ? {
            patchField() {
              return "patch";
            },
          }
        : null),

      ...(pgSimplifyAllRows
        ? {
            allRows(table) {
              return this.camelCase(
                this.distinctPluralize(this._singularizedTableName(table))
              );
            },
            allRowsSimple(table) {
              return this.camelCase(
                this.distinctPluralize(this._singularizedTableName(table)) +
                  (pgOmitListSuffix ? "" : "-list")
              );
            },
          }
        : null),
      
      computedColumnList(
        pseudoColumnName,
        proc,
        _table,
      ) {
        return proc.tags.fieldName
          ? proc.tags.fieldName +  (pgOmitListSuffix ? "" : "List")
          : this.camelCase(pseudoColumnName + (pgOmitListSuffix ? "" : "-list"));
      },

      singleRelationByKeys(detailedKeys, table, _foreignTable, constraint) {
        if (constraint.tags.fieldName) {
          return constraint.tags.fieldName;
        }
        const baseName = this.getBaseNameFromKeys(detailedKeys);
        if (baseName) {
          return this.camelCase(baseName);
        }
        if (this.baseNameMatches(baseName, table.name)) {
          return this.camelCase(`${this._singularizedTableName(table)}`);
        }
        return oldInflection.singleRelationByKeys(
          detailedKeys,
          table,
          _foreignTable,
          constraint
        );
      },

      singleRelationByKeysBackwards(
        detailedKeys,
        table,
        _foreignTable,
        constraint
      ) {
        if (constraint.tags.foreignSingleFieldName) {
          return constraint.tags.foreignSingleFieldName;
        }
        if (constraint.tags.foreignFieldName) {
          return constraint.tags.foreignFieldName;
        }
        const baseName = this.getBaseNameFromKeys(detailedKeys);
        const oppositeBaseName = baseName && this.getOppositeBaseName(baseName);
        if (oppositeBaseName) {
          return this.camelCase(
            `${oppositeBaseName}-${this._singularizedTableName(table)}`
          );
        }
        if (this.baseNameMatches(baseName, table.name)) {
          return this.camelCase(`${this._singularizedTableName(table)}`);
        }
        return oldInflection.singleRelationByKeysBackwards(
          detailedKeys,
          table,
          _foreignTable,
          constraint
        );
      },

      manyRelationByKeys(detailedKeys, table, _foreignTable, constraint) {
        if (constraint.tags.foreignFieldName) {
          return constraint.tags.foreignFieldName;
        }
        const baseName = this.getBaseNameFromKeys(detailedKeys);
        const oppositeBaseName = baseName && this.getOppositeBaseName(baseName);
        if (oppositeBaseName) {
          return this.camelCase(
            `${oppositeBaseName}-${this.distinctPluralize(
              this._singularizedTableName(table)
            )}`
          );
        }
        if (this.baseNameMatches(baseName, _foreignTable.name)) {
          return this.camelCase(
            `${this.distinctPluralize(this._singularizedTableName(table))}`
          );
        }
        return oldInflection.manyRelationByKeys(
          detailedKeys,
          table,
          _foreignTable,
          constraint
        );
      },

      manyRelationByKeysSimple(detailedKeys, table, _foreignTable, constraint) {
        if (constraint.tags.foreignSimpleFieldName) {
          return constraint.tags.foreignSimpleFieldName;
        }
        return this.camelCase(
          this.manyRelationByKeys(
            detailedKeys,
            table,
            _foreignTable,
            constraint
          ) + (pgOmitListSuffix ? "" : "-list")
        );
      },
    };
  });
};
