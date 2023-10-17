const { Configuration, OpenAIApi } = require("openai");
const CryptoJS = require('crypto-js')
const ConfigCrypto = require('../tools/ConfigCrypto')
const ChromaDB_Tools = require('../tools/ChromaTools');
const MongoDB_Tools = require('../tools/MongoDbTools');
const ObjectId = require("mongodb").ObjectId;

// -------------------- 測試 GPT
exports.chat_test = async (req, res) => {
    // + 與前端的聊天測試

    try {
        const requestData = req.body; // Data from the request.
        const messageList = [{
            "role": "user",
            "content": requestData.content
        }]

        // - 獲得 OpenAI API
        const configCrypto = new ConfigCrypto();
        const OPENAI_API_KEY = configCrypto.config.GPT_KEY; // Get OpenAI API key
        const openai = new OpenAIApi(new Configuration({ apiKey: OPENAI_API_KEY })); // openAI API

        // ! 產生可能會需要一點時間
        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: messageList,
            temperature: 0.1,
            max_tokens: 1024,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0
        });

        res.status(200).send(response.data.choices[0].message.content);

    } catch (error) {
        console.error("Error fetching from OpenAI:", error.message || error);
        res.status(500).send(`Error fetching from OpenAI: ${error.message || error}`);

    }
};

// -------------------- 獲得所有對話紀錄的名稱
exports.getTitle = async (req, res) => {
    try {
        var responseData = {}; // = 定義回傳變數

        const dbTools = new MongoDB_Tools();
        const titles = await dbTools.read('AccidentDetails', {}, { title: 1 });

        responseData.titles = titles

        res.status(200).send(responseData);
    }
    catch (error) {
        console.error("[getTitle] Error :", error.message || error);
        res.status(500).send(`[getTitle] Error : ${error.message || error}`);
    }
}

// -------------------- 獲得指定對話紀錄的內容和JSON
exports.getContentJson = async (req, res) => {
    try {

        // - 車禍 Json 的資料取出
        const dbTools = new MongoDB_Tools();
        const responseData = await dbTools.read(
            collectionName = 'AccidentDetails',
            query = { _id: new ObjectId(req.body.ids) },
        )

        res.status(200).send(responseData[0]);
    }
    catch (error) {
        console.error("[getContentJson] Error :", error.message || error);
        res.status(500).send(`[getContentJson] Error : ${error.message || error}`);
    }
}

