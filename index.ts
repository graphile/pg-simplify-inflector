import type { Inflection, Options, SchemaBuilder } from "graphile-build";
import type {
  PgClass,
  PgConstraint,
  PgEntity,
  PgProc,
  PgAttribute,
} from "graphile-build-pg";

function fixCapitalisedPlural(fn: (this: Inflection, str: string) => string) {
  return function (this: Inflection, str: string) {
    const original = fn.call(this, str);
    return original.replace(/[0-9]S(?=[A-Z]|$)/g, (match) =>
      match.toLowerCase()
    );
  };
}

function fixChangePlural(fn: (this: Inflection, str: string) => string) {
  return function (this: Inflection, str: string) {
    const matches = str.match(/([A-Z]|_[a-z0-9])[a-z0-9]*_*$/);
    const index = matches ? matches.index! + matches[1].length - 1 : 0;
    const suffixMatches = str.match(/_*$/);
    const suffixIndex = suffixMatches!.index!;
    const prefix = str.substr(0, index);
    const word = str.substr(index, suffixIndex - index);
    const suffix = str.substr(suffixIndex);
    return `${prefix}${fn.call(this, word)}${suffix}`;
  };
}

function isPrimaryKey(detailedKeys: PgAttribute[], table: PgClass): boolean {
  if (!table.primaryKeyConstraint) {
    return false;
  }
  const { keyAttributes } = table.primaryKeyConstraint;
  return (
    detailedKeys.length === keyAttributes.length &&
    detailedKeys.every((key, i) => key === keyAttributes[i])
  );
}

