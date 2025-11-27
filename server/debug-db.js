require('dotenv').config();
const { CosmosClient } = require("@azure/cosmos");

console.log("--- DEBUG START ---");
console.log("COSMOS_ENDPOINT:", process.env.COSMOS_ENDPOINT ? "SET" : "NOT SET");
console.log("COSMOS_KEY:", process.env.COSMOS_KEY ? "SET" : "NOT SET");
console.log("COSMOS_DATABASE_ID:", process.env.COSMOS_DATABASE_ID);
console.log("COSMOS_CONTAINER_ID:", process.env.COSMOS_CONTAINER_ID);

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;

if (!endpoint || !key) {
    console.error("Missing endpoint or key.");
    process.exit(1);
}

const client = new CosmosClient({ endpoint, key });

async function test() {
    try {
        console.log("Attempting to connect...");
        const { database } = await client.databases.createIfNotExists({ id: process.env.COSMOS_DATABASE_ID });
        console.log(`Database '${database.id}' connected/created.`);
        const { container } = await database.containers.createIfNotExists({ id: process.env.COSMOS_CONTAINER_ID, partitionKey: { paths: ["/id"] } });
        console.log(`Container '${container.id}' connected/created.`);
        console.log("SUCCESS");
    } catch (error) {
        console.error("CONNECTION FAILED:");
        console.error(error.message);
        if (error.code) console.error("Code:", error.code);
    }
}

test();
