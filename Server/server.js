const os = require('os');
const express = require('express');
const config = require('config');
const { Configuration, OpenAIApi } = require("openai");

const app = express();
const interfaces = os.networkInterfaces();  // 檢索該機器上的所有網絡接口
const port = 8000;
let hostname = 'localhost';

// -------------------- routers list
const chatGPT = require('./routers/chatGPTRouter')
app.use(chatGPT);


// 檢查每個網絡接口，並尋找 IPv4 地址
for (const name of Object.keys(interfaces)) {
  for (const iface of interfaces[name]) {
    if ('IPv4' === iface.family && !iface.internal) {
      hostname = iface.address;
    }
  }
}

app.listen(port, () => {
  console.log(`[LawsNote] Server listening at http://${hostname}:${port}`);
});
