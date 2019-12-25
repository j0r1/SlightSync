
/*

  Copyright (c) 2015-2016 Jori Liesenborgs

  Contact: jori.liesenborgs@gmail.com

  Permission is hereby granted, free of charge, to any person obtaining a
  copy of this software and associated documentation files (the "Software"),
  to deal in the Software without restriction, including without limitation
  the rights to use, copy, modify, merge, publish, distribute, sublicense,
  and/or sell copies of the Software, and to permit persons to whom the
  Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included
  in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
  OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
  THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
  FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
  IN THE SOFTWARE.
 
*/

var os = require('os');
var http = require('http');
var https = require('https');
var ws = require('websocket');
var NodeRSA = require('node-rsa');
var fs = require('fs');
var path = require('path');

var LOG_ALL = 4;
var LOG_DEBUG = 4;
var LOG_INFO = 3;
var LOG_WARNING = 2;
var LOG_ERROR = 1;

var logLevelNames = { };
logLevelNames[LOG_ERROR] = "ERROR  ";
logLevelNames[LOG_WARNING] = "WARNING";
logLevelNames[LOG_INFO] = "INFO   ";
logLevelNames[LOG_DEBUG] = "DEBUG  ";

var globalLogLevel = LOG_INFO;

var Log = function(logLevel, str)
{
    if (logLevel <= globalLogLevel)
    {
        console.log("" + Date() + " " + logLevelNames[logLevel] + " " + str); 
    }
}

// This just illustrates what needs to be implemented
var dummyImplementationClass = function()
{
    var _this = this;

    this.onRoomJoined = function(connInfo)
    {
        // Return value not used
    }

    this.onRoomLeft = function(connInfo)
    {
        // Return value not used
    }

    this.getRoomJoinedMessage = function()
    {
        // String that is returned (if any) will be sent back to the joining client
    }

    this.getBCastRoomJoinedMessage = function()
    {
        // String that is returned (if any) will be sent to all the other clients in the room
    }

    this.getBCastRoomLeftMessage = function()
    {
        // String that is returned (if any) will be sent to all the other clients in the room
    }

    this.getReturnMessage = function(obj)
    {
        // This is something that will be sent back to the client, based on 'obj'
    }

    this.needsVerification = function(message)
    {
        // Should return true or false
        return true;
    }

    this.onAboutToBroadcast = function(msg)
    {
        // Return value is not used
    }

    this.getPeriodicUpdateInterval = function()
    {
        // An interval in milliseconds
        return 2000;
    }

    this.getPeriodicUpdateMessage = function()
    {
        // A message (if any) that will be sent to everyone in the room
    }
}

