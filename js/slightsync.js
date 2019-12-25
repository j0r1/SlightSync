var SlightSync = { };

SlightSync.getIdentifier = function(len)
{
    var str = "";
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for(var i = 0 ; i < len ; i++ )
        str += chars.charAt(Math.floor(Math.random() * chars.length));

    return str;
}

SlightSync.getSlightSyncURL = function(baseUrl, slideSetID, cmdName, value)
{
    var v = 1;

    if (value !== undefined)
        v = value;

    var url = baseUrl + "slightsync.py?id=" + slideSetID + "&" + cmdName + "=" + v + "&t=" + SlightSync.getIdentifier(16);
    
    return url;
}

SlightSync.getPageURLs = function(baseUrl, slideSetID, cb)
{
	var url = SlightSync.getSlightSyncURL(baseUrl, slideSetID, "numpages");

	NetworkConnection.get(url, function(response)
    {
		var c = ">".charCodeAt(0);
		var startIdx = 0;
		var endIdx = 0;
		var numPages = 0;
        var pageURLs = [];

		endIdx = response.indexOf("</img>");
		if (endIdx < 0) // assume we got just a number
		{
			throw "Invalid response from server: " + response;
		}
		else // ok, got a list of pages
		{
			var count = 0;
			var done = false;

			while (!done)
			{
				startIdx = endIdx;
				while (startIdx > 0 && response.charCodeAt(startIdx) != c)
					startIdx--;

				if (startIdx <= 0)
					done = true;
				else
				{
					var s = response.substring(startIdx+1, endIdx);

					pageURLs[count] = s;
					count++;

					startIdx = endIdx+5;
					endIdx = response.indexOf("</img>", startIdx);

					if (endIdx < 0)
						done = true;
				}
			}
		}

        setTimeout(function()
        {
            cb(pageURLs);
        }, 0);
    }); 
}

SlightSync.BaseCommunicator = function(baseUrl, isMaster, slideSetID)
{
	var m_baseUrl = baseUrl;
	var m_isMaster = isMaster;
	var m_slideSetID = slideSetID;

    var getSlightSyncURL = function(cmdName, value)
    {
        return SlightSync.getSlightSyncURL(m_baseUrl, m_slideSetID, cmdName, value)
    }

	this.postPage = function(pageNumber)
	{
		var url = getSlightSyncURL("post", pageNumber);

		NetworkConnection.get(url);
	}

	this.postMousePos = function(pageNumber, x, y)
	{
		var posValue = pageNumber + "_" + x + "_" + y;
		var url = getSlightSyncURL("mouse", posValue);

		NetworkConnection.get(url);
	}

	this.postSlaveActivity = function(s)
	{
		if (!m_isMaster)
			return;

		var value = "0";

		if (s)
			value = "1";

		var url = getSlightSyncURL("activate", value);

		NetworkConnection.get(url);
	}
	
	this.requestPageNumber = function(numberCallBack)
	{
		var url = getSlightSyncURL("get");

		NetworkConnection.get(url, function(response) 
		{ 
		    //console.log(response);
		    numberCallBack(response);
		});
	}
}

function getCurrentTimeSeconds()
{
	var s = new Date().getTime() / 1000;

	return s;
}

