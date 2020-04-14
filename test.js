#!/usr/bin/env node
const pg = require("pg");
const fsp = require("fs").promises;
const child_process = require("child_process");
const SimplifyPlugin = require("./index.js");
const { createPostGraphileSchema } = require("postgraphile");
const { printSchema } = require("graphql");

const ROOT_CONNECTION_STRING = "postgres";
const DATABASE_NAME = "pg_simplify_inflectors";
const ROOT = `${__dirname}/tests`;

const BASE_SETTINGS = {
  simpleCollections: "both",
};

const withPool = async (connectionString, cb) => {
  const pool = new pg.Pool({
    connectionString,
  });
  try {
    return await cb(pool);
  } finally {
    pool.end();
  }
};

const withClient = async (pool, cb) => {
  const client = await pool.connect();
  try {
    return await cb(client);
  } finally {
    try {
      // Just in case there's any shenanigans
      await client.query("ROLLBACK");
      await client.query("RESET ALL");
    } catch (e) {
      /* IGNORE */
    }

    await client.release();
  }
};

async function withCleanDb(cb) {
  await withPool(ROOT_CONNECTION_STRING, async pool => {
    await pool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME};`);
    await pool.query(`CREATE DATABASE ${DATABASE_NAME};`);
  });
  await withPool(DATABASE_NAME, async pool => cb(pool));
}

async function getSchema(client, withSimplify = false) {
  return await createPostGraphileSchema(DATABASE_NAME, "app_public", {
    ...BASE_SETTINGS,
    appendPlugins: withSimplify ? [SimplifyPlugin] : [],
  });
}

async function runTests(pool, dir) {
  const schema = await fsp.readFile(`${ROOT}/${dir}/schema.sql`, "utf8");
  await withClient(pool, async client => {
    await client.query(`
      drop schema if exists app_public cascade;
      create schema app_public;
      set search_path to app_public, public;
    `);
    await client.query(schema);

    const before = await getSchema(client);
    const after = await getSchema(client, true);
    const beforePath = `${ROOT}/${dir}/schema.graphql`;
    const afterPath = `${ROOT}/${dir}/schema.simplified.graphql`;
    const diffPath = `${ROOT}/${dir}/schema.graphql.diff`;
    await fsp.writeFile(beforePath, printSchema(before));
    await fsp.writeFile(afterPath, printSchema(after));

    const diff = await new Promise((resolve, reject) => {
      const child = child_process.spawn("diff", ["-u", beforePath, afterPath], {
        stdio: "pipe",
      });
      const buffers = [];

      child.stdout.on("data", data => {
        buffers.push(data);
      });

      child.stderr.on("data", data => {
        console.error(`stderr: ${data}`);
      });

      child.on("close", code => {
        const data = Buffer.concat(buffers).toString("utf8");
        if (data.length) {
          resolve(data);
        } else {
          reject(new Error(`child process exited with code ${code}`));
        }
      });
    });

    await fsp.writeFile(diffPath, diff);
  });
}

async function main() {
  const dirs = await fsp.readdir(ROOT);
  for (const dir of dirs) {
    console.log(dir);
    if (/^[a-z_]+$/.test(dir)) {
      await withCleanDb(pool => runTests(pool, dir));
    }
  }
}

withPool("postgres", main).catch(e => {
  console.error(e);
  process.exit(1);
});