// This is the actual room implementation used
var SlightSyncRoom = function()
{
    var _this = this;
    var m_connectionCount = 0;
    var m_page = 0;
    var m_allAccess = false;

    var m_allowedKeys = { "page": true, "mouseX": true, "mouseY": true, "allAccess": true };

    this.onRoomJoined = function(connInfo)
    {
        m_connectionCount++;
    }

    this.onRoomLeft = function(connInfo)
    {
        m_connectionCount--;
    }

    this.getRoomJoinedMessage = function()
    {
        var obj = {
            "numConnections": m_connectionCount,
            "page": m_page,
            "allAccess": m_allAccess
        }
        return JSON.stringify(obj);
    }

    this.getBCastRoomJoinedMessage = function() { }
    this.getBCastRoomLeftMessage = function() { }

    this.getReturnMessage = function(obj)
    {
        for (var k in obj)
        {
            if (!(k == "message" || k == "signature" || k == "ping"))
                throw "Invalid key0 " + k + " in message";
        }
    }

    this.needsVerification = function(msg)
    {
        var obj = JSON.parse(msg);
        for (var k in obj)
        {
            if (!(k in m_allowedKeys))
                    throw "Invalid key1 " + k + " in message";
        }
        // Something that regulates the access is only allowed to come from
        // a master
        if ("allAccess" in obj)
            return true;

        if (m_allAccess)
            return false;
        return true;
    }

    this.onAboutToBroadcast = function(msg)
    {
        var obj = JSON.parse(msg);
        for (n in obj)
        {
            if (!(n == "message" || n == "signature"))
                throw "Invalid key2 " + n + " in message";
        }

        obj = JSON.parse(obj["message"]);
        for (n in obj)
        {
            if (!(n in m_allowedKeys))
                    throw "Invalid key3 " + n + " in message";
        }

        // Additional checks
        if ("page" in obj)
        {
            var page = obj["page"];
            if (typeof page != "number")
                throw "Page is of invalid type";

            page = Math.round(page);
            if (page < 0 || page > 100000)
                throw "Page " + page + " too small or too large";
        }

        if ("allAccess" in obj)
        {
            if (typeof obj["allAccess"] != "boolean")
                throw "'allAccess' entry is not of type 'boolean'";
        }

        if (("mouseX" in obj && !("mouseY" in obj)) || ("mouseY" in obj && !("mouseX" in obj)))
            throw "Both mouse coordinates need to be present";

        // Everything checked out, store some things
        if ("page" in obj)
            m_page = Math.round(obj["page"]);

        if ("allAccess" in obj)
            m_allAccess = obj["allAccess"];
    }

    this.getPeriodicUpdateInterval = function()
    {
        return 2000;
    }

    this.getPeriodicUpdateMessage = function()
    {
        var obj = { 
            "numConnections": m_connectionCount, 
            "page": m_page,
            "allAccess": m_allAccess
        }
        return JSON.stringify(obj);
    }
}

