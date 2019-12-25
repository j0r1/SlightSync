var loadedSlidesID = "";
var isMaster = false;
var masterId = "";
var slaveId = "";
var rsaPubKey = undefined;
var rsaPrivKey = undefined;
var socketServer = undefined;
var isDefaultSocketServer = 1;
var slavesActive = false;

var slideController = null; 
var slideControls = null;
var slideDisplay = null;

var buttonsHeight = -1;
var dimensionsChanged = false;
var controlsDisplayed = false;

var ignoreMouseMove = false;

var lastReceivedPageNumber = 0;
var unSynced = false;

var lastNumberOfParticipants = 0;

function replaceAll(str, search, replacement)
{
    return str.split(search).join(replacement);
}

var vexAlertID = null;

function vexAlert(msg)
{
    if (vexAlertID !== null)
        vex.close(vexAlertID.data().vex.id);

    var opts = {
        message: replaceAll(msg, "\n", "<br>"),
        callback: function()
        {
            vexAlertID = null;
        }
    }
    vexAlertID = vex.dialog.alert(opts);
}

function vexHelp(msg)
{
    if (vexAlertID !== null)
        vex.close(vexAlertID.data().vex.id);

    var opts = {
        contentCSS: { width: "50%" },
        message: '<h3>Help</h3>',
        input: msg,
        callback: function()
        {
            vexAlertID = null;
        }
    }
    vexAlertID = vex.dialog.alert(opts);
}

function showMouseClick(pg, x, y)
{
	if (!unSynced)
	{
		if (slideDisplay)
			slideDisplay.displayBulb(pg, x, y);
	}
}

function displayPageNumber(num, bgColorOnly)
{
	var pageElem = document.getElementById("pagenumber");

    if (lastReceivedPageNumber == num)
        pageElem.style.backgroundColor = "#ffffff";
    else
        pageElem.style.backgroundColor = "#ffd0d0";

    if (!bgColorOnly)
	    pageElem.value = "" + (num+1);
}

window.onresize = function onResizeWindow(evt) 	
{ 
	onAdjustImageDimensions(); 
}

function onZoomFactor(z)
{
	onAdjustImageDimensions(); 
}

function adjustSlaveStatusIndicator()
{
	var elem = document.getElementById("actbox");
	elem.innerHTML = (slavesActive)?"Yes":"No";
	elem.style.color = (slavesActive)?"#00aa00":"#aa0000";
}

function onShowButtons()
{
	if (!controlsDisplayed)
	{
		controlsDisplayed = true;

		var w = (isMaster)?800:400;

		Modalbox.show($('buttons'),
		{
			title: null,
			width: w,
			height: 70,
			overlayDuration: 0,
			overlayOpacity: 0,
			slideUpDuration: 0,
			resizeDuration: 0,
			transitions: false,
		});

		if (slideDisplay != null)
		{
			displayPageNumber(slideDisplay.getDisplayedPage());
			document.getElementById("numpages").value = "" + slideDisplay.getNumberOfPages();
		}

		adjustSlaveStatusIndicator();

		if (!isMaster)
		{
			if (slavesActive || unSynced)
			{
				showElements(["prevbtn", "nextbtn", "gobtn"] , true);
				setReadOnly("pagenumber", false);
			}
			else
			{
				showElements(["prevbtn", "nextbtn", "gobtn"] , false);
				setReadOnly("pagenumber", true);
			}
		}

        if (lastNumberOfParticipants > 0)
            document.getElementById("numparticipants").innerHTML = "" + lastNumberOfParticipants;

		//Modalbox.resizeToContent();
		buttonsHeight = Modalbox.MBwindow.getHeight();
		Modalbox.MBcontent.setStyle({overflow: 'hidden'});
	}
}

function onHideButtons()
{
	if (controlsDisplayed)
	{
		controlsDisplayed = false;
		Modalbox.hide();
	}
}

// show or hide the buttons depending on the mouse position
function onMouseMove(evt)
{
    showMouse();

	if (ignoreMouseMove)
		return;

	var y = evt.clientY;

	if (y < buttonsHeight)
		onShowButtons();
	else
		onHideButtons();
}

// The following three functions request that a specific page
// is displayed
function onPrevious()
{
	if (slideDisplay == null)
		return;

	var curPage = slideDisplay.getCurrentPage()+1;

	onGoToPage(curPage-1);
}

function onNext()
{
	if (slideDisplay == null)
		return;

	var curPage = slideDisplay.getCurrentPage() + 1;

	onGoToPage(curPage+1);
}

