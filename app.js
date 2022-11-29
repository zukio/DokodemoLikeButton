
require('dotenv').config();

// -------------------------------------------
// Obniz
const Obniz = require("obniz");
const obnizIdList = JSON.parse(process.env.OBNIZ_IDLIST);

// -------------------------------------------
// Kintone
const { KintoneRestAPIClient, KintoneRecordField } = require("@kintone/rest-api-client");
// リクエストURI
// https://(サブドメイン名).cybozu.com/k/v1/record.json
const Config = {
  kintone: {
    appId: 6,
    radioValues: ["Like", "so-so", "No"],
    recordIdList: []
  }
};
const kintoneClient = new KintoneRestAPIClient({
  baseUrl: process.env.URL_KINTONE_BASE,
  auth: {
    apiToken: process.env.API_KINTONE,
  },
});
// データベースアプリ（kintone）の指定レコードのテーブルに新規行を追加
const updateKintoneRecord = async (recordId, review, buttonBlockInfo) => {
  // レコードを取得
  const original = await getKintoneRecord(recordId);
  // レコード内のテーブルを取得
  const originalTable = (original.record.reviews.value) ? original.record.reviews.value : [];
  // 新規行を作成
  const newRow = formatNewRow(originalTable, review, buttonBlockInfo);
  // レコード内のテーブルに新規行を追加
  originalTable.push(newRow);
  // レコードを修正
  const newRecord = formatNewRecord(recordId, originalTable);
  // 更新
  await kintoneClient.record.updateRecord(newRecord).then(()=>{
    console.log("updateKintoneRecord", recordId, review, buttonBlockInfo.deviceId);
    return true;
  });
};

