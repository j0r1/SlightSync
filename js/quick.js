var currentNetworkConnection = null;
var currentWorker = null;

function onCancel()
{
    try { if (currentNetworkConnection) currentNetworkConnection.abort(); } catch(e) { console.log("Unable to abort existing networkconnection: " + e); }
    currentNetworkConnection = null;

    Modalbox.hide();
}

function getOrigin()
{
    var orig = window.location.origin;
    var path = window.location.pathname;
    var startIdx = path.length-1;

    while (path[startIdx] != '/')
        startIdx--;

    return orig + path.substr(0, startIdx);
}

// TODO: test websocket connection
function onHavePDF(url, serverurl)
{
    var worker = new Worker("js/keypairworker.js");
    currentWorker = null;

    setGeneratingStatus("Generating public/private keypair");
    worker.onmessage = function(e)
    {
        var msg = e.data;
        var $ = jQuery;
        var masterObj = {
            "pdfUrl": url,
            "serverUrl": serverurl,
            "privKey": msg.privKey,
        };

        var slaveObj = {
            "pdfUrl": url,
            "serverUrl": serverurl,
            "pubKey": msg.pubKey,
        };

        var masterId = btoa(JSON.stringify(masterObj));
        var slaveId = btoa(JSON.stringify(slaveObj));

        //console.log(masterId);
        //console.log(slaveId);

        var origin = getOrigin();
        var masterUrl = origin + "/sync.html#id=" + encodeURIComponent(masterId);
        var slaveUrl = origin + "/sync.html#id=" + encodeURIComponent(slaveId);

        $("#masterurl").val(masterUrl);
        $("#slaveurl").val(slaveUrl);
        $(".defaultHidden").show();

        $("#masterqrdiv").empty();
        $("#masterqrdiv").append(getQRImage(512, masterUrl, "Master"));

        $("#slaveqrdiv").empty();
        $("#slaveqrdiv").append(getQRImage(512, slaveUrl, "Slave"));

        localStorage["lastServer"] = serverurl;
        
        Modalbox.hide()
    }

    worker.postMessage("GenerateKeypair");
}

function setGeneratingStatus(txt)
{
    var elem = document.getElementById("generatestatus");
    elem.innerHTML = "Status: " + textToHTML(txt);
    setTimeout(function() { Modalbox.resizeToContent(); }, 0);
}

function generateUrls2()
{
    Modalbox.show($('generatingdlg'), 
            { 
                width: 600, 
                /* height: 150, */ 
                title: "Generating URLs...", 
                inactiveFade: false,
			    transitions: false,
            });
	Modalbox.deactivate();

    var url = jQuery("#pdfurl").val();
    var server = jQuery("#serverurl").val();

    if (!(startsWith(server, "ws://", true) || startsWith(server, "wss://", true)))
    {
        if (document.location.protocol == "https:")
            server = "wss://" + server;
        else 
            server = "ws://" + server;
    }

    var startDownloading = function()
    {
        setGeneratingStatus("Downloading file");
        // See if we need to modify the URL first
        var replaceParts = [ [ "https://www.dropbox.com/", "https://dl.dropboxusercontent.com/" ] ];

        for (var i = 0 ; i < replaceParts.length ; i++)
        {
            var start = replaceParts[i][0];
            var repl = replaceParts[i][1];

            if (startsWith(url, start, true))
            {
                url = repl + url.substr(start.length);
                break;
            }
        }

        // Download it
        if (currentNetworkConnection)
        {
            try { currentNetworkConnection.abort(); } catch(e) { console.log("Unable to abort existing networkconnection: " + e); }
            currentNetworkConnection = null;
        }

        currentNetworkConnection = NetworkConnection.get(url, function(data, statusCode, statusText, networkConn)
        {
            if (networkConn != currentNetworkConnection) // from another request, ignore
                return;

            currentNetworkConnection = null;

            if (statusCode != 200)
            {
                var msg = "Error downloading data: Code " + statusCode;
                if (statusText.trim().length > 0)
                    msg += ", " + statusText;

                if (statusCode == 0)
                    msg += " (cross-origin error?)";

                setGeneratingStatus(msg);
                return;
            }

            setGeneratingStatus("Interpreting file as PDF");
            PDFJS.getDocument(data).then(function(pdf)
            {
                console.log("Got PDF, number of pages: " + pdf.numPages);
                setTimeout(function() { onHavePDF(url, server); }, 0);
            },
            function(reason) // something went wrong
            {
                console.log("Couldn't load PDF: " + reason);
                setGeneratingStatus("Unable to interpret data as PDF: " + reason);
            });
        }, true, true);
    }

    if (jQuery("#conncheck").is(":checked"))
    {
        setGeneratingStatus("Checking sync server");
        try
        {
            var w = new WebSocket(server);
        }
        catch(e)
        {
            setGeneratingStatus("Error creating WebSocket: " + e);
            return;
        }
        w.onopen = function() 
        { 
            w.succeeded = true;
            w.onerror = null; // No longer interested
            w.close();

            startDownloading(); 
        }
        w.onerror = function(e)
        {
            try { w.close(); } catch(e) { }
            setGeneratingStatus("Error establishing connection to sync server (it may help to click the link to the left, e.g. to accept a certificate).");
        }
        
        w.succeeded = false;
    }
    else
        setTimeout(startDownloading, 0);
}