function onKeyHome()
{
	onGoToPage(1);	
}

function onKeyEnd()
{
	if (slideDisplay == null)
		return;

	var numPages = slideDisplay.getNumberOfPages();

	onGoToPage(numPages);
}

function onQuietToggle()
{
	if (slideDisplay == null)
		return;

    var isQuiet = slideDisplay.isQuiet();
    slideDisplay.setQuiet(!isQuiet);

    console.log("Quiet = " + slideDisplay.isQuiet());
}

function onSyncToggle()
{
	if (slideDisplay == null)
		return;

	if (unSynced)
	{
		unSynced = false;
		slideDisplay.clearBorder();
		
		slideDisplay.setCurrentPage(lastReceivedPageNumber);
		slideDisplay.refresh();
		displayPageNumber(lastReceivedPageNumber);
	}
	else
	{
		unSynced = true;
		slideDisplay.setBorder(5, "#ff0000");
		slideDisplay.refresh();
	}

	onSetSlaveControlActive(slavesActive); // This updates the controls

	if (unSynced)
		vexAlert("Sync disabled, viewing locally");
	else
		vexAlert("Sync enabled");

	slideController.localActivity();
}
	
function onGoToPage(formOrNumber)
{
	if (slideDisplay == null)
		return;

	try
	{
		var num = -1;

		if (typeof formOrNumber === "number")
			num = formOrNumber;
		else
			num = parseInt(formOrNumber.pagenumber.value);

		var curPage = slideDisplay.getCurrentPage();
		var numPages = slideDisplay.getNumberOfPages();

		num--;
		if (num >= 0 && num < numPages)
		{
            if (num != curPage)
            {
                if (unSynced)
                {
                    slideDisplay.setCurrentPage(num);
                }
                else 
                {
                    if (isMaster || slavesActive)
                    {
                        slideController.postPage(num);
                        slideDisplay.setCurrentPage(num);
                    }
                }
            }
			displayPageNumber(num);
		}
	
        slideController.localActivity();
	}
	catch(err)
	{
		vexAlert(err);
	}
}


// Make the image as large as possible, we'll need to perform the subfunction
// twice to get consistent results (otherwise the window width may account for
// a scroll bar)
function onAdjustImageDimensions()
{
	var zoomFactor = 1;
	if (slideControls) 
		zoomFactor = slideControls.getZoomFactor();

	if (zoomFactor > 1.0)
		document.body.style.overflow = "";
	else
		document.body.style.overflow = "hidden";

	var cnvs = document.getElementById("slidecanvas");

	var s = calcWidthHeightForContainer(cnvs.width, cnvs.height, window.innerWidth, window.innerHeight);

	var newWidth = Math.floor(s.width*zoomFactor);
	var newHeight = Math.floor(s.height*zoomFactor);

	if (newWidth < 1)
		newWidth = 1;
	if (newHeight < 1)
		newHeight = 1;

	// we'll scale the canvas using CSS, should be easier on memory

	cnvs.style.width = "" + newWidth + "px";
	cnvs.style.height = "" + newHeight + "px";
}

function onMouseClick(x, y)
{
    showMouse();

	if (slideDisplay == null)
		return;

	if (unSynced) // no bulbs in unsynced mode
		return;

	if (isMaster || slavesActive)
	{
		var curPage = slideDisplay.getCurrentPage();
		var dispPage = slideDisplay.getDisplayedPage();

		if (curPage >= 0 && curPage == dispPage) // make sure that the page is displayed, not loading some other
			slideController.postMousePos(curPage, x, y);
	}

	slideController.localActivity();
}

function onCurrentPageNumber(num)
{
	lastReceivedPageNumber = num; // store this for when sync is enabled again

	if (!unSynced)
	{
        if (slideDisplay)
        {
            var bgColorOnly = slideDisplay.getCurrentPage() == num;
			slideDisplay.setCurrentPage(num);

		    displayPageNumber(num, bgColorOnly);
        }
	}
}

function isKeyboardNavigationAllowed()
{
	if (unSynced)
		return true;
	if (isMaster)
		return true;
	if (slavesActive)
		return true;
	return false;
}

function onKeyboardNavigationStatus(enabled)
{
	if (enabled)
		vexAlert("Keyboard navigation enabled");
	else
		vexAlert("Keyboard navigation disabled");
}

function showElements(elementNames, flag)
{
	var s = "";

	if (!flag)
		s = "none";

	for (var i = 0 ; i < elementNames.length ; i++)
	{
		var elem = document.getElementById(elementNames[i]);

		elem.style.display = s;
	}
}

