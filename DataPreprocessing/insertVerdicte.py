"""
    將判決書內容打入資料庫(chroma)中
    
    DatabaseName:
        Traffic_Advisory
        Traffic_Advisory_Content
        Traffic_Advisory_Json
        
        已確定資料為 Traffic_Advisory_Final
"""

import json
import chromadb


# -------------------- 處理 test_event.json 變成 json 正規格式
# 開啟並讀取test_event.json檔案
def converted_json(
    preFile="test_event.json", convertedFile="./converted_test_event.json"
):
    with open("./" + preFile, "r", encoding="utf-8") as jsonFile:
        raw_json = jsonFile.read()  # 單行 json

        raw_json_str_list = raw_json.strip().split("\n")  # * 換行符號拆分，list儲存
        raw_json_list = [
            json.loads(raw_str) for raw_str in raw_json_str_list
        ]  # * 變成 JSON 格式
        json_array_str = json.dumps(
            raw_json_list, indent=2, ensure_ascii=False
        )  # * 將Python字典列表轉換回一個單一的JSON陣列字符串

        # 儲存到新的JSON檔案
        with open("./" + convertedFile, "w", encoding="utf-8") as f:
            f.write(json_array_str)


# -------------------- 存入資料庫
def insert_database(collection, fileName="converted_test_event.json"):
    with open("./" + fileName, "r", encoding="utf-8") as jsonFile:
        jsonContents = json.load(jsonFile)

        ids_counts = 0
        for content in jsonContents:
            collection.add(
                ids="ids_" + str(ids_counts),
                documents=[content["happened"]],
                metadatas=[
                    {"happened": content["happened"], "money": content["money"]}
                ],
            )

            ids_counts += 1


chroma_client = chromadb.HttpClient(host="localhost", port=8000)
collection = chroma_client.get_or_create_collection(name="Traffic_Advisory_Final")

# converted_json()
# insert_database(collection)

print(collection.count())