SlightSync.GAEController = function(baseUrl, isMaster, slideSetID, channelToken)
{
    var _this = this;
	var m_baseCommunicator = new SlightSync.BaseCommunicator(baseUrl, isMaster, slideSetID);
	var m_pollTimerDiscrete = null;
	var m_prevPageTime = 0;
	var m_prevMouseId = null;
	var m_firstMouseEntry = true; // need this in poll mode
	var m_init = false;
	var m_channelToken = channelToken;
	var m_numPages = -1;
	var m_continuousRequestSuccess = false;
	
	var m_latestActivity = getCurrentTimeSeconds();
	var m_lastLocalActivity = getCurrentTimeSeconds();
	var m_prevRequestTime = 0;

	// TODO: this can probably be a lot less complex now
	this._processResponseText = function(fullResponse)
	{
        var retVal = false;

		slightLog("Controller: Server response: " + fullResponse);

        try
        {
            var slideData = JSON.parse(fullResponse);
        }
        catch(e)
        {
            slightLog("Constroller: Unable to interpret as JSON");
            return;
        }

        try
        {
            var pageInfo = slideData.page;
            
            var num = pageInfo.number;
            var pageTime = pageInfo.time;

            // TODO: or >= ?
            if (pageTime > m_prevPageTime)
            {
                m_latestActivity = getCurrentTimeSeconds();

                m_prevPageTime = pageTime;
                slightLog("Controller: setting current page to " + num);
                this.onCurrentPageNumber(num);
            }

            retVal = true;
        }
        catch(e)
        {
            slightLog("Controller: Warning in page data: " + e);
        }

        try
        {
            var mouseInfo = slideData.mouse;

			var id = mouseInfo.id;
            var mousePage = mouseInfo.page;
            var x = mouseInfo.x;
            var y = mouseInfo.y;

            if (m_prevMouseId === null || id != m_prevMouseId)
            {
                m_latestActivity = getCurrentTimeSeconds();

                m_prevMouseId = id;

                if (!m_firstMouseEntry) // in poll mode, we'll ignore the first entry
                {
                    slightLog("Controller: setting mouse click to " + mousePage + " " + x + " " + y);
                    this.onShowMouseClick(mousePage, x, y);
                }
                m_firstMouseEntry = false;
            }
        }
        catch(e)
        {
            slightLog("Controller: Warning in mouse data: " + e);
        }

        try 
        {
            var num = slideData.activation;

			slightLog("Controller: setting slave active to " + num);
			this.onSetSlaveControlActive((num == 1)?true:false);
        }
        catch(e)
        {
            slightLog("Controller: Warning in activity data: " + e);
        }

		slightLog("Controller: Done analyzing server response");
        return retVal;
	}

	this._onCurrentPageAndMouse = function(response)
	{
		this._processResponseText(response);
	}

	this._onChannelOpen = function()
	{
		console.log("channel open");
	}

	this._onChannelClose = function()
	{
		//alert("Channel closed");
		console.log("Controller: channel closed, reverting to poll method");
		m_continuousRequestSuccess = false;
	}

	this._onChannelError = function()
	{
		//alert("Channel error");
		console.log("Controller: channel error, reverting to poll method");
		m_continuousRequestSuccess = false;
	}

	this._onChannelMessage = function(msg)
	{
		slightLog("Controller: got message on channel: " + msg);
		if (this._processResponseText(msg.data))
			m_continuousRequestSuccess = true;
	}

	this._setupChannel = function()
	{
		var channel = new goog.appengine.Channel(m_channelToken);

		handlers = { }
		handlers.onopen = function() { _this._onChannelOpen(); }
		handlers.onclose = function() { _this._onChannelClose(); }
		handlers.onerror = function() { _this._onChannelError(); }
		handlers.onmessage = function(msg) { _this._onChannelMessage(msg); }

		var socket = channel.open(handlers);
	}

	this._pollCurrentPage = function()
	{
		var cur = getCurrentTimeSeconds();

		var remoteActTimeout = false;
		var localActTimeout = false;

		if (cur - m_latestActivity > 10.0*60.0) // Ten minutes of remote inactivity can trigger a lower poll rate
			remoteActTimeout = true;

		if (cur - m_lastLocalActivity > 2.0*60.0) // purely local activity causes a higher poll rate for at least 2 mins
			localActTimeout = true;

		// make sure we poll at a much lower rate if there hasn't been activity
		if (localActTimeout && remoteActTimeout)
		{
			if (cur - m_prevRequestTime < 15.0) // only check every 15 seconds in that case
				return;
		}

		if (!m_continuousRequestSuccess || (cur - m_prevRequestTime) > 3.0) // backup poll every three seconds
		{
			//console.log("polling at time " + cur + " latest " + m_latestActivity + " req " + m_prevRequestTime);
			m_baseCommunicator.requestPageNumber(function(num) { _this._onCurrentPageAndMouse(num); });
			m_prevRequestTime = cur;
		}
	}

	this.init = function(pages, initReadyCb, initErrorCb)
	{
		if (m_init)
			throw "SlightSync.GAEController: already called init";

		m_init = true;


        // TODO: is this still necessary with the channel API?
        var ua = navigator.userAgent;
        var isiPad = /iPad/i.test(ua) || /iPhone OS 3_1_2/i.test(ua) || /iPhone OS 3_2_2/i.test(ua);

        // For iPad, the continuous connection seems to be a problem
        if (!isiPad)
            this._setupChannel();

		m_pollTimerDiscrete = setInterval(function() { _this._pollCurrentPage(); }, 500);
		m_firstMouseEntry = true;
		m_numPages = pages.length;

        setTimeout(function() { initReadyCb(); }, 0);
	}

	this.getNumberOfPages = function()
	{
		return m_numPages;
	}

	this.postPage = function(pageNumber)
	{
		m_latestActivity = getCurrentTimeSeconds();
		m_baseCommunicator.postPage(pageNumber);
	}

	this.postMousePos = function(pageNumber, x, y)
	{
		m_latestActivity = getCurrentTimeSeconds();
		m_baseCommunicator.postMousePos(pageNumber, x, y);
	}

	this.postSlaveActivity = function(s)
	{
		m_latestActivity = getCurrentTimeSeconds();
		m_baseCommunicator.postSlaveActivity(s);
	}

	this.onCurrentPageNumber = function(num)
	{
		console.log("SlightSync.GAEController.onCurrentPageNumber: override this");
		console.log(num);
	}

	this.onShowMouseClick = function(pageNumber, x, y)
	{
		console.log("SlightSync.GAEController.onShowMouseClick: override this");
		console.log(pageNumber + " " + x + " " + y);
	}

	this.onSetSlaveControlActive = function(flag)
	{
		console.log("SlightSync.GAEController.onSetSlaveControlActive: override this");
		console.log(flag);
	}

    this.onFatalError = function(msg)
    {
        console.log("SlightSync.GAEController.onFatalError: override this");
        console.log(msg);
    }
	
    this.onNumParticipants = function(num)
    {
        console.log("SlightSync.GAEController.onNumParticipants: override this");
        console.log(msg);
    }

	this.localActivity = function()
	{
		m_lastLocalActivity = getCurrentTimeSeconds();
	}
}