function setReadOnly(elemName, flag)
{
	var elem = document.getElementById(elemName);

	if (flag)
		elem.setAttribute("readonly", "readonly");
	else
		elem.removeAttribute("readonly");
}

function onSetSlaveControlActive(flag)
{
	var actChanged = false;
	if (slavesActive != flag)
		actChanged = true;

	slavesActive = flag;

	if (!isMaster)
	{
		if (slavesActive || unSynced)
		{
			showElements(["prevbtn", "nextbtn", "gobtn"], true);
			setReadOnly("pagenumber", false);

			if (actChanged)
				onShowButtons();
		}
		else
		{
			showElements(["prevbtn", "nextbtn", "gobtn"], false);
			setReadOnly("pagenumber", true);
		}
	}
	else
	{
		adjustSlaveStatusIndicator();
	}
}

function onToggleSlavesActive()
{
	console.log("onToggleSlavesActive " + (new Date()).toString());
	slideController.postSlaveActivity(!slavesActive);
}

function onSizeNeededForImage(w, h)
{
	var cnvs = document.getElementById("slidecanvas");

	var w2 = w;
	var h2 = h;

	if (w < 1024 && w > 0)
	{
		var factor = 1024/w;

		w2 = 1024;
		h2 = Math.round(h*factor);
	}

	if (cnvs.width != w2 || cnvs.height != h2)
	{
		cnvs.width = w2;
		cnvs.height = h2;
		dimensionsChanged = true;
	}
}

function onNumParticipants(x)
{
    lastNumberOfParticipants = x;
    document.getElementById("numparticipants").innerHTML = "" + x;
}

function showHelp()
{
    var msg = [""];

	if (unSynced)
	{
        msg = [ "<ul><li>Viewing locally (not synchronized)!\nPress 's' to switch to synchronized mode</li>",
            "<li>Press 'k' to toggle keyboard controls (disabled by default)</li>",
            "<li>Moving the mouse to the top of the page will make controls visible</li>",
            "<li>To zoom in/out use 'i'/'o', keypad '+'/'-' or press shift and use the mouse wheel</li>",
            "<li>Press shift-'f' to enter full screen mode</li>",
            "</ul>" ];
	}
	else
	{
		if (isMaster || slavesActive)
		{
            msg = [ "<ul><li>Press 'k' to toggle keyboard controls (disabled by default)</li>",
                "<li>Moving the mouse to the top of the page will make controls visible</li>",
                "<li>To zoom in/out use 'i'/'o', keypad '+'/'-' or press shift and use the mouse wheel</li>",
                "<li>Click somewhere to draw attention.</li>",
                "<li>Press 's' to switch to local viewing mode.</li>",
                "<li>Press shift-'f' to enter full screen mode</li>",
                "</ul>"];
		}
		else
		{
            msg = [ "<ul><li>Moving the mouse to the top of the page will make controls visible</li>",
                "<li>To zoom in/out use 'i'/'o', keypad '+'/'-' or press shift and use the mouse wheel</li>",
                "<li>Press 's' to switch to local viewing mode.</li>",
                "<li>Press shift-'f' to enter full screen mode</li>",
                "</ul>"];
		}
	}
    vexHelp(msg.join("\n"));
}

function setQRInfo(divId, slideId, title)
{
	if (!slideId)
		return;

	var d = document.getElementById(divId);
    var server = "";

    if (socketServer.length > 0 && !isDefaultSocketServer)
        server = socketServer;

	attachQRandURLs(d, slideId, server, title, "closeQR();", document.location.origin + document.location.pathname + "#id=" + encodeURIComponent(slideId));
}

function closeQR()
{
	ignoreMouseMove = false;
	Modalbox.hide();
}

function showQR(elemId, t)
{
	onHideButtons();
	
	ignoreMouseMove = true;

	Modalbox.show($(elemId),
	{
		title: t,
		width: 800,
        height: 660,
		overlayDuration: 0,
		overlayOpacity: 0,
		slideUpDuration: 0,
		resizeDuration: 0,
		inactiveFade: false,
		transitions: false,
	});
	Modalbox.deactivate();
}