// -------------------- 對話模板
exports.templateJSON = async (req, res) => {
    /*
        ResponseData.
            content,
            question,
            incidentJson,
            title,
            _id,
            chatContent
    */

    try {

        // - 獲得 OpenAI API
        const configCrypto = new ConfigCrypto();
        const OPENAI_API_KEY = configCrypto.config.GPT_KEY; // Get OpenAI API key
        const openai = new OpenAIApi(new Configuration({ apiKey: OPENAI_API_KEY })); // openAI API

        // - 回傳資訊
        var responseData = req.body;
        const userContent = req.body.content;

        // - 整理 request data
        const requestData = req.body;
        const notNullCount = Object.values(responseData.incidentJson["車禍發生事故"]).filter(value => value !== "").length; // 目前不是 Null 的值

        // - 呼叫資料庫 MongoDB
        const dbTools = new MongoDB_Tools();

        // - 取得台灣的即時時間
        const taiwanTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" });
        const createTime = new Date(taiwanTime).toISOString();

        // - 目前還未有任何資訊: 第一次對話
        console.log("req.body is : ", req.body);
        if (notNullCount == 0) {

            const firstMessages = [
                { "role": "system", "content": "你現在是一件交通諮詢的專家，現在有一件交通事故的敘述，請你將資訊歸納成如下的json格式，如果沒有資料請保持欄位空白，歸納的資訊請說明成類判決書格式。我 = 原告，對方 = 被告" + JSON.stringify(requestData.incidentJson["車禍發生事故"]) },
                { "role": "user", "content": requestData.content }
            ]
            console.log("firstMessages is ", firstMessages);

            const gptResponse = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: firstMessages,
                temperature: 0.1,
                max_tokens: 1024,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            });

            // 回傳的有可能不是 JSON
            try {
                responseData.incidentJson["車禍發生事故"] = JSON.parse(gptResponse.data.choices[0].message.content);
                console.log("responseData.incidentJson is : ", responseData.incidentJson["車禍發生事故"]);
            } catch (error) {
                console.error("🐛 chatGPTController - parse Json Failed:", error);
            }

            // - 資料庫 第一次對話（因此需要產生聊天室）
            const insertedId = await dbTools.create(
                collectionName = 'AccidentDetails',
                document = {
                    title: responseData.title || 'New ' + createTime,
                    chatContent: [{
                        character: 'chatBot',
                        value: "你好，我可以幫你什麼？\n請簡述你所知道的案件狀況，包含時間地點、人員傷勢、車況，事發情況等等... ",
                        createTime: createTime
                    }],
                    incidentJson: requestData.incidentJson
                }
            )
            responseData._id = insertedId.toString()
        }

        // - 已經有部分資訊了: 詢問還未知曉的資訊 (GPT - 1)
        else {

            const tidyMessage = [
                { "role": "system", "content": "你是一位事件擷取機器人，現在有一問題與該問題的敘述和一個Json格式，請你將資訊歸納以及加入以下完整Json格式，若敘述中沒有提到的資訊則將此問題欄位留空，若敘述回答不知道則將此Json格式中的此問題欄位填入'未知'。你必須回答完整以下的Json格式且只回答Json格式，不要回答其餘無關事項。我是原告。" + JSON.stringify(requestData.incidentJson["車禍發生事故"]) },
                { "role": "assistant", "content": requestData.question },
                { "role": "user", "content": requestData.content } // 把目前車禍相關的 JSON 與 使用者回覆串接
            ]
            console.log("tidyMessages is : ", tidyMessage);

            const gptResponse = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: tidyMessage,
                temperature: 0.1,
                max_tokens: 1024,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            });

            // 回傳的有可能不是 JSON
            try {
                responseData.incidentJson["車禍發生事故"] = JSON.parse(gptResponse.data.choices[0].message.content);
            } catch (error) {
                console.error("Error parsing JSON:", error);
            }
        }

        var questionkey = "你是一位交通諮詢代理人，使用溫柔的口氣表達對當事人發生的事感到惋惜，並且指示他'請點選下一步'。";
        for (const key in responseData.incidentJson["車禍發生事故"]) {
            if (!responseData.incidentJson["車禍發生事故"][key]) {
                console.log(`key = ${key}`);
                questionkey = `你現在是一位交通事故諮詢的代理人，請詢問一個關於${key}的問題給使用者，你只需要提問而不需要回答任何問題。`;
                break;
            }
        }

        // - 最後 GPT 的回覆格式
        const questionMessage = [
            { "role": "system", "content": questionkey },
            //{ "role": "user", "content": JSON.stringify(requestData.incidentJson["車禍發生事故"]) }
        ]
        console.log("questionMessage is : ", questionMessage);

        const gptResponse = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: questionMessage,
            temperature: 0.1,
            max_tokens: 1024,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });
        const responseContent = gptResponse.data.choices[0].message.content;

        // - 回傳結果
        responseData.question = responseContent;
        const newContent = [
            { character: 'questioner', value: userContent, createTime: createTime },
            { character: 'chatBot', value: responseContent, createTime: createTime }
        ]
        responseData.chatContent.push(...newContent);

        // - 儲存至資料庫內部

        console.log("ids is : ", responseData._id);
        await dbTools.update(
            collectionName = 'AccidentDetails',
            query = { _id: new ObjectId(responseData._id) },
            updateOperation = {
                $push: {
                    chatContent: { $each: newContent }
                },
                $set: {
                    incidentJson: responseData.incidentJson
                }
            }
        );


        res.status(200).send(responseData);

    } catch (error) {
        console.error("[templateJSON] Error fetching from OpenAI:", error.message || error);
        res.status(500).send(`[templateJSON] Error fetching from OpenAI: ${error.message || error}`);
    }
}