// The main code, which uses a room implementation
var WebSockCast = function(webPort, ImplementationClass, scriptNameAndContents, httpsOptions, newUserName, newGroupName)
{
    var _this = this;
    var m_script = scriptNameAndContents;
    var m_webServer = null;
    var m_sockServer = null;
    var m_newConnections = [ ];
    var m_roomCheckTimeout = 1000;
    var m_newConnTimeout = 10000;
    var m_prevDbgTime = 0;
    var m_extraDbgInterval = 20000;

    var m_roomCollection = { };

    var _webHandler = function(req, res)
    {
        if (req.url == "/")
        {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.write([ '<!doctype html>',
                '<html>',
                '    <head>',
                '        <style>',
                'body, html {',
                '      margin: 0px;',
                '      background: white;',
                '      line-height: 1.4;',
                '      font-family: "Open Sans", sans-serif;',
                '}',
                '',
                'a, a:link, a:hover, a:visited, a:active { ',
                '    font-weight: bold;',
                '    text-decoration: none;',
                '    color: #0000ff;',
                '}',
                '',
                'p {',
                '    font-family: "Open Sans", sans-serif;',
                '    font-size: 16px;',
                '    text-align:justify;',
                '}',
                '',
                '.normal {',
                '    font-family: "Open Sans", sans-serif;',
                '    font-size: 16px;',
                '    padding: 0px 15px 0px 15px;',
                '    text-align:justify;',
                '}',
                '',
                '.hTitleText {',
                '    font-weight: bold;',
                '    font-family: "Open Sans", sans-serif;',
                '    font-size: 36px;',
                '    color: #355681;',
                '    padding: 0 0 0 0;',
                '    margin: 0 0 0 0;',
                '    white-space: nowrap;',
                '}',
                '',
                '.hOuterTable {',
                '    margin: 0 0 0 0;',
                '    padding: 1em 4px 0em 4px;',
                '    width: 100%;',
                '}',
                '',
                '.hZeroMarginPadding {',
                '    margin: 0 0 0 0;',
                '    padding: 0 0 0 0;',
                '    width: 100%;',
                '}',
                '',
                '.hFancyBox {',
                '    margin: 15px 15px 15px 15px;',
                '    padding: 10px 10px 10px 10px;',
                '    box-shadow: ',
                '    inset 0 0 0 1px rgba(53,86,129, 0.4), ',
                '    inset 0 0 5px rgba(53,86,129, 0.5),',
                '    inset -285px 0 35px white;',
                '    width: 100%;',
                '}',
                '',
                '.tinyHeader {',
                '    position: absolute; ',
                '    top: 0px; ',
                '    left 0px; ',
                '    width: 100%; ',
                '    font-weight: bold; ',
                '    font-family: "Open Sans", sans-serif; ',
                '    font-size: 11px; ',
                '    color: #ffffff; ',
                '    background: #355681;',
                '}',
                '',
                '.tinyHeaderLeft {',
                '    float: left;',
                '    cursor: hand;',
                '    cursor: pointer;',
                '}',
                '',
                '.tinyHeaderRight {',
                '    float: right;',
                '    cursor: hand;',
                '    cursor: pointer;',
                '}',
                '',
                '        </style>',
                '        <link href="https://fonts.googleapis.com/css?family=Open+Sans:400,300,300italic,400italic,600,600italic,700,700italic,800,800italic" rel="stylesheet" type="text/css">',
                '    </head>',
                '    <body>',
                '',
                '    <div class="tinyHeader">',
                '            <span class="tinyHeaderLeft">&nbsp;</span>',
                '            <span class="tinyHeaderRight">&nbsp;</span>',
                '    </div>',
                '',
                '    <table class="hOuterTable"><tr class="hZeroMarginPadding"><td class="hFancyBox">',
                '    <table class="hZeroMarginPadding">',
                '        <tr class="hZeroMarginPadding">',
                '            <td class="hTitleText">',
                '                <span>Sync Server</span>',
                '            </td>',
                '        </tr>',
                '    </table>',
                '    </td></tr></table>',
                '',
                '    <div class="normal">',
                '        <p>This is a <a href="https://j0r1.github.io/SlightSync/">SlightSync</a> synchronization server.</p>',
                '        <p>To set up your own synchronization server, you can download the <a href="https://nodejs.org/">Node.js</a> code ',
                '        here: <a href="' + m_script[0] + '" download>' + m_script[0] + '</a>.</p>',
                '    </div>',
                '    </body>',
                '</html>'].join("\n"));
        }
        else 
        {
            res.writeHead(200, { 'Content-Type': 'text/plain' });

            var n = req.url.substr(1);
            if (m_script[0] == n)
                res.write(m_script[1]);
            else
                res.write("Unknown URL: " + req.url);
        }

        res.end();
    }

    var onRoomCheckTimeout = function()
    {
        var curTime = Date.now();
        var extraDbg = false;
        if (curTime - m_prevDbgTime > m_extraDbgInterval)
        {
            extraDbg = true;
            m_prevDbgTime = curTime;
        }

        // First check if there are new connections that aren't doing anything

        if (extraDbg)
            Log(LOG_DEBUG, "m_newConnections.length = " + m_newConnections.length);

        var newArray = [ ];

        for (var i = 0 ; i < m_newConnections.length ; i++)
        {
            var sock = m_newConnections[i];
            if (sock && sock.connected)
            {
                if (curTime - sock.connectedTime > m_newConnTimeout)
                    sock.close();
                else
                    newArray.push(sock);
            }
        }

        m_newConnections = newArray;

        var counter = 0;
        // Check the rooms
        for (var r in m_roomCollection)
        {
            counter++;
            var room = m_roomCollection[r];
            var lastTime = room["lastTime"];
            var impl = room["implementation"];
            var curTime = Date.now();

            if (curTime - lastTime > impl.getPeriodicUpdateInterval())
            {
                var msg = impl.getPeriodicUpdateMessage();
                if (msg)
                {
                    var conns = room["connections"];
                    for (var i = 0 ; i < conns.length ; i++)
                        conns[i].send(msg);

                    room["lastTime"] = curTime;
                }
            }
        }

        if (extraDbg)
            Log(LOG_DEBUG, "Number of rooms: " + counter);
    }

    var startsWith = function(line, s)
    {
        if (line.substr(0, s.length) == s)
            return true;
        return false;
    }

    var endsWith = function(line, s)
    {
        var pos = line.length - s.length;

        if (pos < 0)
            return false;

        if (line.substr(pos) == s)
            return true;

        return false;
    }

    var joinRoom = function(rsaKeyStr, connInfo)
    {
        var key = rsaKeyStr;
        var keyStr = "";
        var started = false;
        var lines = key.split("\n");

        for (var i = 0 ; i < lines.length ; i++)
        {
            var l = lines[i].trim();

            if (startsWith(l, "---") && endsWith(l, "---"))
            {
                if (started)
                    break;
                started = true;
            }
            else
            {
                if (started)
                    keyStr += l;
            }
        }

        if (keyStr.length == 0)
            throw "No public key found";

        var roomId = keyStr;
        var pubKey = new NodeRSA(rsaKeyStr);

        if (!(roomId in m_roomCollection))
        {
            m_roomCollection[roomId] = { "implementation": new ImplementationClass(),
                                         "connections": [ ],
                                         "pubKey": pubKey,
                                         "lastTime": Date.now() }

            Log(LOG_INFO, "Created room " + roomId + ", " + connInfo.remoteAddress);
        }
        else
            Log(LOG_INFO, "Joined room " + roomId + ", " + connInfo.remoteAddress);

        var room = m_roomCollection[roomId];
        var conns = room["connections"];
        var impl = room["implementation"];

        // We need to move this connection from m_newConnections and add it to 'conns'
        var found = false;
        for (var i = 0 ; i < m_newConnections.length ; i++)
        {
            if (m_newConnections[i] === connInfo)
            {
                m_newConnections[i] = null;
                found = true;
                break;
            }
        }

        if (!found)
            throw "Internal error: connection not found in m_newConnections";

        conns.push(connInfo);

        impl.onRoomJoined(connInfo);
        var msg = impl.getRoomJoinedMessage();
        var msg2 = impl.getBCastRoomLeftMessage();

        if (msg)
            connInfo.send(msg);

        if (msg2)
        {
            for (var i = 0 ; i < conns.length ; i++)
            {
                var c = conns[i];

                if (c !== connInfo)
                    c.send(msg2);
            }
        }

        return roomId;
    }

    var getReturnMessage = function(roomId, msgObj)
    {
        return m_roomCollection[roomId]["implementation"].getReturnMessage(msgObj);
    }

    var verifyMessage = function(roomId, msgObj, message)
    {
        var room = m_roomCollection[roomId];
        var impl = room["implementation"];

        if (!impl.needsVerification(message))
            return true;

        if ("signature" in msgObj)
        {
            var signature = msgObj["signature"];
            var rsaKey = room["pubKey"];

            try
            {
                if (rsaKey.verify(message, signature, 'utf8', 'hex'))
                    return true;
            }
            catch(e)
            {
                Log(LOG_WARNING, "Error verifying message: " + e);
            }
            return false;
        }
        return false;
    }

    var sendInRoom = function(roomId, msg)
    {
        var room = m_roomCollection[roomId];
        var conns = room["connections"];
        var impl = room["implementation"];

        impl.onAboutToBroadcast(msg);
        try
        {
            for (var i = 0 ; i < conns.length ; i++)
                conns[i].send(msg);
        }
        catch(e)
        {
            Log(LOG_WARNING, "Couldn't send message " + msg + " in room " + roomId + ":" + e);
        }
    }

    var onMessage = function(connInfo, msg)
    {
        try
        {
            if (msg.type == "binary")
                throw "Binary messages are not allowed! Closing " + connInfo.remoteAddress;

            // We need a public key, that we'll use to identify a room
            var obj = JSON.parse(msg.utf8Data);
            if (connInfo.m_roomIdentifier === null)
            {
                if (!("publicKey" in obj))
                    throw "Expected a public key in the message";

                var pubKeyStr = obj["publicKey"];
                connInfo.m_roomIdentifier = joinRoom(pubKeyStr, connInfo);
                return;
            }

            // Some message will not need to be broadcast, are for the room specific
            // implementation only
            var returnMsg = getReturnMessage(connInfo.m_roomIdentifier, obj);
            if (returnMsg)
                connInfo.send(returnMsg);

            // The part with "message" will be broadcast
            if ("message" in obj)
            {
                var message = obj["message"];

                // Verify the message
                var verified = verifyMessage(connInfo.m_roomIdentifier, obj, message);
                if (verified)
                {
                    var newMsg = JSON.stringify({ "message": message });
                    sendInRoom(connInfo.m_roomIdentifier, newMsg);
                }
                else
                    Log(LOG_DEBUG, "Ignoring message from " + connInfo.remoteAddress);
            }
        }
        catch(e)
        {
            try { connInfo.close(); } catch(e2) { }
            Log(LOG_ERROR, "Error while processing message: " + e);
        }
    }

    var onNewConnection = function(connInfo)
    {
        try
        {
            Log(LOG_INFO, "New WebSocket connection from " + connInfo.remoteAddress);

            connInfo.m_connectedTime = Date.now();
            connInfo.m_roomIdentifier = null;
            connInfo.m_realSend = connInfo.send;
            connInfo.send = function(msg)
            {
                Log(LOG_DEBUG, "Sending (" + connInfo.remoteAddress + "): " + msg);
                connInfo.m_realSend(msg);
            }

            m_newConnections.push(connInfo);

            connInfo.on("message", function(msg) { onMessage(connInfo, msg); });
        }
        catch(e)
        {
            Log(LOG_ERROR, "Error while processing new connection:" + e);
        }
    }

    var onCloseConnection = function(connInfo)
    {
        try 
        {
            Log(LOG_INFO, "Closed WebSocket connection from " + connInfo.remoteAddress);

            // Check to remove connInfo from m_newConnections or from rooms
            var roomId = connInfo.m_roomIdentifier;
            if (!roomId)
            {
                var found = false;
                for (var i = 0 ; i < m_newConnections.length ; i++)
                {
                    if (m_newConnections[i] === connInfo)
                    {
                        found = true;
                        m_newConnections[i] = null;
                        break;
                    }
                }

                if (!found)
                    Log(LOG_ERROR, "Internal error: couldn't find connection in m_newConnections");
            }
            else
            {
                var room = m_roomCollection[roomId];
                var impl = room["implementation"];
                var conns = room["connections"];
                var found = false;

                for (var i = 0 ; i < conns.length ; i++)
                {
                    if (conns[i] === connInfo)
                    {
                        found = true;
                        var lastPos = conns.length-1;
                        conns[i] = conns[lastPos];
                        conns.length = lastPos;
                        Log(LOG_INFO, "Removed connection from room " + roomId + ", " + connInfo.remoteAddress);
                        break;
                    }
                }

                impl.onRoomLeft(connInfo);
                var msg = impl.getBCastRoomLeftMessage();
                if (msg)
                {
                    for (var i = 0 ; i < conns.length ; i++)
                        conns[i].send(msg);
                }

                if (conns.length == 0)
                {
                    delete m_roomCollection[roomId];
                    Log(LOG_INFO, "Removed room " + roomId);
                }
            }
        }
        catch(e)
        {
            Log(LOG_ERROR, "Error while processing closed connection: " + e);
        }
    }

    // In a function to keep the namespace clean
    var constr = function() 
    {
        if (!httpsOptions)
        {
            Log(LOG_INFO, "Using HTTP webserver");
            m_webServer = http.createServer(_webHandler);
        }
        else
        {
            Log(LOG_INFO, "Using HTTPS webserver");
            m_webServer = https.createServer(httpsOptions, _webHandler);
        }

        m_webServer.listen(webPort, null, null, function()
        {
            if (newUserName.length > 0 || newGroupName.length > 0)
            {
                try 
                {
                    Log(LOG_INFO, "Attempting to adjust User ID " + process.getuid() + " and Group ID " + process.getgid());
                    process.setgid(newGroupName);
                    process.setuid(newUserName);
                } 
                catch (err) 
                {
                    Log(LOG_ERROR, "Unable to change process User ID and Group ID: " + err);
                    process.exit(1);
                }
            }
            Log(LOG_INFO, "Running as User ID " + process.getuid() + " and Group ID " + process.getgid());
        });
        Log(LOG_INFO, "Started server on port " + port);

        var sockServOpts = {
            'httpServer': m_webServer,
            'autoAcceptConnections': true,
        };

        m_sockServer = new ws.server(sockServOpts);
        m_sockServer.on('connect', onNewConnection);
        m_sockServer.on('close', onCloseConnection);

        setInterval(onRoomCheckTimeout, m_roomCheckTimeout);
    };

    constr();
};