function onFatalError(msg)
{
    if (vexAlertID !== null)
        vex.close(vexAlertID.data().vex.id);

    var checkSSLHtml = "";
    var wssPrefix = "wss://";

    if (slideController && !slideController.didConnectionSucceed() && 
            document.location.protocol == "https:" &&
            startsWith(socketServer, wssPrefix))
    {
        var serverHttps = "https://" + socketServer.substr(wssPrefix.length);
        
        checkSSLHtml = "<p>In case the WebSocket server certificate is not trusted, opening " + 
                "<a href='" + serverHttps + "' target='_blank'>" + serverHttps + "</a> " +
                "can help to accept the certificate.</p>";
    }

    var opts = {
        
        message: "<h3>Fatal error</h3>",
        input: "<p>" + replaceAll(msg, "\n", "<br>")+ "</p>" + checkSSLHtml,
        buttons: [
            {
                text: 'Reload',
                type: 'button',
                className: 'vex-dialog-button-primary',
                click: function($vexContent, event) {
            
                    window.location.reload();

                    $vexContent.data().vex.value = false;
                    return vex.close($vexContent.data().vex.id);
                }
            },
        ],
        callback: function()
        {
            vexAlertID = null;
        }
    }
    vexAlertID = vex.dialog.open(opts);
}

function onNavigationIgnored()
{
    if (controlsDisplayed)
        return;

    if (vexAlertID !== null)
        vex.close(vexAlertID.data().vex.id);

    var msg = "";

    if (unSynced || isMaster || slavesActive)
    {
        msg = "You need to press 'k' first to enable keyboard navigation.";
    }
    else
    {
        msg = [ "In 'slave' mode, you cannot navigate trough the slides, ",
                "unless you press 's' to turn off synchronization temporarily." ].join("\n");
    }

    var opts = {
        contentCSS: { width: "50%" },
        message: '<h3>Navigation ignored</h3>',
        input: msg,
        callback: function()
        {
            vexAlertID = null;
        }
    }
    vexAlertID = vex.dialog.alert(opts);
}

function onInitSuccess()
{
	slideDisplay.onSizeNeededForImage = onSizeNeededForImage;
	slideDisplay.onPageDisplayed = function() { if (dimensionsChanged) { onAdjustImageDimensions(); dimensionsChanged = false; } }
    slideDisplay.onInitStatus = function(msg) { setInitStatus(msg); }

    slideDisplay.init(function() // success callback
    {
        Modalbox.hide();

        var pageElem = document.getElementById("numpages");
        pageElem.value = "" + slideDisplay.getNumberOfPages();

        var cnvs = document.getElementById("slidecanvas");

        slideControls = new SlightControls(cnvs);
        slideControls.onMouseClick = onMouseClick;
        slideControls.onMouseMove = onMouseMove;
        slideControls.isKeyboardNavigationAllowed = isKeyboardNavigationAllowed;
        slideControls.onKeyboardNavigationStatus = onKeyboardNavigationStatus;
        slideControls.onZoomFactor = onZoomFactor;
        slideControls.onKeyEnd = onKeyEnd;
        slideControls.onKeyHome = onKeyHome;
        slideControls.onKeyNext = onNext;
        slideControls.onKeyPrevious = onPrevious;
        slideControls.onSyncToggle = onSyncToggle;
        slideControls.onQuietToggle = onQuietToggle;
        slideControls.onNavigationIgnored = onNavigationIgnored;
        slideControls.onFullscreenRequested = onFullscreenRequested;

        if (!isMaster)
        {
            showElements(["prevbtn", "nextbtn", "gobtn"] , false);
            setReadOnly("pagenumber", true);

            showElements(["actboxtext", "actbox", "toggleactive", "masterurlbtn"], false);
        }

        Hammer(window, { swipe_velocity: 0.05 }).on("swipedown", function() { if (!ignoreMouseMove) onShowButtons(); });
        Hammer(window, { swipe_velocity: 0.05 }).on("swipeup", function() { if (!ignoreMouseMove) onHideButtons(); });

        setInterval(checkHideMouse, 1000);

        showHelp();
    },
    function(msg) // Fail callback
    {
        onFatalError(msg);
    });
}

function setInitStatus(msg)
{
    document.getElementById("initstatus").innerHTML = textToHTML(msg);
}

var lastMouseActivity = Date.now();

function showMouse()
{
    document.getElementById("maintable").style.cursor = "default";
    lastMouseActivity = Date.now();
}

function checkHideMouse()
{
    var curTime = Date.now();
    if (curTime - lastMouseActivity > 5000) // 5 second delay to hide the mouse
        document.getElementById("maintable").style.cursor = "none";
}

