function getBaseURL()
{
	var thisUrl = document.URL;
	var idx = thisUrl.lastIndexOf("/");
	var base = thisUrl.substring(0, idx+1);

	return base;
}

function startsWith(s, prefix, caseInsensitive)
{
	if (prefix.length == 0)
		return false;

    if (!caseInsensitive)
    {
	    if (s.substring(0, prefix.length) == prefix)
		    return true;
    }
    else
    {
	    if (s.substring(0, prefix.length).toLowerCase() == prefix.toLowerCase())
		    return true;
    }
	return false;
}

function calcWidthHeightForContainer(curWidth, curHeight, containerWidth, containerHeight)
{
	if (curWidth <= 0)
		curWidth = 1;
	if (curHeight <= 0)
		curHeight = 1;

	var windowWidth = containerWidth;
	var windowHeight = containerHeight;
	var w = windowWidth;
	var h = w*(curHeight/curWidth);

	if (h > windowHeight)
	{
		h = windowHeight;
		w = h*(curWidth/curHeight);
	}
	
	var retVal = { };

	retVal.width = w;
	retVal.height = h;

	return retVal;
}

var _slightLogEnabled = false;

function setSlightLogging(flag)
{
	_slightLogEnabled = flag;
}

function isSlightLoggingEnabled()
{
	return _slightLogEnabled;
}

function slightLog(x)
{
	if (_slightLogEnabled)
		console.log(x);
}

function textToHTML(text)
{
	return ((text || "") + "")  // make sure it's a string;
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\t/g, "    ")
		.replace(/ /g, "&#8203;&nbsp;&#8203;")
		.replace(/\r\n|\r|\n/g, "<br />");
}

function getQRImage(width, url, title, noborder)
{
    var canvas = document.createElement("canvas");
    var qrImg = null;
    var qr = null;
    var start = 0;
    var qrBits = [0,152,272,440,640,864,1088,1248,1552,1856,2192,2592,2960,3424,3688,4184,4712,5176,5768,6360,6888,7456,8048,8752,9392,10208,10960,11744,12248,13048,13880,14744,15640,16568,17528,18448,19472,20528,21616,22496,23648];
    
    while (start < qrBits.length && qrBits[start] < url.length*8)
        start++;

    for (var i = start ; i < 41 ; i++)
    {
        try
        {
            qr = qrcode(i, 'L');
            qr.addData(url);
            qr.make();
            qr.drawOnCanvas(16, canvas, !noborder);
            break;
        }
        catch(e)
        {
            qr = null;
            console.log("Need to increase bits for QR tag: " + e);
        }
    }
    if (qr == null)
    {
        console.log("Unable to create QR tag!");

        canvas.width = width;
        canvas.height = width;
        var ctx = canvas.getContext("2d");

        ctx.rect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = "black";
        ctx.fill();

        ctx.fillStyle = "white";
        ctx.font = "20px Helvetica";
        ctx.fillText("Unable to create QR tag, URL too long?", 0, 50);
    }

    qrImg = new Image();
    qrImg.src = canvas.toDataURL('image/png');
    qrImg.width = width;
    qrImg.height = width;
    qrImg.linkedUrl = url;
    qrImg.title = title + " slides";

    return qrImg;
}

function attachQRandURLs(d, slideID, socketServer, title, closeAction, url, noQR)
{
    url = url || document.location.origin + "/slightsync.py?id=" + slideID;
    if (socketServer.length > 0)
        url += "&server=" + socketServer;

    var qrImg = null;
    if (!noQR)
    {
        qrImg = getQRImage(512, url, title);

        if (closeAction !== undefined)
            qrImg.setAttribute("onclick", closeAction); 
    }

	// 'd' is the div for the dialog box

	var tr = null;
	var td = null;
	var span = null;
	var inp = null;
	var openBtn = null;
	var table = document.createElement("table");
	d.appendChild(table);
	table.style.border = "0px";
	table.style.margin = "0px";
	table.style.padding = "0px";
	table.style.marginLeft = "auto";
	table.style.marginRight = "auto";
	table.style.borderCollapse = "collapse";

	tr = document.createElement("tr");
	table.appendChild(tr);
	tr.style.border = "0px";
	tr.style.margin = "0px";
	tr.style.padding = "0px";

	td = document.createElement("td");
	tr.appendChild(td);
	td.style.border = "0px";
	td.style.margin = "0px";
	td.style.padding = "0px";
	td.style.textAlign = "right";

	span = document.createElement("span");
	td.appendChild(span);

	span.style.fontSize = "10px";
	span.innerHTML = title + " URL:";

	td = document.createElement("td");
	tr.appendChild(td);
	td.style.border = "0px";
	td.style.margin = "0px";
	td.style.padding = "0px";

	inp = document.createElement("input");
	td.appendChild(inp);
	inp.setAttribute("type", "text");
	inp.setAttribute("readonly","readonly");
	inp.setAttribute("size", "80");
	inp.setAttribute("value", url);
	inp.style.fontSize = "10px";

	td = document.createElement("td");
	tr.appendChild(td);
	td.style.border = "0px";
	td.style.margin = "0px";
	td.style.padding = "0px";

	openBtn = document.createElement("button");
	td.appendChild(openBtn);
	openBtn.innerHTML = "Open URL";
	openBtn.style.fontSize = "10px";
	openBtn.setAttribute("onclick", "window.open('" + url + "','_blank');");

	td = document.createElement("td");
	tr.appendChild(td);
	td.style.border = "0px";
	td.style.margin = "0px";
	td.style.padding = "0px";

	if (typeof(closeAction) != 'undefined')
	{
		var closeBtn = document.createElement("button");
		td.appendChild(closeBtn);
		closeBtn.innerHTML = "Close dialog";
		closeBtn.style.fontSize = "10px";
		closeBtn.setAttribute("onclick", closeAction);
	}

	d.appendChild(document.createElement("br"));
    
    if (qrImg)
	    d.appendChild(qrImg);

	return qrImg;
}

function listURLS(elemID, slideIDs, title, images, socketServer)
{
	var elem = document.getElementById(elemID);

	//console.log(elem);
	//console.log(slideIDs);

	for (var i = 0 ; i < slideIDs.length ; i++)
	{
		//console.log(i);

		var btn = document.createElement("button");
		btn.innerHTML = "Show&nbsp;QR&nbsp;code&nbsp;and&nbsp;URL";

		var d = document.createElement("div");
		
		d.style.display = "none";
		d.style.textAlign = "center";

		elem.appendChild(btn);
		elem.appendChild(d);

        if (!(socketServer && socketServer.length > 0))
            socketServer = "";

		var retImg = attachQRandURLs(d, slideIDs[i], socketServer, title);
		
		if (typeof(images) != 'undefined' && images != null)
		{
			numImages = images.length;
			images[numImages] = retImg;
		}

		btn.dlgdiv = d;
		btn.dlgtitle = title + " slides";
		btn.setAttribute("onclick", "Modalbox.show(this.dlgdiv, { width:800, height: 640, title: this.dlgtitle }); Modalbox.resizeToContent(); ");
	}
}
		
function defaultLoginLogout(url)
{
	window.location=url;
}

