const os = require('os');
const express = require('express');
const cors = require('cors');
const ConfigCrypto = require('./tools/ConfigCrypto')
const configCrypto = new ConfigCrypto();

// -------------------- App Settings
const app = express();
const interfaces = os.networkInterfaces();  // Retrieve all network interfaces on this machine
app.use(cors());
app.use(express.json()); // Parse the JSON request body

// -------------------- Server Settings
const port = configCrypto.config.PORT || 8280;
let hostname = configCrypto.config.HOSTNAME || 'localhost';
const uri = configCrypto.config.MONGODB_URL || 'mongodb://localhost:27017';

// -------------------- routers list
const pythonRouter = require('./routers/PythonRouter');
const accidentDetailsRouter = require('./routers/AccidentDetailsRouter');
const usersRouter = require('./routers/UsersRouter');
app.use(pythonRouter);
app.use(accidentDetailsRouter);
app.use(usersRouter)


// 檢查每個網絡接口，並尋找 IPv4 地址
if (hostname === 'localhost') {
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if ('IPv4' === iface.family && !iface.internal) {
        hostname = iface.address;
      }
    }
  }
}

app.listen(port, () => {
  console.log(`Server listening at http://${hostname}:${port}`);
  console.log(`Set the environment to "${process.env.NODE_ENV}"`)
});










// -------------------- test
app.get('/', (req, res) => {
  res.send("Hello")
});

// -------------------- MongoDB.
// const MongoDB_Tools = require('./tools/MongoDbTools');
// const mongodb = new MongoDB_Tools();
// mongodb.deleteAllFromCollection(collectionName = 'AccidentDetails')

// -------------------- Chroma
// const ChromaDB_Tools = require('./tools/ChromaTools');
// const chromadb = new ChromaDB_Tools("Traffic_Advisory_Final");
// const chromadb_json = new ChromaDB_Tools("Traffic_Advisory_Json");
// const chromadb_content = new ChromaDB_Tools("Traffic_Advisory_Content");
// chromadb.deleteCollection()
// chromadb_json.deleteCollection()
// chromadb_content.deleteCollection()
// chromadb.checkPeek()
// chromadb_json.checkPeek()
// chromadb_content.checkPeek()

// const chromadb = new ChromaDB_Tools("Traffic_Advisory_Final");
// chromadb.query({
//   nResults: 2,
//   queryTexts: ["被告駕駛車輛未注意讓行進中之車輛優先通行，撞及原告駕駛之機車，原告因緊急煞車而摔倒地，受傷害。"]
// }) 