// -------------------- 詢問車損醫療
exports.carmedJSON = async (req, res) => {
    try {

        // ResponseData.
        //     content,
        //     question,
        //     incidentJson,
        //     title,
        //     _id,
        //     chatContent,
        //     selectSection


        // - 獲得 OpenAI API
        const configCrypto = new ConfigCrypto();
        const OPENAI_API_KEY = configCrypto.config.GPT_KEY; // Get OpenAI API key
        const openai = new OpenAIApi(new Configuration({ apiKey: OPENAI_API_KEY })); // openAI API

        // - 回傳資訊
        var responseData = req.body;
        const userContent = req.body.content;

        // - 整理 request data
        const requestData = req.body;

        // - 呼叫資料庫 MongoDB
        const dbTools = new MongoDB_Tools();

        // - 取得台灣的即時時間
        const taiwanTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" });
        const createTime = new Date(taiwanTime).toISOString();

        console.log("req.body is : ", req.body);
        if (req.body.selectSection == "車輛詳細狀況") {

            // 歸納JSON
            const firstMessages = [
                { "role": "system", "content": "你是一個車禍諮詢專家，有一問題與回答，有兩種問題。第一種若問題是\"是否有修車估價單?\"，若使用者回覆沒有，就將修車估價單設為\"無\"，以下JSON格式的中費用欄位的值欄位填為0;若使用者回覆有，就將修車估價單設為\"有\"，其他值欄位則保持空白。第二種問題是問車兩出廠年月或是費用問題，就將資訊歸納並加入以下完整的JSON格式中，非問題的欄位需保持不變，你必須回答整個JSON格式，且只能回答JSON格式，不需回答其餘無關事情，例如:\"車輛出廠年月\": \"100年9月\"、\"修車費用\":\"22500元\"。以下為現有JSON格式:" + JSON.stringify(requestData.incidentJson["車輛詳細狀況"]) },
                { "role": "assistant", "content": requestData.question },
                { "role": "user", "content": requestData.content }
            ]
            console.log("firstMessages is ", firstMessages);

            const firstgptResponse = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: firstMessages,
                temperature: 0.1,
                max_tokens: 1024,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            });


            try {
                responseData.incidentJson["車輛詳細狀況"] = JSON.parse(firstgptResponse.data.choices[0].message.content);
                console.log("responseData.incidentJson is : ", responseData.incidentJson["車輛詳細狀況"]);
            } catch (error) {
                console.error("🐛 chatGPTController - parse Json Failed:", error);
            }

            // 詢問問題
            var questionkey = "";
            if (responseData.incidentJson["車輛詳細狀況"]["是否有修車估價單"] === "無") {
                questionkey = "你是一位交通諮詢代理人，使用溫柔的口氣感謝使用者提供資訊更好釐清整個車禍，且指示使用者'請點選下一步'。";
            }
            else {
                for (const key in responseData.incidentJson["車輛詳細狀況"]) {
                    if (!responseData.incidentJson["車輛詳細狀況"][key]) {
                        console.log(`key = ${key}`);
                        questionkey = `你現在是一位交通事故諮詢的代理人，請詢問一個關於${key}的問題，你只需要提問此問題而不能回答任何問題也不問任何無關的問題。`;
                        break;
                    }
                }
            }

            const questionMessage = [
                { "role": "system", "content": questionkey },
            ]
            console.log("questionMessage is : ", questionMessage);

            const gptResponse = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: questionMessage,
                temperature: 0.1,
                max_tokens: 1024,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            });

            const responseContent = gptResponse.data.choices[0].message.content;
            responseData.question = responseContent;
            const newContent = [
                { character: 'questioner', value: userContent, createTime: createTime },
                { character: 'chatBot', value: responseContent, createTime: createTime }
            ]
            responseData.chatContent.push(...newContent);

            await dbTools.update(
                collectionName = 'AccidentDetails',
                query = { _id: new ObjectId(responseData._id) },
                updateOperation = {
                    $push: {
                        chatContent: { $each: newContent }
                    },
                    $set: {
                        incidentJson: responseData.incidentJson
                    }
                }
            );

            res.status(200).send(responseData);

        }
        else {

            // 歸納JSON
            const firstMessages = [
                { "role": "system", "content": "你是一個車禍諮詢專家，有一問題與回答，有兩種問題。第一種若問題是\"是否有醫療費用單?\"若使用者回覆沒有，就將醫療費用單設為\"無\"，以下JSON格式的中費用欄位的值欄位填為0，若使用者回覆有，就將醫療費用單設為有，其他值欄位保持空白。第二種問題是問醫療費用或是看護天數，就將資訊歸納並加入以下完整的JSON格式中，非問題的欄位需保持不變，你必須回覆整個JSON格式且只能回答JSON格式，不需回答其他無關事物，例如:\"醫療費用\": \"5000元\"、\"看護天數\":\"10天\"。以下為現有JSON格式:" + JSON.stringify(requestData.incidentJson["醫療詳細狀況"]) },
                { "role": "assistant", "content": requestData.question },
                { "role": "user", "content": requestData.content }
            ]

            const firstgptResponse = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: firstMessages,
                temperature: 0.1,
                max_tokens: 1024,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            });


            try {
                responseData.incidentJson["醫療詳細狀況"] = JSON.parse(firstgptResponse.data.choices[0].message.content);
                console.log("responseData.incidentJson is : ", responseData.incidentJson["醫療詳細狀況"]);
            } catch (error) {
                console.error("🐛 chatGPTController - parse Json Failed:", error);
            }

            // 詢問問題
            var questionkey = "";
            if (responseData.incidentJson["醫療詳細狀況"]["是否有醫療費用單"] === "無") {
                questionkey = "你是一位交通諮詢代理人，使用溫柔的口氣感謝使用者提供資訊更好釐清整個車禍，且指示使用者'請點選下一步'。";
            }
            else {
                for (const key in responseData.incidentJson["醫療詳細狀況"]) {
                    if (!responseData.incidentJson["醫療詳細狀況"][key]) {
                        console.log(`key = ${key}`);
                        questionkey = `你現在是一位交通事故諮詢的代理人，請詢問一個關於${key}的問題，你只需要提問而不需要回答任何問題。`;
                        break;
                    }
                }
            }

            const questionMessage = [
                { "role": "system", "content": questionkey },
            ]
            console.log("questionMessage is : ", questionMessage);

            const gptResponse = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: questionMessage,
                temperature: 0.1,
                max_tokens: 1024,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            });

            const responseContent = gptResponse.data.choices[0].message.content;
            responseData.question = responseContent;
            const newContent = [
                {
                    character: 'questioner', value: userContent, createTime0
                        : createTime
                },
                { character: 'chatBot', value: responseContent, createTime: createTime }
            ]
            responseData.chatContent.push(...newContent);

            await dbTools.update(
                collectionName = 'AccidentDetails',
                query = { _id: new ObjectId(responseData.ids) },
                updateOperation = {
                    $push: {
                        chatContent: { $each: newContent }
                    },
                    $set: {
                        incidentJson: responseData.incidentJson
                    }
                }
            );

            res.status(200).send(responseData);
        }


    } catch (error) {
        console.error("[carmedJSON] Error fetching from openAI:", error.message || error);
        res.status(500).send(`[carmedJSON] Error fetching from OpenAI: ${error.message || error}`);
    }
}