function start(pdfUrl)
{
    Modalbox.show($('initdlg'), { 
            width: 700, 
            title: "Initializing...",
			overlayDuration: 0,
			overlayOpacity: 0,
			slideUpDuration: 0,
			resizeDuration: 0,
            transitions: false,
            inactiveFade: false });

    // Make sure modalbox is initialized before continuing
    var modalBoxCheckTimer = setInterval(function()
    {
        if (!Modalbox.initialized)
            return;

        clearInterval(modalBoxCheckTimer);

        Modalbox.deactivate();

        setQRInfo("masterurldlg", masterId, "Master");
        setQRInfo("slaveurldlg", slaveId, "Slave");

        // Hide the buttons and store the height to define the
        // region in which the mouse makes them appear again

        buttonsHeight = 25;

        setInitStatus("Obtaining page/PDF URL(s)");

        var cnvs = document.getElementById("slidecanvas");
        slideDisplay = new SlightPDFDisplay(cnvs, pdfUrl, -1);

        // Create the instance that will communicate the page number etc 

        setInitStatus("Connecting to WebSocket server.");

        slideController = new SlightSync.WebSocketController(document.location.host, isMaster, rsaPubKey, rsaPrivKey, socketServer);

        slideController.onCurrentPageNumber = onCurrentPageNumber;
        slideController.onShowMouseClick = showMouseClick;
        slideController.onSetSlaveControlActive = onSetSlaveControlActive;
        slideController.onFatalError = onFatalError;
        slideController.onNumParticipants = onNumParticipants;

        try 
        {
            slideController.init([], 
                                 function() { onInitSuccess(); }, 
                                 onFatalError);
        }
        catch(e)
        {
            setTimeout(function() { onFatalError("" + e); }, 0);
        }
    }, 100);
}

function getSearchStringPartsFrom(searchStr)
{
    if (!searchStr || searchStr.length == 0)
        return [];

    if (searchStr[0] != "?" && searchStr[0] != "#")
        return [];

    searchStr = searchStr.substr(1);
    return searchStr.split("&");
}

function getSearchStringDict()
{
    var parts1 = getSearchStringPartsFrom(document.location.search);
    var parts2 = getSearchStringPartsFrom(window.location.hash);
    var parts = parts1.concat(parts2);
    var obj  = { };

    for (var i = 0 ; i < parts.length ; i++)
    {
        var s = parts[i];
        if (s.length == 0)
            continue;

        var idx = s.indexOf("=");
        if (idx <= 0)
            continue;

        var key = decodeURIComponent(s.substr(0, idx));
        var value = decodeURIComponent(s.substr(idx+1));

        obj[key] = value;
    }

    return obj;
}

function generateSlideIds(pdfUrl, serverUrl, rsaPrivKey, rsaPubKey)
{
    var obj = {
        "pdfUrl": pdfUrl,
        "serverUrl": serverUrl,
        "pubKey": rsaPubKey,
    }

    var ids = {
        "slaveid": btoa(JSON.stringify(obj)),
        "masterid": ""
    }

    if (rsaPrivKey.length > 0)
    {
        obj = {
            "pdfUrl": pdfUrl,
            "serverUrl": serverUrl,
            "privKey": rsaPrivKey
        }

        ids["masterid"] = btoa(JSON.stringify(obj));
    }

    return ids;
}

function showFs(elem)
{
    console.log(elem);
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

function onFullscreenRequested()
{
    var d = document.getElementsByTagName("body")[0];
    showFs(d);
}

function main()
{
    var args = getSearchStringDict();
    //console.log(args);

    if (!("id" in args))
    {
        vexAlert("Malformed URL");
        return;
    }

    loadedSlidesID = args["id"];

    var slideInfo = JSON.parse(atob(args["id"]));
    //console.log(slideInfo);

    var pdfUrl = slideInfo["pdfUrl"];
    var serverUrl = slideInfo["serverUrl"];
    
    if ("server" in args) // 'server' in URL overrides the setting from the id
    {
        serverUrl = args["server"];
        isDefaultSocketServer = false;
    }

    socketServer = serverUrl;

    if ("privKey" in slideInfo)
    {
        rsaPrivKey = slideInfo["privKey"];
        isMaster = true;
        
        // Generate public key from private key
        var key = KEYUTIL.getKey(rsaPrivKey);
        var pubKey = new RSAKey();
        
        pubKey.isPublic = true;
        pubKey.n = key.n;
        pubKey.e = key.e;

        rsaPubKey = KEYUTIL.getPEM(pubKey, "PKCS8PUB");
    }
    else
    {
        rsaPrivKey = "";
        rsaPubKey = slideInfo["pubKey"];
    }

    var slideIds = generateSlideIds(pdfUrl, serverUrl, rsaPrivKey, rsaPubKey);
    slaveId = slideIds["slaveid"];
    masterId = slideIds["masterid"];

    start(pdfUrl);
}