function PgSimplifyInflectorPlugin(
  builder: SchemaBuilder,
  {
    pgSimpleCollections,
    pgOmitListSuffix,
    pgSimplifyPatch = true,
    pgSimplifyAllRows = true,
    pgShortPk = true,
    pgSimplifyMultikeyRelations = true,
    nodeIdFieldName = "nodeId",
  }: Options
) {
  const hasConnections = pgSimpleCollections !== "only";
  const hasSimpleCollections =
    pgSimpleCollections === "only" || pgSimpleCollections === "both";

  if (
    hasSimpleCollections &&
    !hasConnections &&
    pgOmitListSuffix !== true &&
    pgOmitListSuffix !== false
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      "You can simplify the inflector further by adding `{graphileBuildOptions: {pgOmitListSuffix: true}}` to the options passed to PostGraphile, however be aware that doing so will mean that later enabling relay connections will be a breaking change. To dismiss this message, set `pgOmitListSuffix` to false instead."
    );
  }

  function omitListSuffix(entity: PgEntity) {
    const tag = entity.tags.listSuffix;
    if (tag == null) return !!pgOmitListSuffix;
    if (tag !== "include" && tag !== "omit")
      throw new Error(
        `Unrecognized @listSuffix value "${tag}" on ${entity.kind} "${entity.name}". If @listSuffix is set, it must be "omit" or "include".`
      );
    return tag === "omit";
  }

  function connectionSuffix(entity: PgEntity) {
    return omitListSuffix(entity) ? "-connection" : "";
  }

  function ConnectionSuffix(entity: PgEntity) {
    return omitListSuffix(entity) ? "Connection" : "";
  }

  function listSuffix(entity: PgEntity) {
    return omitListSuffix(entity) ? "" : "-list";
  }

  function ListSuffix(entity: PgEntity) {
    return omitListSuffix(entity) ? "" : "List";
  }

  builder.hook("inflection", (oldInflection) => {
    return {
      ...oldInflection,

      /*
       * This solves the issue with `blah-table1s` becoming `blahTable1S`
       * (i.e. the capital S at the end) or `table1-connection becoming `Table1SConnection`
       */
      camelCase: fixCapitalisedPlural(oldInflection.camelCase),
      upperCamelCase: fixCapitalisedPlural(oldInflection.upperCamelCase),

      /*
       * Pluralize/singularize only supports single words, so only run
       * on the final segment of a name.
       */
      pluralize: fixChangePlural(oldInflection.pluralize),
      singularize: fixChangePlural(oldInflection.singularize),

      distinctPluralize(str: string) {
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

      // Fix a naming bug
      deletedNodeId(table: PgClass) {
        return this.camelCase(
          `deleted-${this.singularize(table.name)}-${nodeIdFieldName}`
        );
      },

      getBaseName(columnName: string) {
        const matches = columnName.match(
          /^(.+?)(_row_id|_id|_uuid|_fk|_pk|RowId|Id|Uuid|UUID|Fk|Pk)$/
        );
        if (matches) {
          return matches[1];
        }
        return null;
      },

      baseNameMatches(baseName: string, otherName: string) {
        const singularizedName = this.singularize(otherName);
        return baseName === singularizedName;
      },

      /* This is a good method to override. */
      getOppositeBaseName(baseName: string) {
        return (
          (
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
            } as { [key: string]: string }
          )[baseName] || null
        );
      },

      getBaseNameFromKeys(detailedKeys: string[]) {
        if (detailedKeys.length === 1) {
          const key = detailedKeys[0];
          const columnName = this._columnName(key);
          return this.getBaseName(columnName);
        }
        if (pgSimplifyMultikeyRelations) {
          const columnNames = detailedKeys.map((key) => this._columnName(key));
          const baseNames = columnNames.map((columnName) =>
            this.getBaseName(columnName)
          );
          // Check none are null
          if (baseNames.every((n) => n)) {
            return baseNames.join("-");
          }
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
            allRows(table: PgClass) {
              return this.camelCase(
                this.distinctPluralize(this._singularizedTableName(table)) +
                  connectionSuffix(table)
              );
            },
            allRowsSimple(table: PgClass) {
              return this.camelCase(
                this.distinctPluralize(this._singularizedTableName(table)) +
                  listSuffix(table)
              );
            },
          }
        : null),

      computedColumn(pseudoColumnName: string, proc: PgProc, _table: PgClass) {
        return proc.tags.fieldName
          ? proc.tags.fieldName +
              (proc.returnsSet ? ConnectionSuffix(proc) : "")
          : this.camelCase(
              pseudoColumnName + (proc.returnsSet ? connectionSuffix(proc) : "")
            );
      },

      computedColumnList(
        pseudoColumnName: string,
        proc: PgProc,
        _table: PgClass
      ) {
        return proc.tags.fieldName
          ? proc.tags.fieldName + ListSuffix(proc)
          : this.camelCase(pseudoColumnName + listSuffix(proc));
      },

      singleRelationByKeys(
        detailedKeys: PgAttribute[],
        table: PgClass,
        foreignTable: PgClass,
        constraint: PgConstraint
      ) {
        if (constraint.tags.fieldName) {
          return constraint.tags.fieldName;
        }
        const baseName = this.getBaseNameFromKeys(detailedKeys);
        if (baseName) {
          return this.camelCase(baseName);
        }
        if (isPrimaryKey(detailedKeys, foreignTable)) {
          return this.camelCase(`${this._singularizedTableName(table)}`);
        }
        return oldInflection.singleRelationByKeys(
          detailedKeys,
          table,
          foreignTable,
          constraint
        );
      },

      singleRelationByKeysBackwards(
        detailedKeys: PgAttribute[],
        table: PgClass,
        foreignTable: PgClass,
        constraint: PgConstraint
      ) {
        if (constraint.tags.foreignSingleFieldName) {
          return constraint.tags.foreignSingleFieldName;
        }
        if (constraint.tags.foreignFieldName) {
          return constraint.tags.foreignFieldName;
        }
        const baseName = this.getBaseNameFromKeys(detailedKeys);
        if (baseName) {
          const oppositeBaseName = this.getOppositeBaseName(baseName);
          if (oppositeBaseName) {
            return this.camelCase(
              `${oppositeBaseName}-${this._singularizedTableName(table)}`
            );
          }
          if (this.baseNameMatches(baseName, foreignTable.name)) {
            return this.camelCase(`${this._singularizedTableName(table)}`);
          }
        }
        if (isPrimaryKey(detailedKeys, table)) {
          return this.camelCase(`${this._singularizedTableName(table)}`);
        }
        return oldInflection.singleRelationByKeysBackwards(
          detailedKeys,
          table,
          foreignTable,
          constraint
        );
      },

      _manyRelationByKeysBase(
        detailedKeys: PgAttribute[],
        table: PgClass,
        _foreignTable: PgClass,
        _constraint: PgConstraint
      ) {
        const baseName = this.getBaseNameFromKeys(detailedKeys);
        if (baseName) {
          const oppositeBaseName = this.getOppositeBaseName(baseName);
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
        }
        return null;
      },

      manyRelationByKeys(
        detailedKeys: PgAttribute[],
        table: PgClass,
        foreignTable: PgClass,
        constraint: PgConstraint
      ) {
        if (constraint.tags.foreignFieldName) {
          if (constraint.tags.foreignSimpleFieldName) {
            return constraint.tags.foreignFieldName;
          } else {
            return (
              constraint.tags.foreignFieldName + ConnectionSuffix(constraint)
            );
          }
        }
        const base = this._manyRelationByKeysBase(
          detailedKeys,
          table,
          foreignTable,
          constraint
        );
        if (base) {
          return base + ConnectionSuffix(constraint);
        }
        if (isPrimaryKey(detailedKeys, table)) {
          return (
            this.camelCase(
              `${this.distinctPluralize(this._singularizedTableName(table))}`
            ) + ConnectionSuffix(constraint)
          );
        }
        return (
          oldInflection.manyRelationByKeys(
            detailedKeys,
            table,
            foreignTable,
            constraint
          ) + ConnectionSuffix(constraint)
        );
      },

      manyRelationByKeysSimple(
        detailedKeys: PgAttribute[],
        table: PgClass,
        foreignTable: PgClass,
        constraint: PgConstraint
      ) {
        if (constraint.tags.foreignSimpleFieldName) {
          return constraint.tags.foreignSimpleFieldName;
        }
        if (constraint.tags.foreignFieldName) {
          return constraint.tags.foreignFieldName + ListSuffix(constraint);
        }
        const base = this._manyRelationByKeysBase(
          detailedKeys,
          table,
          foreignTable,
          constraint
        );
        if (base) {
          return base + ListSuffix(constraint);
        }
        if (isPrimaryKey(detailedKeys, table)) {
          return (
            this.camelCase(
              `${this.distinctPluralize(this._singularizedTableName(table))}`
            ) + ListSuffix(constraint)
          );
        }
        return (
          oldInflection.manyRelationByKeys(
            detailedKeys,
            table,
            foreignTable,
            constraint
          ) + ListSuffix(constraint)
        );
      },

      functionQueryName(proc: PgProc) {
        return this.camelCase(
          this._functionName(proc) +
            (proc.returnsSet ? connectionSuffix(proc) : "")
        );
      },
      functionQueryNameList(proc: PgProc) {
        return this.camelCase(this._functionName(proc) + listSuffix(proc));
      },

      ...(pgShortPk
        ? {
            tableNode(table: PgClass) {
              return this.camelCase(
                `${this._singularizedTableName(table)}-by-${nodeIdFieldName}`
              );
            },
            rowByUniqueKeys(
              detailedKeys: string[],
              table: PgClass,
              constraint: PgConstraint
            ) {
              if (constraint.tags.fieldName) {
                return constraint.tags.fieldName;
              }
              if (constraint.type === "p") {
                // Primary key, shorten!
                return this.camelCase(this._singularizedTableName(table));
              } else {
                return this.camelCase(
                  `${this._singularizedTableName(table)}-by-${detailedKeys
                    .map((key) => this.column(key))
                    .join("-and-")}`
                );
              }
            },

            updateByKeys(
              detailedKeys: string[],
              table: PgClass,
              constraint: PgConstraint
            ) {
              if (constraint.tags.updateFieldName) {
                return constraint.tags.updateFieldName;
              }
              if (constraint.type === "p") {
                return this.camelCase(
                  `update-${this._singularizedTableName(table)}`
                );
              } else {
                return this.camelCase(
                  `update-${this._singularizedTableName(
                    table
                  )}-by-${detailedKeys
                    .map((key) => this.column(key))
                    .join("-and-")}`
                );
              }
            },
            deleteByKeys(
              detailedKeys: string[],
              table: PgClass,
              constraint: PgConstraint
            ) {
              if (constraint.tags.deleteFieldName) {
                return constraint.tags.deleteFieldName;
              }
              if (constraint.type === "p") {
                // Primary key, shorten!
                return this.camelCase(
                  `delete-${this._singularizedTableName(table)}`
                );
              } else {
                return this.camelCase(
                  `delete-${this._singularizedTableName(
                    table
                  )}-by-${detailedKeys
                    .map((key) => this.column(key))
                    .join("-and-")}`
                );
              }
            },
            updateByKeysInputType(
              detailedKeys: PgAttribute[],
              table: PgClass,
              constraint: PgConstraint
            ) {
              if (constraint.tags.updateFieldName) {
                return this.upperCamelCase(
                  `${constraint.tags.updateFieldName}-input`
                );
              }
              if (constraint.type === "p") {
                // Primary key, shorten!
                return this.upperCamelCase(
                  `update-${this._singularizedTableName(table)}-input`
                );
              } else {
                return this.upperCamelCase(
                  `update-${this._singularizedTableName(
                    table
                  )}-by-${detailedKeys
                    .map((key) => this.column(key))
                    .join("-and-")}-input`
                );
              }
            },
            deleteByKeysInputType(
              detailedKeys: PgAttribute[],
              table: PgClass,
              constraint: PgConstraint
            ) {
              if (constraint.tags.deleteFieldName) {
                return this.upperCamelCase(
                  `${constraint.tags.deleteFieldName}-input`
                );
              }
              if (constraint.type === "p") {
                // Primary key, shorten!
                return this.upperCamelCase(
                  `delete-${this._singularizedTableName(table)}-input`
                );
              } else {
                return this.upperCamelCase(
                  `delete-${this._singularizedTableName(
                    table
                  )}-by-${detailedKeys
                    .map((key) => this.column(key))
                    .join("-and-")}-input`
                );
              }
            },
            updateNode(table: PgClass) {
              return this.camelCase(
                `update-${this._singularizedTableName(
                  table
                )}-by-${nodeIdFieldName}`
              );
            },
            deleteNode(table: PgClass) {
              return this.camelCase(
                `delete-${this._singularizedTableName(
                  table
                )}-by-${nodeIdFieldName}`
              );
            },
            updateNodeInputType(table: PgClass) {
              return this.upperCamelCase(
                `update-${this._singularizedTableName(
                  table
                )}-by-${nodeIdFieldName}-input`
              );
            },
            deleteNodeInputType(table: PgClass) {
              return this.upperCamelCase(
                `delete-${this._singularizedTableName(
                  table
                )}-by-${nodeIdFieldName}-input`
              );
            },
          }
        : null),
    };
  });
}

// Hacks for TypeScript/Babel import
export = PgSimplifyInflectorPlugin;
PgSimplifyInflectorPlugin.default = PgSimplifyInflectorPlugin;
Object.defineProperty(PgSimplifyInflectorPlugin, "__esModule", { value: true });
