# DokodemoLikeButton
 Obniz x Mesh Button x Kintone


## npm install

``` 
npm install 
```

 
## create kintone App

```
{
  gatewayId: { type: 'Text' for obnizId },
  reviews: {
    type: 'Table',
    value: {
      "review": { type: 'radio button' has 3 values like ["Like", "so-so", "No"] },
      "deviceId": {  type: 'TEXT' for buttonId },
      "timeAnswer": { type: 'DATETIME' for button pushed },
      "timeEntry": { type: 'DATETIME' for button connected },
      "timeExit": { type: 'DATETIME' for button disconnected },
      "cl": { type: 'CALC', value: (review == "Like" ? 1 : 0 },
      "cs": { type: 'CALC', value: (review == "so-so") ? 1 : 0 },
      "cn": { type: 'CALC', value: (review == "No") ? 1 : 0 }
    }
  }
}
```

 

## Set .env file

``` 
API_KINTONE="{yours}"
URL_KINTONE_BASE="{yours}"
OBNIZ_IDLIST = '[{ 
  "recordId": "{your-kintone-redordId}", 
  "obnizId":"{yours}", 
  "accessToken": "{your-obniz-accessToken}"
  }, { "recordId": ... }]'
```
 

## Run node app

``` 
node app.js 
```