// -------------------- 詢問其他
exports.otherJSON = async (req, res) => {

    try {
        // ResponseData.
        //     content,
        //     question,
        //     incidentJson,
        //     title,
        //     _id,
        //     chatContent,
        //     selectSection


        // - 獲得 OpenAI API
        const configCrypto = new ConfigCrypto();
        const OPENAI_API_KEY = configCrypto.config.GPT_KEY; // Get OpenAI API key
        const openai = new OpenAIApi(new Configuration({ apiKey: OPENAI_API_KEY })); // openAI API

        // - 回傳資訊
        var responseData = req.body;
        const userContent = req.body.content;

        // - 整理 request data
        const requestData = req.body;

        // - 呼叫資料庫 MongoDB
        const dbTools = new MongoDB_Tools();

        // - 取得台灣的即時時間
        const taiwanTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" });
        const createTime = new Date(taiwanTime).toISOString();

        console.log("req.body is : ", req.body);

        // 歸納JSON
        const firstMessages = [
            { "role": "system", "content": "你是一個車禍諮詢專家，有一問題與回答，你要依照問題與回答，歸納並加入現有的JSON格式，其餘無關問題的欄位保持不變。你必須回答整個JSON格式，且只能回答JSON格式。以下為現有JSON格式:" + JSON.stringify(requestData.incidentJson["其他費用賠償"]) },
            { "role": "assistant", "content": requestData.question },
            { "role": "user", "content": requestData.content }
        ]
        console.log("firstMessages is ", firstMessages);

        const firstgptResponse = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: firstMessages,
            temperature: 0.1,
            max_tokens: 1024,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });


        try {
            responseData.incidentJson["其他費用賠償"] = JSON.parse(firstgptResponse.data.choices[0].message.content);
            console.log("responseData.incidentJson is : ", responseData.incidentJson["其他費用賠償"]);
        } catch (error) {
            console.error("🐛 chatGPTController - parse Json Failed:", error);
        }

        // 詢問問題
        var questionkey = "你是一位交通諮詢代理人，使用溫柔的口氣感謝使用者提供資訊更好釐清整個車禍，且指示使用者'請點選下一步'。";
        for (const key in responseData.incidentJson["其他費用賠償"]) {
            if (!responseData.incidentJson["其他費用賠償"][key]) {
                console.log(`key = ${key}`);
                questionkey = `你現在是一位交通事故諮詢的代理人，請詢問一個關於${key}的問題，你只需要提問此問題而不能回答任何問題也不問任何無關的問題。`;
                break;
            }
        }

        const questionMessage = [
            { "role": "system", "content": questionkey },
        ]
        console.log("questionMessage is : ", questionMessage);

        const gptResponse = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: questionMessage,
            temperature: 0.1,
            max_tokens: 1024,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });

        const responseContent = gptResponse.data.choices[0].message.content;
        responseData.question = responseContent;
        const newContent = [
            { character: 'questioner', value: userContent, createTime: createTime },
            { character: 'chatBot', value: responseContent, createTime: createTime }
        ]
        responseData.chatContent.push(...newContent);

        await dbTools.update(
            collectionName = 'AccidentDetails',
            query = { _id: new ObjectId(responseData._id) },
            updateOperation = {
                $push: {
                    chatContent: { $each: newContent }
                },
                $set: {
                    incidentJson: responseData.incidentJson
                }
            }
        );

        res.status(200).send(responseData);

    } catch (error) {
        console.error("[otherJSON] Error fetching from openAI:", error.message || error);
        res.status(500).send(`[otherJSON] Error fetching from OpenAI: ${error.message || error}`);
    }

}
// -------------------- 尋找相似判決
exports.similarVerdict = async (req, res) => {
    try {

        const requestData = req.body;
        var responseData = {};

        // - 呼叫資料庫 ChromaDB
        const chromadb = new ChromaDB_Tools("Traffic_Advisory_Final");
        const results = await chromadb.query({
            nResults: 5,
            queryTexts: [requestData['happened']]
        })

        const combined = results.ids[0].map((id, index) => {
            return {
                id: id,
                happened: results.metadatas[0][index].happened,
                money: results.metadatas[0][index].money
            };
        });
        responseData = combined;

        res.status(200).send(responseData);
    }
    catch (error) {
        console.error("[similarVerdict] Error :", error.message || error);
        res.status(500).send(`[similarVerdict] Error : ${error.message || error}`);
    }
}

