window = { }

importScripts("jsrsasign-4.9.2-all-min.js");

onmessage = function(e)
{
    if (e.data != "GenerateKeypair")
    {
        console.log("Unknown message");
        console.log(e);
        return;
    }

    setTimeout(function()
    {
        var kp = KEYUTIL.generateKeypair("RSA", 1024);
        var privKey = KEYUTIL.getPEM(kp.prvKeyObj, "PKCS1PRV");
        var pubKey = KEYUTIL.getPEM(kp.pubKeyObj, "PKCS8PUB");

        var msg = { "privKey": privKey, "pubKey": pubKey };
        postMessage(msg);
    }, 0);
}