// レコードを取得
const getKintoneRecord = async (recordId) => {
  return await kintoneClient.record.getRecord({
    "app": Config.kintone.appId,
    "id": recordId
  });
}
// レコードを修正
const formatNewRecord = (recordId, updateRecord) => {
  return {
    "app": Config.kintone.appId,
    "id": recordId,
    "record": { 
      "reviews": { 
        "value": updateRecord
      }
    }
  };
}
// レコード内のテーブル（reviews）に新規行を追加（行IDが必要）
const formatNewRow = (originalTable, review, buttonBlockInfo) => {
  const lastIndex = originalTable.length -1;
  const updatedRow = rewriteRow(review, buttonBlockInfo);
  return { 
    "id": Number(originalTable[lastIndex].id) + 1,
    "value": updatedRow
  }
}
// レコード内のテーブル（reviews）に追加する行を作成
const rewriteRow = (review, buttonBlockInfo) => {
  return {
    "timeAnswer": { "value": new Date().toISOString() },
    "review": { "value": review },
    "deviceId": { "value": buttonBlockInfo.deviceId },
    "timeEntry": { type: 'DATETIME', value: buttonBlockInfo.timeConnectedAt },
    "timeExit": { type: 'DATETIME', value: '' },
    "cl": { type: 'CALC', value: (review == Config.kintone.radioValues[0]) ? 1 : 0 },
    "cs": { type: 'CALC', value: (review == Config.kintone.radioValues[1]) ? 1 : 0 },
    "cn": { type: 'CALC', value: (review == Config.kintone.radioValues[2]) ? 1 : 0 }
  }  
}
// BLEデバイスの切断時刻を記入
const rewriteExitTime = (originalTable, buttonBlockInfo) => {
  originalTable.forEach((row)=>{
    // 接続時刻が近い同名デバイスを、同一アクセスと判断
    const entry = new Date(row.value["timeEntry"].value).getTime();
    const connect = new Date( buttonBlockInfo.timeConnectedAt).getTime();
    if((row.value["deviceId"].value == buttonBlockInfo.deviceId)
    &&(Math.abs(entry-connect) < 50000)){
      // 切断時刻を記入
      row.value["timeExit"].value = new Date().toISOString();
    }
  });
  return originalTable;
}
// データベースアプリ（kintone）の指定レコードのテーブルを更新（BLEデバイスの切断時刻を記入）
const rewriteExitTimeAndUpdateKintoneRecord = async (recordId, buttonBlockInfo) => {
  // レコードを取得
  const original = await getKintoneRecord(recordId);
  // レコード内のテーブルを取得
  const originalTable = (original.record.reviews.value) ? original.record.reviews.value : [];
  // レコードを修正（BLEデバイスの切断時刻を記入）
  const newRecord = formatNewRecord(recordId, rewriteExitTime(originalTable, buttonBlockInfo));
  // 更新
  await kintoneClient.record.updateRecord(newRecord).then(()=>{
    console.log("rewriteExitTimeAndUpdateKintoneRecord", recordId, buttonBlockInfo.deviceId);
    return true;
  });
};
// レコード一覧を取得
const atouchKintoneIdToObniz = async(targetObniz) =>{
  return await kintoneClient.record.getRecords({
    "app": Config.kintone.appId, 
  })
  .then((response) => {
      // Kintone アプリの全レコードを検索
    response.records.forEach((record)=>{
      // 該当の（環境変数でObnizIdに紐づけられた）GateIdがあれば
      if((record['$id'].value == Number((targetObniz.recordId) ? targetObniz.recordId : 0))
      ||(record.gateId.value == targetObniz.obnizId)){
        // 未登録なら
        if(!Config.kintone.recordIdList.some((item)=>item.key===targetObniz.obnizId)){
          // レコードIDを記録
          Config.kintone.recordIdList.push({
            'key' : targetObniz.obnizId,
            'value' : record['$id'].value
          });
        }
      }
    });
    return response.records;
  }).catch((err) => {
    // This SDK return err with KintoneAPIException
    console.log("atouchKintoneIdToObniz", err);
    return [];
  });
}
// ----------------------------------------
// MESH
const MESH_100BU = Obniz.getPartsClass('MESH_100BU');//MESH-100BU1032510
const MESH_BUTTONS = [];
const getMeshButtonIndex = (deviceName) => {
  return MESH_BUTTONS.findIndex(({peripheral}) => peripheral.localName === deviceName);
}
const instantiateMeshButton = async(peripheral, obniz) => {
  // Create an instance
  const buttonBlock = new MESH_100BU(peripheral);

  // Connect to the Button block
  await buttonBlock.connectWait();
  
  // 更新情報
  const buttonBlockInfo =  {
    "deviceId": peripheral.localName,
    "timeConnectedAt": peripheral.connected_at
  }
  const kintoneRecordId = Config.kintone.recordIdList.find((item)=>item.key==obniz.id);
  console.log(`connected: ${peripheral.localName}`, kintoneRecordId);
  
  // Single Pressed Event
  buttonBlock.onSinglePressed = (() => {
    obniz.display.clear();
    obniz.display.print('Single');
    updateKintoneRecord(kintoneRecordId.value, Config.kintone.radioValues[0], buttonBlockInfo);
  });
  
  // Double Pressed Event
  buttonBlock.onDoublePressed = (() => {
    obniz.display.clear();
    obniz.display.print('Double');
    updateKintoneRecord(kintoneRecordId.value, Config.kintone.radioValues[1], buttonBlockInfo);
  });
  
  // Long Pressed Event
  buttonBlock.onLongPressed = (() => {
    obniz.display.clear();
    obniz.display.print('Long');
    updateKintoneRecord(kintoneRecordId.value, Config.kintone.radioValues[2], buttonBlockInfo);
  });

  buttonBlock.ondisconnect =(()=>{
    console.log('disconnect', peripheral.localName, obniz.id);
    removeMeshButton(kintoneRecordId.value, buttonBlockInfo);
  })

  return buttonBlock;
}
const registMeshButton = async(peripheral, obniz) => {
  console.log('found', peripheral.localName, obniz.id);
  // 新規MESHボタンなら
  if(getMeshButtonIndex(peripheral.localName) < 0){
    obniz.display.clear();
    obniz.display.print('connect '+peripheral.localName);
    // 追加
    MESH_BUTTONS.push(await instantiateMeshButton(peripheral, obniz));
  }
}
const removeMeshButton = async(recordId, buttonBlockInfo) =>{
  const meshButtonIndex = getMeshButtonIndex(buttonBlockInfo.deviceId);
  console.log('meshButtonIndex', meshButtonIndex, buttonBlockInfo.deviceId);
  // 登録済MESHボタンなら
  if(meshButtonIndex >= 0){
    // 削除
    await rewriteExitTimeAndUpdateKintoneRecord(recordId, buttonBlockInfo);
    MESH_BUTTONS.splice(meshButtonIndex, 1);
    console.log('remove', buttonBlockInfo.deviceId);
  }
}
// ----------------------------------------
// Obniz // 複数
const setup = async function(){
  for(const targetObniz of obnizIdList){
    const obnizId = targetObniz.obnizId;
    const accessToken = targetObniz.accessToken;
  
    // access_tokenを設定します。
    const obniz = accessToken != '' ? new Obniz(obnizId, { access_token: accessToken }) :  new Obniz(obnizId);

    //obniz.onconnect = async function () { // サーバーレスで動かすときのコードについて https://obniz.com/ja/doc/guides/nodejs/runkit
    let connected = await obniz.connectWait({timeout:10});
    if(connected){ 
      // -------------------------------------------
      // Kintone と照合
      await atouchKintoneIdToObniz(targetObniz);
      // 該当レコードがなければ終了
      if(!Config.kintone.recordIdList.length){
        console.log("登録先データベースが不明のため終了します。データベースアプリのGateIDにObnizIDを登録するか、Obniz環境変数にデータベースアプリのRecordIDを紐づけてください");
        return;
      }
      // -------------------------------------------
      // Obniz BLE
      // BLE重複イニシャライズロック
      if(!obniz.ble.isInitialized){
        await obniz.ble.initWait();
      }
      
      // BLEデバイス接続中ロック
      const connectingLock = [];
  
      // BLEスキャン
      obniz.ble.scan.onfind = async (peripheral) => {
        // MESHボタン以外は無視
        if (!MESH_100BU.isMESHblock(peripheral)) {
            return;
        }
        // MESHボタンが見つかればスキャンをロック
        connectingLock.push(true);
        // MESHボタンが見つかれば登録
        await registMeshButton(peripheral, obniz);
        // 処理完了後にスキャンロックを解除
        connectingLock.splice(connectingLock.length-1, 1);

        // スキャンを再開
        console.log("scan reStart...");
        await obniz.ble.scan.startWait();
      };
  
      // BLEスキャン完了時
      obniz.ble.scan.onfinish = async function(peripherals, error){
        console.log("scan timeout!", obniz.ble.isInitialized);
        // Obniz の 接続（Websocket）が切れた際は繰り返し処理を止める
        if(!obniz.ble.isInitialized){
          // BLEを再イニシャライズ
          //await obniz.ble.initWait();
          return;
        }
        // スキャンロック中でなければ
        if(!connectingLock.length){
          // スキャンを繰り返す
          console.log("scan reStart...");
          await obniz.ble.scan.startWait();
        }
      };
  
      // スキャンを開始: スキャン時間（デフォルト 30 秒）に { duration: null } を指定すると常時スキャン
      await obniz.ble.scan.startWait();
    }

    // 【検証中】通信が切れてもその状態を維持する
    //obniz.resetOnDisconnect(false);
  
    obniz.onloop = async function(){
      // called repeatedly
    }
  
    obniz.onclose = async function() {
      console.log("obniz disconnect!");
    };
  }
}

setup();