// ----------------- 生成事件經過
exports.getHappened = async (req, res) => {
    try {

        const configCrypto = new ConfigCrypto();
        const OPENAI_API_KEY = configCrypto.config.GPT_KEY; // Get OpenAI API key
        const openai = new OpenAIApi(new Configuration({ apiKey: OPENAI_API_KEY })); // openAI API

        const reqestData = req.body;

        const happenedMessage = [
            { "role": "system", "content": "以下有一個Json格式表示了整個車禍事實，依照此格式重述整個車禍的經過，用類似於判決書的形式描述。只要講述有資料的車禍經過就好，不能敘述Json格式內其他無關事實與未提供的資料。" },
            { "role": "user", "content": JSON.stringify(requestData.incidentJson) },
        ]

        const gptResponse = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: happenedMessage,
            temperature: 0.1,
            max_tokens: 1024,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });

        const responseData = gptResponse.data.choices[0].message.content;
        res.status(200).send(responseData);

    }
    catch (error) {
        console.error("[getHappened] Error :", error.message || error);
        res.status(500).send(`[getHappened] Error : ${error.message || error}`);
    }
}




/*
1:
108年4月30日，大概早上十點多的時候，我騎重機在中山路附近行駛。有台轎車沒有遵守交通號誌，闖紅燈，撞到我害我倒地，左邊膝蓋開放性骨折還有很多擦傷。

2:
我當時從北投區出發，我的行進方向是綠燈，那天天氣晴朗，路況正常，我當時行駛車速大約50公里，我的車後燈損壞及車身有些擦傷。

3:
被告的車輛沒有損壞，也沒有受傷，那時我正要出發前往大安區工作。
*/