var scriptName = 'slightsockcast-version.js';

try
{
    var scriptPath = process.argv[1];
    var scriptContents = fs.readFileSync(scriptPath);
    var scriptName = path.basename(scriptPath);

    var args = process.argv.slice(2);
    if (args.length != 5 && args.length != 6)
        throw "Incorrect number of arguments";

    var port = parseInt(args[0]);
    if (isNaN(port) || port < 1 || port > 65535)
        throw "Invalid port number";

    var keyFileName = args[1];
    var certFileName = args[2];
    var newUserName = args[3];
    var newGroupName = args[4];
    var httpsOptions = null;

    if (keyFileName.length > 0 && certFileName.length > 0)
    {
        httpsOptions = {
            key: fs.readFileSync(keyFileName),
            cert: fs.readFileSync(certFileName)
        };
    }

    if (args.length == 6)
    {
        var lvl = parseInt(args[5]);
        if (isNaN(lvl))
            throw "Invalid log level number";

        globalLogLevel = lvl;
    }

    var wsCast = new WebSockCast(port, SlightSyncRoom, [scriptName, scriptContents], httpsOptions, newUserName, newGroupName);
}
catch(e)
{
    console.log("\nError: " + e);

    var msg = [ '',
        'About',
        '',
        '  This is a synchronization server program for SlightSync:',
        '  https://j0r1.github.io/SlightSync',
        '',
        'Usage',
        '',
        '    node ' + scriptName + ' portNumber keyFile certFile user group [logLevel]',
        '',
        '  To generate a self-signed file with both key and certificate, you',
        '  can run something like',
        '',
        '    openssl req -new -x509 -keyout server.pem -out server.pem -days 365 -nodes',
        '',
        '  (the resulting server.pem can be specified as both key and certificate)',
        '',
        '  If no encryption is required, set keyFile and certificateFile to the empty',
        '  string.',
        '',
        '  If user and group are specified, the process is assumed to be started as',
        '  root and root privileges will be dropped to those of the specified user',
        '  and group. Set to the empty string to disable this.',
        '',
        'License & disclaimer',
        '',
        '  Permission is hereby granted, free of charge, to any person obtaining a',
        '  copy of this software and associated documentation files (the "Software"),',
        '  to deal in the Software without restriction, including without limitation',
        '  the rights to use, copy, modify, merge, publish, distribute, sublicense,',
        '  and/or sell copies of the Software, and to permit persons to whom the',
        '  Software is furnished to do so, subject to the following conditions:',
        '',
        '  The above copyright notice and this permission notice shall be included',
        '  in all copies or substantial portions of the Software.',
        '',
        '  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS',
        '  OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
        '  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL',
        '  THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
        '  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING',
        '  FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS',
        '  IN THE SOFTWARE.',
        '        '].join("\n");
    console.log(msg);
}
