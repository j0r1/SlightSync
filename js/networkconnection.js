NetworkConnection = function()
{
	var m_callBack = null;
	var m_xhr = null;
	var m_data = null;
	var m_this = this;

	var getIdentifier = function(len)
	{
		var str = "";
		var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

		for(var i = 0 ; i < len ; i++ )
			str += chars.charAt(Math.floor(Math.random() * chars.length));

		return str;
	}

	this.open = function(URL, contentType, data, callBack, method, arraybuffer, cache)
	{
		if (m_xhr !== null)
			throw "NetworkConnection.open: already opening a connection";

		var m = "";

		if (typeof(method) === 'undefined') 
			m = "POST";
		else
			m = method;

		m_data = data;
		m_callBack = callBack;
		request(URL, contentType, m, arraybuffer, cache);
	}

	var request = function(URL, contentType, method, arraybuffer, cache)
	{
		m_xhr = new XMLHttpRequest();
        m_xhr.m_aborted = false;
    
		m_xhr.dateId = getIdentifier(8);

		slightLog("NetworkConnection: Performing " + method + " with id " + m_xhr.dateId + " for URL " + URL);

		m_xhr.open(method, URL, true);
        if (!cache)
		    m_xhr.setRequestHeader("Cache-Control", "no-cache");
		if (contentType)
			m_xhr.setRequestHeader("Content-Type", contentType);

		m_xhr.onreadystatechange = function()
		{
            if (m_xhr.m_aborted)
                return;

			slightLog("NetworkConnection: Got response for " + this.dateId);
			slightLog("   readyState: " + this.readyState);
			slightLog("   response code: " + this.status);
			slightLog("   response statusText: " + this.statusText);

			if (m_xhr == null) // already handled this
			{
				slightLog("NetworkConnection: Already handled response for this id, ignoring");
				return;
			}

			if (m_xhr.readyState == 4) // done
			{
				slightLog("NetworkConnection: Response is " + m_xhr.status + " " + m_xhr.statusText);

				if (m_callBack)
                {
                    var response = null;
                    if (m_xhr.responseType == "arraybuffer")
                        response = m_xhr.response;
                    else
                        response = m_xhr.responseText;

					m_callBack(m_xhr.status, m_xhr.statusText, response, m_this);
                }

				m_xhr = null;
			}
		};

        if (arraybuffer)
        {
            m_xhr.responseType = 'arraybuffer';
        }

        try
        {
		    m_xhr.send(m_data);
        }
        catch(e)
        {
            if (m_callBack)
            {
                var cb = m_callBack;

                setTimeout(function()
                {
                    cb(-1, "" + e, "", m_this);
                }, 0);
            }
        }
	}

	this.get = function(url, callback, arraybuffer, cache)
	{
		this.open(url, null, null, function(statusCode, statusText, response, instance)
		{
			if (callback)
				callback(response, statusCode, statusText, instance);
		}, "GET", arraybuffer, cache);
	}

	this.post = function(url, data, callback, arraybuffer, cache)
	{
		var query = "";	

		if (typeof(data) == 'object')
			query += NetworkConnection.objToPostString(data);
		else
			query += "" + data;

		//console.log(query);

		this.open(url, "application/x-www-form-urlencoded", query, function(statusCode, statusText, response, instance)
		{
			if (callback)
				callback(response, statusCode, statusText, instance);
		}, "POST", arraybuffer, cache);
	}

    this.abort = function()
    {
        if (m_xhr)
        {
            if (!m_xhr.m_aborted)
            {
                m_xhr.m_aborted = true;
                m_xhr.abort();
            }
        }
    }
}

NetworkConnection.get = function(url, callback, arraybuffer, cache)
{
	var n = new NetworkConnection();

	n.get(url, callback, arraybuffer, cache);
    return n;
}

NetworkConnection.objToPostString = function(d)
{
	var count = 0;
	var s = "";

	for (var p in d)
	{
		var name = p;

		if (count != 0)
			s += "&";

		s += encodeURIComponent(name);
		s += "=";
		s += encodeURIComponent("" + d[p]);
		count++;
	}

	return s;
}

NetworkConnection.post = function(url, data, callback, arraybuffer, cache)
{
	var n = new NetworkConnection();

	n.post(url, data, callback, arraybuffer, cache);
    return n;
}

