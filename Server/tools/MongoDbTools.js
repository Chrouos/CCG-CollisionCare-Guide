const { MongoClient, ServerApiVersion } = require("mongodb");
const ConfigCrypto = require('./ConfigCrypto');

class MongoDB_Tools {

    constructor() {
        this.configCrypto = new ConfigCrypto();

        const {
            MONGODB_PROTOCOL = 'mongodb',
            MONGODB_USERNAME = 'username',
            MONGODB_PASSWORD = 'password',
            MONGODB_HOST = 'ccg-mongodb',
            MONGODB_PORT = '27017',
            MONGODB_DBNAME = 'CCG',
            MONGODB_AUTHSOURCE = 'CCG'
        } = this.configCrypto.config;

        this.uri = `${MONGODB_PROTOCOL}://${MONGODB_USERNAME}:${MONGODB_PASSWORD}@${MONGODB_HOST}:${MONGODB_PORT}/${MONGODB_DBNAME}?authSource=${MONGODB_AUTHSOURCE}`;
        this.client = new MongoClient(this.uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            }
        });
        this.connect()
    }

    async connect() {
        try {
            await this.client.connect();
            // console.log("Connected successfully to database at " + this.uri);
        } catch (error) {
            console.error("Error connecting:", error);
        }
    }

    async disconnect() {
        try {
            await this.client.close();
            console.log("Disconnected successfully from server");
        } catch (error) {
            console.error("Error disconnecting:", error);
        }
    }

    // -------------------- CRUD Operations --------------------

    // - Create
    async create(collectionName, document) {
        try {
            const db = this.client.db("CCG");
            const collection = db.collection(collectionName);
            const result = await collection.insertOne(document);
            return result.insertedId;
        } catch (error) {
            console.error("Error creating document:", error);
            return null;
        }
    }

    // - Read
    async read(collectionName, query, sort = {}, projection = {}, limit = null) {
        try {
            const db = this.client.db("CCG");
            const collection = db.collection(collectionName);
            let cursor = collection.find(query).project(projection).sort(sort);
            
            // 如果 limit 有有效值，則應用它
            if (limit !== null && Number.isInteger(limit) && limit > 0) {
                cursor = cursor.limit(limit);
            }
            
            const result = await cursor.toArray();
            return result;
        } catch (error) {
            console.error("Error reading documents:", error);
        }
    }
    

    // - Update
    async update(collectionName, query, updateOperation) {
        try {
            const db = this.client.db("CCG");
            const collection = db.collection(collectionName);
            const result = await collection.updateMany(query, updateOperation);
            return result;
        } catch (error) {
            console.error("Error updating document:", error);
        }
    }


    // - Delete
    async delete(collectionName, query) {
        try {
            const db = this.client.db("CCG");
            const collection = db.collection(collectionName);
            const result = await collection.deleteMany(query);
            return result;
        } catch (error) {
            console.error("Error deleting document:", error);
        }
    }

    // - 刪除指定 Collection 全部資料
    async deleteAllFromCollection(collectionName) {
        try {
            const db = this.client.db("CCG");
            const collection = db.collection(collectionName);

            const result = await collection.deleteMany({}); // * 透過 deleteMany 並給予空集合做到
            return result;
        } catch (error) {
            console.error("Error deleting all documents from collection:", error);
        }
    }

}

module.exports = MongoDB_Tools;
