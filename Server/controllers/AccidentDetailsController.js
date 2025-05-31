const { Configuration, OpenAIApi } = require("openai");
const CryptoJS = require('crypto-js')
const ConfigCrypto = require('../tools/ConfigCrypto')
const ChromaDB_Tools = require('../tools/ChromaTools');
const MongoDB_Tools = require('../tools/MongoDbTools');
const ObjectId = require("mongodb").ObjectId;
const { getTaiwanTime, toISO, toHumanReadable } = require('../tools/TimeTools');

// ----- 擷取對話 -> incidentJson.車禍發生事故
exports.retrievalContent = async (req, res) => {
    /*
        userDescription, 使用者回復
        verificationCode,
        ccgCurrentQuestion, 現在問題
        incidentJson, 事件儲存格式
        title,
        _id,
        historyChatContent,
        currentChooseType,
        refactorHappened, 還原事故
        iconName,
        twiceFlag, 問題二次機會
        ccgLastQuestionKey, 上一個問題
    */

    try {

        // 問題解釋格式
        const questionExplain = {
            '事故發生日期': '描述事故發生的具體日期',
            '事故發生時間': '描述事故發生的具體時間',
            '事故發生地點': '發生地點地址哪條路',
            '對方駕駛交通工具': '描述對方駕駛的交通工具種類',
            '我方駕駛交通工具': '描述我方駕駛的交通工具種類',
            '我方行駛道路': '指明我方行駛的具體道路',
            '事發經過': '提供有關事故發生時的詳細經過描述',
            '我方行進方向的號誌': '描述我方行駛方向的交通號誌狀態',
            '當天天候': '描述事故發生當天的天氣情況',
            '道路狀況': '提供有關道路狀況的資訊，例如是否有施工、是否濕滑等',
            '我方行車速度': '描述我方行駛時的車速',
            '我方車輛損壞情形': '描述我方車輛在事故中的損壞情況',
            '我方傷勢': '描述我方在事故中的傷勢情況',
            '對方車輛損壞情形': '描述對方車輛在事故中的損壞情況',
            '對方傷勢': '描述對方在事故中的傷勢情況',
            '我方從哪裡出發': '提供我方駕駛起點的資訊',
            '我方出發目的地': '提供我方駕駛的目的地資訊',
            '我方出發目的是什麼': '描述我方駕駛出發的原因或目的',
        }

        // - 取得台灣的即時時間
        const currentTaiwanTime = getTaiwanTime();
        const createTime = toHumanReadable(currentTaiwanTime);

        // - 呼叫資料庫 MongoDB
        const mongoDB = new MongoDB_Tools();

        // - 獲得 OpenAI API
        const configCrypto = new ConfigCrypto();
        const OPENAI_API_KEY = configCrypto.config.GPT_KEY; // Get OpenAI API key
        const openai = new OpenAIApi(new Configuration({ apiKey: OPENAI_API_KEY })); // openAI API

        // - 整理 request data
        const requestData = req.body;
        
        // - 回傳資訊
        var responseData = {
            _id: requestData._id || "",
            title: requestData.title || createTime, // + " - " + requestData.userDescription, 
            userDescription: requestData.userDescription || "",
            historyChatContent: requestData.historyChatContent || [],
            verificationCode: requestData.verificationCode || "",
            incidentJson: requestData.incidentJson || {},
            ccgCurrentQuestion: requestData.ccgCurrentQuestion || "",
            refactorHappened: requestData.refactorHappened || "",
            iconName: requestData.iconName || "File",
            twiceFlag: requestData.twiceFlag || false,
            ccgLastQuestionKey: requestData.ccgLastQuestionKey || "",
        };

        // - 目前還未有任何資訊: 第一次對話
        // Object.values(requestData.incidentJson["車禍發生事故"]).filter(value => value !== "").length == 0 && 
        if (requestData._id == "") {

            // + 初始模組
            const { firstPromptModule } = require("./data/prompt")
            var firstPrompt = firstPromptModule(requestData);
            console.log("firstPrompt : ", firstPrompt);
            
            const firstMessages = [ { "role": "system", "content": firstPrompt } ]
            const gptResponse = await openai.createChatCompletion({
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                messages: firstMessages,
                temperature: 0.01,
                max_tokens: 2048,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            });

            // ~ 回傳的有可能不是 JSON
            try { responseData.incidentJson["車禍發生事故"] = JSON.parse(gptResponse.data.choices[0].message.content);} 
            catch (error) { console.log("firstMessages 回傳不是 Json 錯誤 :\n", gptResponse.data.choices[0].message.content) }

            // - 資料庫 第一次對話（因此需要產生聊天室）
            const createNewChat_id = await mongoDB.create(
                collectionName = 'AccidentDetails',
                document = {
                    title: responseData.title,
                    historyChatContent: [],
                    incidentJson: responseData.incidentJson,
                    verificationCode: requestData.verificationCode,
                    iconName: responseData.iconName,
                }
            )
            responseData._id = createNewChat_id.toString()
        }

        // - 已經有部分資訊了: 詢問還未知曉的資訊 (GPT - 1)
        else {

            // + 擷取模組
            const { tidyPromptModule } = require("./data/prompt")
            var tidyPrompt = tidyPromptModule(requestData);
            console.log("tidyPrompt : ", tidyPrompt);

            tidyMessage = [{ "role": "system", "content": tidyPrompt }]
            const gptResponse = await openai.createChatCompletion({
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                messages: tidyMessage,
                temperature: 0.01,
                max_tokens: 1024,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            });

            // ~ 回傳的有可能不是 JSON
            try { 
                let response = gptResponse.data.choices[0].message.content
                let tmpJson = JSON.parse(response.replace(/'/g, '"'))
                for (let key in tmpJson){
                    if (responseData.incidentJson["車禍發生事故"].hasOwnProperty(key)){
                        responseData.incidentJson["車禍發生事故"][key] = tmpJson[key]
                    }
                }
             } 
            catch (error) { console.log("Error gptResponse :\n", gptResponse.data.choices[0].message.content) }
        }

        // + 提問模組
        const { generateQuestionKeyModule } = require("./data/prompt")
        var questionprompt = generateQuestionKeyModule(responseData, questionExplain);
        console.log("questionprompt : ", questionprompt);

        const questionMessage = [ { "role": "system", "content": questionprompt }, ]
        const gptResponse = await openai.createChatCompletion({
            model: "gpt-4o-mini",
            messages: questionMessage,
            temperature: 0.5,
            max_tokens: 1024,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });
        const responseContent = gptResponse.data.choices[0].message.content;
        responseData.ccgCurrentQuestion = responseContent;
        console.log("CCG : ", responseContent);

        // - 回傳結果
        const newContent = [ 
            { character: 'questioner', value: requestData.userDescription, createTime: createTime } ,
            { character: 'chatBot', value: responseContent, createTime: createTime } 
        ]
        responseData.historyChatContent.push(...newContent);

        // - 儲存至資料庫內部
        await mongoDB.update(
            collectionName = 'AccidentDetails',
            query = { _id: new ObjectId(responseData._id) },
            updateOperation = {
                $push: {
                    historyChatContent: { $each: newContent }
                },
                $set: {
                    incidentJson: responseData.incidentJson,
                    refactorHappened: responseData.refactorHappened
                }
            }
        );

        res.status(200).send(responseData);

    } catch (error) {
        console.error("[templateJSON] Error fetching from OpenAI:", error.message || error);
        res.status(500).send(`[templateJSON] Error fetching from OpenAI: ${error.message || error}`);
    }
}

// -----  獲得標題
exports.getAccidentDetailsTitle = async (req, res) => {

    try {

        var responseData = {}; // = 定義回傳變數
        const verificationCode = req.body.verificationCode || "";

        const dbTools = new MongoDB_Tools();
        const titles = await dbTools.read(
            collectionName = 'AccidentDetails', 
            query = {verificationCode: verificationCode}, 
            sort = {"historyChatContent.createTime": -1}, // 根據對話的最新時間排序
            projection = { title: 1, iconName: 1 });

        responseData.titles = titles
        res.status(200).send(responseData);

    } catch (error) {
        res.status(500).send(`[getAccidentDetailsTitle] Error: ${error.message || error}`);
    }

}

// ----- 根據 Id 獲得該所有內容
exports.getContentAndJson = async (req, res) => {
    try {

        var responseData = {}; // = 定義回傳變數

        // - 車禍 Json 的資料取出
        const dbTools = new MongoDB_Tools();
        responseData = await dbTools.read(
            collectionName = 'AccidentDetails',
            query = { _id: new ObjectId(req.body._id) },
            limit = "1",
        )

        res.status(200).send(responseData[0]);
    } catch (error) {
        res.status(500).send(`[getContentAndJson] Error: ${error.message || error}`);
    }

}

// ----- 重構事件
exports.refactorEvent = async (req, res) => {
    try {

        const requestData = req.body;
        var responseData = {}
        
        // - Prompt
        const { refactorEventPromptModule } = require("./data/prompt");
        var refactorEventPrompt = refactorEventPromptModule(requestData);

        // - OpenAI
        const configCrypto = new ConfigCrypto();
        const OPENAI_API_KEY = configCrypto.config.GPT_KEY; // Get OpenAI API key
        const openai = new OpenAIApi(new Configuration({ apiKey: OPENAI_API_KEY })); // openAI API
    
        // - 呼叫資料庫 MongoDB
        const mongoDB = new MongoDB_Tools();

        // + 還原事實模組
        const happenedMessage = [
            { "role": "system", "content": refactorEventPrompt },
        ]
        console.log("refactorEventPrompt : ", refactorEventPrompt);
        
        const gptResponse = await openai.createChatCompletion({
            model: "gpt-4o-mini",
            messages: happenedMessage,
            temperature: 0.1,
            max_tokens: 2048,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });

        responseData.refactorHappened = gptResponse.data.choices[0].message.content;
        responseData.message = "重構事發經過成功"

        // - 存到資料庫
        await mongoDB.update(
            collectionName = 'AccidentDetails',
            query = { _id: new ObjectId(requestData._id) },
            updateOperation = {
                $set: {
                    refactorHappened: responseData.refactorHappened
                }
            }
        );

        res.status(200).send(responseData);

    }
    catch (error) {
        res.status(500).send(`[RefactorEvent] Error: ${error.message || error}`);
    }
}

// ----- 當事人Agent (自動答覆)
exports.litigantAgent = async (req, res) => {

    /*
        selectJudgment,
        question
    */

    try {

        // - 獲得 OpenAI API
        const configCrypto = new ConfigCrypto();
        const OPENAI_API_KEY = configCrypto.config.GPT_KEY; // Get OpenAI API key
        const openai = new OpenAIApi(new Configuration({ apiKey: OPENAI_API_KEY })); // openAI API

        // - 回傳資訊
        var responseData = req.body;

        // - request data
        const requestData = req.body;

        // + 當事人模組
        const { litigantAgentModule } = require("./data/prompt")
        var agentPrompt = litigantAgentModule(requestData);
        console.log("agentPrompt : ", agentPrompt);

        const message = [
            { "role": "system", "content": agentPrompt }
        ]

        const gptResponse = await openai.createChatCompletion({
            model: "gpt-4o-mini",
            messages: message,
            temperature: 0.1,
            max_tokens: 1024,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });

        const responseContent = gptResponse.data.choices[0].message.content;
        responseData.agentDescription = responseContent;
        console.log("UserAgent : ", responseContent);

        res.status(200).send(responseData);
    
    }
    catch (error) {
        res.status(500).send(`[litigantAgent] Error: ${error.message || error}`);
    }

}

// ----- 更新除了對話的其他資料
exports.updateViewerData = async (req, res) => {
    /*
        title,
        _id,
        iconName
    */

    try {

        // - 呼叫資料庫 MongoDB
        const mongoDB = new MongoDB_Tools();

        // - 整理 request data
        const requestData = req.body;
        
        // - 回傳資訊
        var responseData = {
            _id: requestData._id || "",
            title: requestData.title || createTime, // + " - " + requestData.userDescription, 
            iconName: requestData.iconName || "File",
        };

        // - 儲存至資料庫內部
        await mongoDB.update(
            collectionName = 'AccidentDetails',
            query = { _id: new ObjectId(responseData._id) },
            updateOperation = {
                $set: {
                    title: responseData.title,
                    iconName: responseData.iconName
                }
            }
        );

        res.status(200).send(responseData);

    } catch (error) {
        console.error("[updateViewerData] Error fetching from OpenAI:", error.message || error);
        res.status(500).send(`[updateViewerData] Error fetching from OpenAI: ${error.message || error}`);
    }
}

// ----- 刪除資料
exports.deleteAccidentDetails = async (req, res) => {
    /*
        _id,
    */

    try {

        // - 呼叫資料庫 MongoDB
        const mongoDB = new MongoDB_Tools();

        // - 整理 Request, Response
        const requestData = req.body;
        var responseData = {
            _id: requestData._id,
            message: "刪除失敗"
        }
        
        // - 刪除資料
        await mongoDB.delete(
            collectionName = 'AccidentDetails',
            query = { _id: new ObjectId(responseData._id) },
        );

        responseData.message = "刪除成功"
        res.status(200).send(responseData);
    } catch (error) {
        console.error("[deleteAccidentDetails] Error fetching from OpenAI:", error.message || error);
        res.status(500).send(`[deleteAccidentDetails] Error fetching from OpenAI: ${error.message || error}`);
    }
}

// ----- 隨機存取參考判決書
exports.getRandomJudgment = async (req, res) => {
    /*
        selectJudgment
        selectJudgmentID
    */

    try {
        
        // - 整理request, response
        const requestData = req.body;
        var responseData = {
            selectJudgment: requestData.selectJudgment,
            selectJudgmentID: requestData.selectJudgmentID
        }
        
        // - 取得json_judgment
        const judgmentData = require('./data/json_judgement_0.json');
        
        // - 隨機選擇一則
        responseData.selectJudgmentID = Math.floor(Math.random() * judgmentData.length);
        responseData.selectJudgment = judgmentData[responseData.selectJudgmentID]["事發經過"];
        console.log("selectJudment : ", responseData.selectJudgment);

        res.status(200).send(responseData);

    }
    catch (error) {
        console.error("[getRandomJudgment] Error:", error.message || error);
        res.status(500).send(`[getRandomJudgment] Error: ${error.message || error}`);
    }
}

// ----- 手動更新儲存Json
exports.saveUpdatedDetails = async (req, res) => {
    /*
        updatedDetails
    */
    try{
        
        // 整理request, response
        const requestData = req.body;
        var responseData = {
            updatedDetails: requestData.updatedDetails
        }
        console.log("updatedDetails: ", responseData.updatedDetails.incidentJson);

        // - 呼叫資料庫 MongoDB
        const mongoDB = new MongoDB_Tools();

        // - 儲存至資料庫內部
        await mongoDB.update(
            collectionName = 'AccidentDetails',
            query = { _id: new ObjectId(responseData.updatedDetails._id) },
            updateOperation = {
                $set: {
                    incidentJson: responseData.updatedDetails.incidentJson,
                }
            }
        );

        res.status(200).send(responseData);

    }
    catch (error) {
        console.error("[saveUpdatedDetails] Error:", error.message || error);
        res.status(500).send(`[saveUpdatedDetails] Error: ${error.message || error}`);
    }
}