SlightSync.WebSocketController = function(baseUrl, isMaster, rsaPubKey, rsaPrivKey, wsUrl)
{
    var _this = this;

	var m_init = false;
	var m_numPages = -1;
    var m_rsaPubKey = rsaPubKey;
    var m_rsaPrivKey = rsaPrivKey;
    var m_rsa = null;
    var m_wsUrl = wsUrl;
    var m_sock = null;
    var m_lastPage = null;
    
    var m_pingTimer = 0;
    var m_lastRecvTime = null;

    var m_connectionSucceeded = false;

    this.didConnectionSucceed = function()
    {
        return m_connectionSucceeded;
    }

	this.init = function(pages, initReadyCb, initErrorCb)
	{
		if (m_init)
			throw "SlightSync.WebSocketController: already called init";

        if (isMaster)
        {
            m_rsa = new RSAKey();
            try 
            {
                m_rsa.readPrivateKeyFromPEMString(m_rsaPrivKey);
            }
            catch(e)
            {
                throw "SlightSync.WebSocketController: unable to use specified RSA key"; 
            }
        }
        else
            m_rsa = null;

        console.log("Creating websocket");
        /*var */ sock = new WebSocket(m_wsUrl);
        sock.onopen = function()
        {
            m_connectionSucceeded = true;

            console.log("WebSocket connected");
            // Send the public key, which will also be used as an identifier
            var msg = { "publicKey": m_rsaPubKey };
            sock.send(JSON.stringify(msg));

            m_pingTimer = setInterval(function()
            {
                slightLog("Sending ping to server");
                var pingMsg = { "ping": "ping" };
                sock.send(JSON.stringify(pingMsg));

                if (m_lastRecvTime !== null && Date.now() - m_lastRecvTime > 60000) // nothing was heard for 60 secs
                {
                    setTimeout(function() { sock.close(); sock.onclose(null); }, 0);
                }
            }, 5000);

            setTimeout(function() { initReadyCb(); }, 0);
        }
        sock.onclose = function(evt)
        {
            if (m_sock != sock)
                return;

            console.log("WebSocket closed");
            console.log(evt);

            if (m_pingTimer !== null)
            {
                try { clearInterval(m_pingTimer); } catch(e) { }
                m_pingTimer = null;
            }
            m_sock = null;

            var msg = "";
            if (m_connectionSucceeded)
                msg = "Lost WebSocket connection with synchronization server";
            else
                msg = "Unable to start WebSocket connection with specified synchronization server";

            setTimeout(function() { initErrorCb(msg); }, 0);
        }
        /*
        sock.onerror = function(e)
        {
            console.log("WebSocket error");

            if (m_pingTimer !== null)
            {
                try { clearInterval(m_pingTimer); } catch(e) { }
                m_pingTimer = null;
            }
            sock.close();
            m_sock = null;

            setTimeout(function() { initErrorCb("Error in WebSocket connection with server"); }, 0);
        }
        */
        sock.onmessage = _onWebSocketMessage;

		m_init = true;
		m_numPages = pages.length;
        m_sock = sock;
	}

	this.getNumberOfPages = function()
	{
		return m_numPages;
	}

    var postObject = function(o)
    {
        var msg = JSON.stringify(o);
        var obj = { "message": msg };

        if (m_rsa) // Always sign if possible
        {
            var sig = m_rsa.signString(msg, "sha256");
            obj["signature"] = sig;
        }

        if (!m_sock)
            setTimeout(function() { _this.onFatalError("No connection with synchronization WebSocket server\n(local viewing may still be possible)"); }, 0);
        else
        {
            var msgObj = JSON.stringify(obj);
            m_sock.send(msgObj);
            slightLog("Sent: " + msgObj);
        }
    }

	this.postPage = function(pageNumber)
	{
        postObject({ "page": pageNumber });
	}

	this.postMousePos = function(pageNumber, x, y)
	{
        postObject({ "page": pageNumber, "mouseX": x, "mouseY": y });
	}

	this.postSlaveActivity = function(s)
	{
        postObject({ "allAccess": s });
	}

	this.localActivity = function()
	{
        // Not needed
	}

    var _onWebSocketMessage = function(msg)
    {
        slightLog("WebSocket message: " + msg.data);
        m_lastRecvTime = Date.now();

        var data = msg.data;
        var obj = JSON.parse(data);
        if ("message" in obj)
            obj = JSON.parse(obj["message"]);

        if ("page" in obj)
        {
            m_lastPage = obj["page"];
            _this.onCurrentPageNumber(obj["page"]);
        }
        if (("mouseX" in obj) && ("mouseY" in obj))
        {
            _this.onShowMouseClick(m_lastPage, obj["mouseX"], obj["mouseY"]);
        }
        if ("allAccess" in obj)
        {
            _this.onSetSlaveControlActive(obj["allAccess"]);
        }
        if ("numConnections" in obj)
        {
            _this.onNumParticipants(obj["numConnections"]);
        }
    }

	this.onCurrentPageNumber = function(num)
	{
		console.log("SlightSync.WebSocketController.onCurrentPageNumber: override this");
		console.log(num);
	}

	this.onShowMouseClick = function(pageNumber, x, y)
	{
		console.log("SlightSync.WebSocketController.onShowMouseClick: override this");
		console.log(pageNumber + " " + x + " " + y);
	}

	this.onSetSlaveControlActive = function(flag)
	{
		console.log("SlightSync.WebSocketController.onSetSlaveControlActive: override this");
		console.log(flag);
	}
	
    this.onFatalError = function(msg)
    {
        console.log("SlightSync.WebSocketController.onFatalError: override this");
        console.log(msg);
    }

    this.onNumParticipants = function(num)
    {
        console.log("SlightSync.WebSocketController.onNumParticipants: override this");
        console.log(msg);
    }
}