function validateUrl(url)
{
    if (url.length == 0)
        return false;

    if (!startsWith(url, "http://", true) && !startsWith(url, "https://", true))
    {
        vex.dialog.alert("The specified URL does not start with http:// or https://");
        return false;
    }

    return true;
}

function generateUrls()
{
    var $ = jQuery;
    var url = $("#pdfurl").val().trim();

    if (!validateUrl(url))
        return;

    if (!$(".defaultHidden").is(':hidden'))
    {
        vex.dialog.confirm({
            message: "This will overwrite the previously generated URLs, continue?",
            callback: function(value) 
            {
                if (value)
                {
                    setTimeout(function() 
                    { 
                        $(".defaultHidden").hide();
                        generateUrls2(); 
                    }, 0);
                }
            }
        });
    }
    else
        generateUrls2();
}

function openUrl(url)
{
    url = url.trim();

    var replacePref = [ [ "ws://", "http://" ], [ "wss://", "https://" ] ];
    for (var i = 0 ; i < replacePref.length ; i++)
    {
        var pref = replacePref[i][0];
        var repl = replacePref[i][1];
        
        if (startsWith(url, pref, true))
        {
            url = repl + url.substr(pref.length);
            break;
        }
    }

    if (!(startsWith(url, "https://", true) || startsWith(url, "http://", true) || startsWith(url, "ftp://", true) ||
          startsWith(url, "ws://", true) || startsWith(url, "wss://", true)))
    {
        if (document.location.protocol == "https:")
            url = "https://" + url;
        else
            url = "http://" + url;
    }

    if (!validateUrl(url))
        return;

    window.open(url, '_blank');
}

function getTinyUrl(url)
{
    var tUrl = "https://tinyurl.com/create.php?source=indexpage&url=" + encodeURIComponent(url) + "&submit=Make+TinyURL%21&alias=";
    return tUrl;
}

function showQR(id, title)
{
    Modalbox.show($(id), { width: 600, height: 600, title: title });
}

function copyToClipboard(text) 
{
      window.prompt("Copy to clipboard: Ctrl+C, Enter", text);
}

function showFs(img)
{
    $(img).show();

    console.log(img);
    var elem = img;
    if (elem.requestFullscreen) {
        elem.requestFullscreen();
    } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
        elem.mozRequestFullScreen();
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    }
}

var onFullScreenChange = function(evt)
{
    var $ = jQuery;
    console.log("onFullScreenChange");
    
    var elem = document.fullScreenElement || document.mozFullScreenElement || document.webkitFullscreenElement;
    
    if (!elem) 
    {
        // We've left full screen mode
        $("#imgdropbox1").hide();
        $("#imgdropbox2").hide();
        $("#imgcopy1").hide();
        $("#imgcopy2").hide();
        return;
    }
}

function main()
{
	// The light bulb above the 'i' in the header, let's start with the PNG version 
	// and replace it with the SVG if supported
    var $ = jQuery;
	var bulbElem = document.getElementById("bulbelem");

	bulbElem.style.backgroundImage = "url('img/i.png')";
	bulbElem.style.backgroundSize = "17px 40px";
    bulbElem.style.backgroundPosition = "0px 5px";

	var tstImg = new Image();

	tstImg.onload = function() 
	{
		var elem = document.getElementById("bulbelem");

		elem.style.backgroundImage = "url('img/i.svg')";
	}

	tstImg.src = "img/i.svg";

    var qrImg = getQRImage(256, document.URL, "", true);
    $("#qrdiv").append(qrImg);

    if ("lastServer" in localStorage)
    {
        var ls = localStorage["lastServer"];

        if (ls != "wss://slightsockcast.sloppy.zone" && ls != "ws://slightsockcast.sloppy.zone" &&
            ls != "slightsockcast.sloppy.zone")
            $("#serverurl").val(ls)
    }

    $(document).on('webkitfullscreenchange mozfullscreenchange fullscreenchange MSFullscreenChange', onFullScreenChange);

    $("#loadingdiv").hide();
    $("#maindiv").show();
    $("#pdfurl").focus();
}
