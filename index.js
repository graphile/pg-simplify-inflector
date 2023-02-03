"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PgSimplifyInflectionPlugin = exports.PgSimplifyInflectionPreset = void 0;
const grafast_1 = require("grafast");
function fixCapitalisedPlural(previous, _preset, str) {
    const original = previous.call(this, str);
    return original.replace(/[0-9]S(?=[A-Z]|$)/g, (match) => match.toLowerCase());
}
function fixChangePlural(previous, _options, str) {
    const matches = str.match(/([A-Z]|_[a-z0-9])[a-z0-9]*_*$/);
    const index = matches ? matches.index + matches[1].length - 1 : 0;
    const suffixMatches = str.match(/_*$/);
    const suffixIndex = suffixMatches.index;
    const prefix = str.substring(0, index);
    const word = str.substring(index, suffixIndex);
    const suffix = str.substring(suffixIndex);
    return `${prefix}${previous.call(this, word)}${suffix}`;
}
/*
{
    pgSimpleCollections,
    pgOmitListSuffix,
    pgSimplifyPatch = true,
    pgSimplifyAllRows = true,
    pgShortPk = true,
    pgSimplifyMultikeyRelations = true,
  } = build.options
*/
const PgSimplifyInflectionPlugin = {
    name: "PgSimplifyInflectionPlugin",
    version: "0.0.0",
    inflection: {
        add: {
            distinctPluralize(_preset, str) {
                const singular = this.singularize(str);
                const plural = this.pluralize(singular);
                if (singular !== plural) {
                    return plural;
                }
                if (plural.endsWith("ch") ||
                    plural.endsWith("s") ||
                    plural.endsWith("sh") ||
                    plural.endsWith("x") ||
                    plural.endsWith("z")) {
                    return plural + "es";
                }
                else if (plural.endsWith("y")) {
                    return plural.slice(0, -1) + "ies";
                }
                else {
                    return plural + "s";
                }
            },
            getBaseName(_preset, columnName) {
                const matches = columnName.match(/^(.+?)(_row_id|_id|_uuid|_fk|_pk|RowId|Id|Uuid|UUID|Fk|Pk)$/);
                if (matches) {
                    return matches[1];
                }
                return null;
            },
            baseNameMatches(_preset, baseName, otherName) {
                const singularizedName = this.singularize(otherName);
                return baseName === singularizedName;
            },
            /* This is a good method to override. */
            getOppositeBaseName(_preset, baseName) {
                return ({
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
                }[baseName] || null);
            },
            getBaseNameFromKeys(preset, detailedKeys) {
                if (detailedKeys.length === 1) {
                    const key = detailedKeys[0];
                    const columnName = this._columnName(key);
                    return this.getBaseName(columnName);
                }
                if (preset.schema?.pgSimplifyMultikeyRelations) {
                    const columnNames = detailedKeys.map((key) => this._columnName(key));
                    const baseNames = columnNames.map((columnName) => this.getBaseName(columnName));
                    // Check none are null
                    if (baseNames.every((n) => n)) {
                        return baseNames.join("-");
                    }
                }
                return null;
            },
        },
        replace: {
            /*
             * This solves the issue with `blah-table1s` becoming `blahTable1S`
             * (i.e. the capital S at the end) or `table1-connection becoming `Table1SConnection`
             */
            camelCase: fixCapitalisedPlural,
            upperCamelCase: fixCapitalisedPlural,
            /*
             * Pluralize/singularize only supports single words, so only run
             * on the final segment of a name.
             */
            pluralize: fixChangePlural,
            singularize: fixChangePlural,
            // Fix a naming bug
            deletedNodeId(_prev, preset, { source }) {
                return this.camelCase(`deleted-${this.singularize(this.tableType(source.codec))}-${this.nodeIdFieldName()}`);
            },
            patchField(previous, options, fieldName) {
                return options.schema?.pgSimplifyPatch
                    ? "patch"
                    : previous.call(this, fieldName);
            },
            connectionField(_prev, options, baseName) {
                return options.schema?.pgOmitListSuffix
                    ? baseName + "Connection"
                    : baseName;
            },
            listField(_prev, options, baseName) {
                return options.schema?.pgOmitListSuffix ? baseName : baseName + "List";
            },
            allRowsConnection(previous, options, source) {
                if (options.schema?.pgSimplifyAllRows) {
                    return this.connectionField(this.camelCase(`${this.distinctPluralize(this._singularizedSourceName(source))}`));
                }
                else {
                    return previous.call(this, source);
                }
            },
            allRowsList(previous, options, source) {
                if (options.schema?.pgSimplifyAllRows) {
                    return this.listField(this.camelCase(this.distinctPluralize(this._singularizedSourceName(source))));
                }
                else {
                    return previous.call(this, source);
                }
            },
            singleRelation(previous, _options, details) {
                const { source, relationName } = details;
                const relation = source.getRelation(relationName);
                if (typeof relation.extensions?.tags?.fieldName === "string") {
                    return relation.extensions.tags.fieldName;
                }
                const detailedKeys = relation.localColumns.map((columnName) => ({
                    codec: source.codec,
                    columnName,
                }));
                const baseName = this.getBaseNameFromKeys(detailedKeys);
                if (baseName) {
                    return this.camelCase(baseName);
                }
                const foreignPk = relation.source.uniques.find((u) => u.isPrimary);
                if (foreignPk &&
                    (0, grafast_1.arraysMatch)(foreignPk.columns, relation.remoteColumns)) {
                    return this.camelCase(`${this._singularizedCodecName(relation.source.codec)}`);
                }
                return previous.call(this, details);
            },
            singleRelationBackwards(previous, _options, details) {
                const { source, relationName } = details;
                const relation = source.getRelation(relationName);
                if (typeof relation.extensions?.tags?.foreignSingleFieldName === "string") {
                    return relation.extensions.tags.foreignSingleFieldName;
                }
                if (typeof relation.extensions?.tags?.foreignFieldName === "string") {
                    return relation.extensions.tags.foreignFieldName;
                }
                const detailedKeys = relation.remoteColumns.map((columnName) => ({
                    codec: relation.source.codec,
                    columnName,
                }));
                const baseName = this.getBaseNameFromKeys(detailedKeys);
                if (baseName) {
                    const oppositeBaseName = this.getOppositeBaseName(baseName);
                    if (oppositeBaseName) {
                        return this.camelCase(`${oppositeBaseName}-${this._singularizedCodecName(relation.source.codec)}`);
                    }
                    if (this.baseNameMatches(baseName, source.name)) {
                        return this.camelCase(`${this._singularizedCodecName(relation.source.codec)}`);
                    }
                }
                const pk = source.uniques.find((u) => u.isPrimary);
                if (pk && (0, grafast_1.arraysMatch)(pk.columns, relation.localColumns)) {
                    return this.camelCase(`${this._singularizedCodecName(relation.source.codec)}`);
                }
                return previous.call(this, details);
            },
            _manyRelation(previous, _options, details) {
                const { source, relationName } = details;
                const relation = source.getRelation(relationName);
                const detailedKeys = relation.remoteColumns.map((columnName) => ({
                    codec: relation.source.codec,
                    columnName,
                }));
                const baseName = this.getBaseNameFromKeys(detailedKeys);
                if (baseName) {
                    const oppositeBaseName = this.getOppositeBaseName(baseName);
                    if (oppositeBaseName) {
                        return this.camelCase(`${oppositeBaseName}-${this.distinctPluralize(this._singularizedCodecName(relation.source.codec))}`);
                    }
                    if (this.baseNameMatches(baseName, source.name)) {
                        return this.camelCase(`${this.distinctPluralize(this._singularizedCodecName(relation.source.codec))}`);
                    }
                }
                const pk = relation.source.uniques.find((u) => u.isPrimary);
                if (pk && (0, grafast_1.arraysMatch)(pk.columns, relation.remoteColumns)) {
                    return this.camelCase(`${this.distinctPluralize(this._singularizedCodecName(relation.source.codec))}`);
                }
                return previous.call(this, details);
            },
            nodeById(previous, options, typeName) {
                if (options.schema?.pgShortPk) {
                    return this.camelCase(`${typeName}-by-${this.nodeIdFieldName()}`);
                }
                else {
                    return previous.call(this, typeName);
                }
            },
            rowByUnique(previous, options, details) {
                const { unique, source } = details;
                if (typeof unique.extensions?.tags?.fieldName === "string") {
                    return unique.extensions?.tags?.fieldName;
                }
                if (options.schema?.pgShortPk && unique.isPrimary) {
                    // Primary key, shorten!
                    return this.camelCase(this._singularizedCodecName(source.codec));
                }
                else {
                    return previous.call(this, details);
                }
            },
            updateByKeysField(previous, options, details) {
                const { source, unique } = details;
                if (typeof unique.extensions?.tags.updateFieldName === "string") {
                    return unique.extensions.tags.updateFieldName;
                }
                if (options.schema?.pgShortPk && unique.isPrimary) {
                    return this.camelCase(`update-${this._singularizedCodecName(source.codec)}`);
                }
                else {
                    return previous.call(this, details);
                }
            },
            deleteByKeysField(previous, options, details) {
                const { source, unique } = details;
                if (typeof unique.extensions?.tags.deleteFieldName === "string") {
                    return unique.extensions.tags.deleteFieldName;
                }
                if (options.schema?.pgShortPk && unique.isPrimary) {
                    // Primary key, shorten!
                    return this.camelCase(`delete-${this._singularizedCodecName(source.codec)}`);
                }
                else {
                    return previous.call(this, details);
                }
            },
            updateByKeysInputType(previous, options, details) {
                const { source, unique } = details;
                if (unique.extensions?.tags.updateFieldName) {
                    return this.upperCamelCase(`${unique.extensions.tags.updateFieldName}-input`);
                }
                if (options.schema?.pgShortPk && unique.isPrimary) {
                    // Primary key, shorten!
                    return this.upperCamelCase(`update-${this._singularizedCodecName(source.codec)}-input`);
                }
                else {
                    return previous.call(this, details);
                }
            },
            deleteByKeysInputType(previous, options, details) {
                const { source, unique } = details;
                if (unique.extensions?.tags.deleteFieldName) {
                    return this.upperCamelCase(`${unique.extensions.tags.deleteFieldName}-input`);
                }
                if (options.schema?.pgShortPk && unique.isPrimary) {
                    // Primary key, shorten!
                    return this.upperCamelCase(`delete-${this._singularizedCodecName(source.codec)}-input`);
                }
                else {
                    return previous.call(this, details);
                }
            },
            updateNodeField(previous, options, details) {
                if (options.schema?.pgShortPk) {
                    return this.camelCase(`update-${this._singularizedCodecName(details.source.codec)}-by-${this.nodeIdFieldName()}`);
                }
                else {
                    return previous.call(this, details);
                }
            },
            deleteNodeField(previous, options, details) {
                if (options.schema?.pgShortPk) {
                    return this.camelCase(`delete-${this._singularizedCodecName(details.source.codec)}-by-${this.nodeIdFieldName()}`);
                }
                else {
                    return previous.call(this, details);
                }
            },
            updateNodeInputType(previous, options, details) {
                if (options.schema?.pgShortPk) {
                    return this.upperCamelCase(`update-${this._singularizedCodecName(details.source.codec)}-by-${this.nodeIdFieldName()}-input`);
                }
                else {
                    return previous.call(this, details);
                }
            },
            deleteNodeInputType(previous, options, details) {
                if (options.schema?.pgShortPk) {
                    return this.upperCamelCase(`delete-${this._singularizedCodecName(details.source.codec)}-by-${this.nodeIdFieldName()}-input`);
                }
                else {
                    return previous.call(this, details);
                }
            },
        },
    },
};
exports.PgSimplifyInflectionPlugin = PgSimplifyInflectionPlugin;
// TODO
/*
function omitListSuffix(
  preset: GraphileConfig.ResolvedPreset,
  source: PgSource<any, any, any, any>
): boolean {
  const tag = source.extensions?.tags?.listSuffix;
  if (tag == null) return !!preset.schema?.pgOmitListSuffix;
  if (tag !== "include" && tag !== "omit")
    throw new Error(
      `Unrecognized @listSuffix value "${tag}" on source "${source.name}". If @listSuffix is set, it must be "omit" or "include".`
    );
  return tag === "omit";
}
*/
exports.PgSimplifyInflectionPreset = {
    plugins: [PgSimplifyInflectionPlugin],
    schema: {
        pgSimplifyPatch: true,
        pgSimplifyAllRows: true,
        pgShortPk: true,
        pgSimplifyMultikeyRelations: true,
    },
};
