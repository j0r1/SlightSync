SlightDisplay = function(cnvs, pages)
{
    var _this = this;
	var m_canvas = cnvs;

	var m_bulbImage = null;
	var m_bulbPosX = -1;
	var m_bulbPosY = -1;
	var m_bulbPage = -1;
	var m_bulbTimer = null;

	var m_cacheTimer = null;
	var m_slideImages = null;
	var m_loadingImage = null;
	var m_failedImage = null;
    var m_pages = null;

	var m_currentPage = -1;
	var m_displayedPage = -1;

	var m_drawBorder = false;
	var m_borderColor = "#ffffff";
	var m_borderWidth = 5;

    var m_quiet = false;
    var m_cacheApron = 5;
    var m_checkImageCacheInterval = 60;
    var m_maxCachedImages = 64;

    if (m_maxCachedImages < (m_cacheApron*2+1))
        m_maxCachedImages = m_cacheApron*2+1;

    var m_refTime = Date.now()/1000.0;

    this.setQuiet = function(b)
    {
        m_quiet = b;
    }

    this.isQuiet = function()
    {
        return m_quiet;
    }

	this._onImageLoadSuccess = function(num)
	{
		var img = m_slideImages[num];

		img.slightLoadAttempts++;

		img.slightLoaded = true;
		img.slightLoading = false;
		img.slightFailed = false;
        img.slightLastUseTime = Date.now()/1000.0;

		if (num == m_currentPage) // See if we need to display this page
			this._displayCurrentPage();
	}

	this._onImageLoadError = function(num)
	{
		var img = m_slideImages[num];

		img.slightLoadAttempts++;
		if (img.slightLoadAttempts < 3)
		{
			// try again
			img.src = img.slightUrl;
		}
		else // mark as failed
		{
			img.slightLoaded = false;
			img.slightLoading = false;
			img.slightFailed = true;
		}

		if (num == m_currentPage)
			this._displayCurrentPage();
	}

	this._onBulbTimer = function()
	{
		if (m_bulbTimer != null)
		{
			clearTimeout(m_bulbTimer); // probably not necessary
			m_bulbTimer = null;
		}
		
		m_bulbPosX = -1;
		m_bulbPosY = -1;
		m_bulbPage = -1;

		this._displayCurrentPage();
	}

	this._drawBorder = function()
	{
		// Draw the border if requested
		if (m_drawBorder)
		{
			var ctx = m_canvas.getContext('2d');

			var w = Math.floor(m_borderWidth/2);
			ctx.beginPath();
			ctx.rect(w, w, m_canvas.width-m_borderWidth, m_canvas.height-m_borderWidth);
			ctx.strokeStyle = m_borderColor;
			ctx.lineWidth = m_borderWidth;
			ctx.stroke();
		}
	}

	// This just draws the current page (if available) on the full canvas and places the
	// light bulb if necessary, it doesn't scale the canvas in any way
	this._displayCurrentPage = function()
	{
		if (m_currentPage < 0 || m_slideImages == 0 || m_currentPage >= m_slideImages.length)
		{
			console.log("SlightDisplay._displayCurrentPage: No current page yet");
			return;
		}

		var ctx = m_canvas.getContext('2d');
		var img = m_slideImages[m_currentPage];

		if (img == null || img.slightLoaded == false)
		{
			var failed = img.slightFailed;
            if (m_quiet)
            {
                if (failed)
                    console.log("Loading image " + (m_currentPage + 1) + " failed!");
                return;
            }
		
			if (m_displayedPage < 0 || failed)
			{
				// No displayed image available just draw an empty canvas

				this.onSizeNeededForImage(640, 480);
				
				ctx.fillStyle = "#000000";
				ctx.fillRect(0, 0, m_canvas.width, m_canvas.height);
				ctx.fillStyle = "#ffffff";
				ctx.fillRect(1, 1, m_canvas.width-2, m_canvas.height-2);

				this._drawBorder();
			}
			else // use last displayed image
			{
				var dispImg = m_slideImages[m_displayedPage];

				this.onSizeNeededForImage(dispImg.width, dispImg.height);

				ctx.drawImage(dispImg, 0, 0, m_canvas.width, m_canvas.height);

				this._drawBorder();
			}

			if (!failed)
			{
				if (m_loadingImage.slightLoaded)
				{
					var res = calcWidthHeightForContainer(m_loadingImage.width, m_loadingImage.height, m_canvas.width, m_canvas.height);

					var xOff = Math.round((m_canvas.width - res.width)/2);
					var yOff = Math.round((m_canvas.height - res.height)/2);

					ctx.drawImage(m_loadingImage, xOff, yOff, res.width, res.height);
				}
			}
			else
			{
				if (m_failedImage.slightLoaded)
				{
					var res = calcWidthHeightForContainer(m_failedImage.width, m_failedImage.height, m_canvas.width, m_canvas.height);

					var xOff = Math.round((m_canvas.width - res.width)/2);
					var yOff = Math.round((m_canvas.height - res.height)/2);

					ctx.drawImage(m_failedImage, xOff, yOff, res.width, res.height);
				}
			}

			// draw 'loading' or 'failed' text

            if (failed)
                _this.setText("Loading image " + (m_currentPage + 1) + " failed!");
            else
                _this.setText("Loading image " + (m_currentPage + 1));

			this.onPageDisplayed();

			return; // Won't draw a light bulb if no image is drawn
		}

        // Update the last usage time
        img.slightLastUseTime = Date.now()/1000.0;

		// First draw the image

		_this.onSizeNeededForImage(img.width, img.height);

		ctx.drawImage(img, 0, 0, m_canvas.width, m_canvas.height);
		m_displayedPage = m_currentPage;

		// Then the bulb if necessary

		//console.log("pg: " + bulbPage + " " + curPage);
		if (m_bulbPosX >= 0 && m_bulbPosY >= 0 && m_bulbPosX <= 1 && m_bulbPosY <= 1 && m_bulbPage == m_currentPage)
		{
			// Check if we can draw the image
			if (m_bulbImage == null || m_bulbImage.originalWidth < 0 || m_bulbImage.originalHeight < 0)
			{
				// Just draw some text, better than nothing

				ctx.font="10px Titillium Web";
				ctx.fillStyle = "#355681";
				ctx.fillText("Attention!", m_bulbPosX, m_bulbPosY);
			}
			else
			{
				var w = Math.round(m_canvas.width/20.0);
				var h = 0;
				if (m_bulbImage.width != w)
				{
					h = Math.round(m_bulbImage.originalHeight/m_bulbImage.originalWidth*w);

					m_bulbImage.width = w;
					m_bulbImage.height = h;
				}
				else
				{
					h = m_bulbImage.height;
				}

				var x = m_bulbPosX * m_canvas.width - w/2;
				var y = m_bulbPosY * m_canvas.height - h/2;

				x = Math.round(x);
				y = Math.round(y);

				if (x < 0)
					x = 0;
				if (y < 0)
					y = 0;

				//console.log(x + " " + y);

				ctx.drawImage(m_bulbImage, x, y, w, h);
			}
		}

		this._drawBorder();

		this.onPageDisplayed();
	}

	this._checkNeedToLoadImage = function(num)
	{
		if (m_slideImages == null || num < 0 || num >= m_slideImages.length)
			return;

		var img = m_slideImages[num];
		var idx = num;

		if (!img.slightLoading && !img.slightLoaded && !img.slightFailed)
		{
			var _this = this;

			img.slightLoading = true;
			img.onerror = function() { _this._onImageLoadError(idx); }
			img.onload = function() { _this._onImageLoadSuccess(idx); }
			// Start loading
            //console.log("Requesting image for slide " + num);
			img.src = img.slightUrl;
		}
        else if (img.slightLoaded)
        {
            // Update the last usage timestamp, try to keep this apron in memory
            img.slightLastUseTime = Date.now()/1000.0;
        }
	}

	this._cacheLoader = function() // load the surrounding images
	{
		if (m_currentPage < 0)
			return;

		var num = m_currentPage;
        var apron = m_cacheApron;

        for (var i = num-apron ; i < num+1+apron ; i++)
        {
		    if (m_slideImages && i >= 0 && i < m_slideImages.length)
			    this._checkNeedToLoadImage(i);
        }
	}

	this.onSizeNeededForImage = function(w, h)
	{
		console.log("SlightDisplay.onSizeNeededForImage: " + w + " " + h);
	}

	this.onPageDisplayed = function()
	{
	}

	this.displayBulb = function(pg, x, y)
	{
		if (m_bulbTimer)
		{
			clearInterval(m_bulbTimer);
			m_bulbTimer = null;
		}

		if (x < 0 || y < 0 || x > 1 || y > 1) // coordinates are relative for the page and lie between 0 and 1
		{
			m_bulbPosX = -1;
			m_bulbPosY = -1;
			m_bulbPage = -1;
		}
		else
		{
			m_bulbPosX = x;
			m_bulbPosY = y;
			m_bulbPage = pg;

			var _this = this;

			// TODO: make interval configurable
			// TODO: animate this? fade in/fade out
			m_bulbTimer = setTimeout(function() { _this._onBulbTimer(); }, 2000);
		}

		this._displayCurrentPage();
	}

	this.setCurrentPage = function(num)
	{
		// Should never happen
		if (num < 0 || m_slideImages == null || num >= m_slideImages.length)
        {
			//throw "Invalid page number or number of pages not currently known";
            console.log("Invalid page number or number of pages not currently known: num = " + num);
            return;
        }

		m_currentPage = num;

		this._checkNeedToLoadImage(num);
		
		// Either display the slide or provide some feedback
		this._displayCurrentPage();
	}

	this.getCurrentPage = function()
	{
		return m_currentPage;
	}

	this.getDisplayedPage = function()
	{
		return m_displayedPage;
	}

	this.getNumberOfPages = function()
	{
		if (m_slideImages == null)
			return 0;

		return m_slideImages.length;
	}

	this.refresh = function()
	{
		this._displayCurrentPage();
	}

	this.clearBorder = function()
	{
		m_drawBorder = false;
	}

	this.setBorder = function(borderWidth, borderColor)
	{
		m_drawBorder = true;
		m_borderWidth = borderWidth;
		m_borderColor = borderColor;
	}

    this.setText = function(msg)
    {
		var ctx = m_canvas.getContext('2d');
		ctx.font="20px Titillium Web";
		ctx.fillStyle = "#355681";
		ctx.fillText("" + msg, 10, 30);
    }

    var initSlideImage = function(i)
    {
        m_slideImages[i] = new Image();
        m_slideImages[i].slightUrl = m_pages[i];
        m_slideImages[i].slightLoaded = false;
        m_slideImages[i].slightLoading = false;
        m_slideImages[i].slightLoadAttempts = 0;
        m_slideImages[i].slightFailed = false;
        m_slideImages[i].slightLastUseTime = -1;
    }

    var checkCachedImages = function()
    {
        var len = m_slideImages.length;
        var loadedImages = [ ];

        // First, let's see which images are loaded, only they can be evicted from the cache
        for (var i = 0 ; i < len ; i++)
        {
            if (i != m_currentPage && i != m_displayedPage && m_slideImages[i].slightLoaded)
                loadedImages.push([ i, m_slideImages[i].slightLastUseTime]);
        }

        if (loadedImages.length <= m_maxCachedImages) // Cache is not full yet
            return

        // Sort on the last use time
        loadedImages.sort(function(a, b) { if (a[1] < b[1]) return -1; if (a[1] > b[1]) return 1; return 0; });
        //for (var i = 0 ; i < loadedImages.length ; i++)
        //    console.log("" + loadedImages[i][0] + " -> " + (loadedImages[i][1] - m_refTime));

        var endPos = loadedImages.length-m_maxCachedImages;
        for (var i = 0 ; i < endPos ; i++)
        {
            var idx = loadedImages[i][0];
            //console.log("Evicting " + idx + " from cache");
            initSlideImage(idx);
        }
    }

	this.init = function(successCb, failCb)
	{
		var numPages = pages.length;
		if (numPages < 1)
			throw "SlightDisplay.init: number of pages too small";

        m_pages = pages;

		m_slideImages = [];
		for (var i = 0 ; i < numPages ; i++)
		{
            initSlideImage(i);
		}

		this.setCurrentPage(0);

        setInterval(checkCachedImages, m_checkImageCacheInterval*1000); // is specified in seconds
        setTimeout(function() { successCb(); }, 0);
	}

    this.onInitStatus = function(msg)
    {
    }

	// Load PNG first, and if supported use SVG

	m_bulbImage = new Image();
	m_bulbImage.originalWidth = -1;
	m_bulbImage.originalHeight = -1;

	m_bulbImage.onload = function() 
	{ 
		m_bulbImage.originalWidth = m_bulbImage.width; 
		m_bulbImage.originalHeight = m_bulbImage.height; 
	
		var bulbImageSvg = new Image();
		
		bulbImageSvg.onload = function()
		{
			m_bulbImage = bulbImageSvg;
			m_bulbImage.originalWidth = m_bulbImage.width; 
			m_bulbImage.originalHeight = m_bulbImage.height; 
		}
		bulbImageSvg.src = "img/bulb.svg";
	}
	m_bulbImage.src = "img/bulb.png";

	m_cacheTimer = setInterval(function() { _this._cacheLoader(); }, 1000);

	m_loadingImage = new Image();
	m_loadingImage.slightLoaded = false;
	m_loadingImage.onload = function() { m_loadingImage.slightLoaded = true; }
	m_loadingImage.src = "loading.png";

	m_failedImage = new Image();
	m_failedImage.slightLoaded = false;
	m_failedImage.onload = function () { m_failedImage.slightLoaded = true; }
	m_failedImage.src = "failed.png";
}

SlightPDFDisplay = function(cnvs, pdfUrl, numPages)
{
    var _this = this;
	var m_canvas = cnvs;
    var m_pdfUrl = pdfUrl;
    var m_numPages = numPages;
    var m_currentPage = 0;
    var m_displayedPage = -1;
    var m_pdf = null;

	var m_drawBorder = false;
	var m_borderColor = "#ffffff";
	var m_borderWidth = 5;

	var m_bulbImage = null;
	var m_bulbPosX = -1;
	var m_bulbPosY = -1;
	var m_bulbPage = -1;
	var m_bulbTimer = null;

    var m_drawCanvas = document.createElement("canvas");
    var m_drawContext = m_drawCanvas.getContext("2d");
    var m_bufferCanvas = document.createElement("canvas");
    var m_bufferContext = m_bufferCanvas.getContext("2d");
    var m_rendering = false;

    this.setQuiet = function(b)
    {
    }

    this.isQuiet = function()
    {
    }

	this.onSizeNeededForImage = function(w, h)
	{
		console.log("SlightDisplay.onSizeNeededForImage: " + w + " " + h);
	}

	this.onPageDisplayed = function()
	{
	}

	this.displayBulb = function(pg, x, y)
	{
		if (m_bulbTimer)
		{
			clearInterval(m_bulbTimer);
			m_bulbTimer = null;
		}

		if (x < 0 || y < 0 || x > 1 || y > 1) // coordinates are relative for the page and lie between 0 and 1
		{
			m_bulbPosX = -1;
			m_bulbPosY = -1;
			m_bulbPage = -1;
		}
		else
		{
			m_bulbPosX = x;
			m_bulbPosY = y;
			m_bulbPage = pg;

			var _this = this;

			// TODO: make interval configurable
			// TODO: animate this? fade in/fade out
			m_bulbTimer = setTimeout(function() { _this._onBulbTimer(); }, 2000);
		}

		this.refresh();
	}

	this.setCurrentPage = function(num)
	{
        if (num < 0 || num >= m_numPages)
        {
            console.log("Invalid page number: num = " + num);
            return;
        }
        if (!m_pdf)
        {
            console.log("No PDF loaded");
            return;
        }

        m_currentPage = num;
        this.refresh();
	}

	this.getCurrentPage = function()
	{
        return m_currentPage;
	}

	this.getDisplayedPage = function()
	{
        return m_displayedPage;
	}

	this.getNumberOfPages = function()
	{
		return m_numPages;
	}

    this._drawBulb = function()
    {
        var ctx = m_canvas.getContext('2d');

		//console.log("pg: " + bulbPage + " " + curPage);
		if (m_bulbPosX >= 0 && m_bulbPosY >= 0 && m_bulbPosX <= 1 && m_bulbPosY <= 1 && m_bulbPage == m_currentPage)
		{
			// Check if we can draw the image
			if (m_bulbImage == null || m_bulbImage.originalWidth < 0 || m_bulbImage.originalHeight < 0)
			{
				// Just draw some text, better than nothing

				ctx.font="10px Titillium Web";
				ctx.fillStyle = "#355681";
				ctx.fillText("Attention!", m_bulbPosX, m_bulbPosY);
			}
			else
			{
				var w = Math.round(m_canvas.width/20.0);
				var h = 0;
				if (m_bulbImage.width != w)
				{
					h = Math.round(m_bulbImage.originalHeight/m_bulbImage.originalWidth*w);

					m_bulbImage.width = w;
					m_bulbImage.height = h;
				}
				else
				{
					h = m_bulbImage.height;
				}

				var x = m_bulbPosX * m_canvas.width - w/2;
				var y = m_bulbPosY * m_canvas.height - h/2;

				x = Math.round(x);
				y = Math.round(y);

				if (x < 0)
					x = 0;
				if (y < 0)
					y = 0;

				//console.log(x + " " + y);

				ctx.drawImage(m_bulbImage, x, y, w, h);
			}
        }
    }

	this.refresh = function()
	{
        var num = m_currentPage;

        if (m_currentPage == m_displayedPage) // we should be able to use our cache
        {
            var ctx = m_canvas.getContext('2d');

            ctx.drawImage(m_bufferCanvas, 0, 0);
            _this._drawBorder();
            _this._drawBulb();
            _this.onPageDisplayed();
            return;
        }

        if (m_rendering)
            return;

        m_rendering = true;

        var errMsg = function(msg, w, h)
        {
            _this.onSizeNeededForImage(w, h);

            // Unable to render
            m_bufferCanvas.width = m_canvas.width;
            m_bufferCanvas.height = m_canvas.height;
            m_bufferContext.fillStyle = "#ffffff";
            m_bufferContext.fillRect(0, 0, m_bufferCanvas.width, m_bufferCanvas.height);
            _this.setText(msg, m_bufferContext);
            // Call refresh again to actually display
            setTimeout(function() { _this.refresh(); }, 10);
        }

        m_pdf.getPage(num + 1).then(function(page)
        {
            if (num != m_currentPage)
            {
                m_rendering = false;
                // Try again
                setTimeout(function() { _this.refresh(); }, 10);
                return;
            }
            var viewport0 = page.getViewport(1);
            var viewport = viewport0;
            
            var sw = screen.width;
            if (sw >= 1920)
                sw = 1920;

            var screenScale = sw/viewport.width;
            if (screenScale >= 0.5 && screenScale <= 5.0)
            {
                var vp2 = page.getViewport(screenScale);
                if (vp2.width <= 1920 && vp2.height <= 1280) // use zoomed in viewport
                    viewport = vp2;
            }

            var width = Math.floor(viewport.width);
            var height = Math.floor(viewport.height);

            _this.onSizeNeededForImage(width, height);

            m_drawCanvas.width = m_canvas.width;
            m_drawCanvas.height = m_canvas.height;

            m_drawContext.fillStyle = "#ffffff";
            m_drawContext.fillRect(0, 0, m_drawCanvas.width, m_drawCanvas.height);

            var newScale = m_canvas.width/viewport0.width;
            viewport = page.getViewport(newScale);

            var renderContext = {
                canvasContext: m_drawContext,
                viewport: viewport
            };

            page.render(renderContext).then(function()
            {
                m_rendering = false;
                m_displayedPage = num;

                m_bufferCanvas.width = m_drawCanvas.width;
                m_bufferCanvas.height = m_drawCanvas.height;
                m_bufferContext.fillStyle = "#ffffff";
                m_bufferContext.fillRect(0, 0, m_bufferCanvas.width, m_bufferCanvas.height);
                m_bufferContext.drawImage(m_drawCanvas, 0, 0);

                // Call refresh again to actually display
                setTimeout(function() { _this.refresh(); }, 10);
            },
            function() 
            {
                m_rendering = false;
                m_displayedPage = num;
                
                // Unable to render
                errMsg("Unable to render page " + (num+1), m_drawCanvas.width, m_drawCanvas.height);
            });
        },
        function()
        {
            m_rendering = false;
            m_displayedPage = num;

            // Unable to get page
            errMsg("Unable to get page " + (num+1) + " from PDF", 640, 480);
        });
	}

	this._drawBorder = function()
	{
		// Draw the border if requested
		if (m_drawBorder)
		{
			var ctx = m_canvas.getContext('2d');

			var w = Math.floor(m_borderWidth/2);
			ctx.beginPath();
			ctx.rect(w, w, m_canvas.width-m_borderWidth, m_canvas.height-m_borderWidth);
			ctx.strokeStyle = m_borderColor;
			ctx.lineWidth = m_borderWidth;
			ctx.stroke();
		}
	}

	this.clearBorder = function()
	{
		m_drawBorder = false;
	}

	this.setBorder = function(borderWidth, borderColor)
	{
		m_drawBorder = true;
		m_borderWidth = borderWidth;
		m_borderColor = borderColor;
	}

    this.setText = function(msg, context)
    {
		var ctx = context || m_canvas.getContext('2d');
		ctx.font="20px Titillium Web";
		ctx.fillStyle = "#355681";
		ctx.fillText("" + msg, 10, 30);
    }

    var onHavePDF = function(pdf)
    {
        m_pdf = pdf;
        _this.setCurrentPage(m_currentPage);
    }

	this.init = function(successCb, failCb)
	{
        if (m_pdf)
            throw "Already initialized";

        //this.setText("Downloading PDF...");

        var n = new NetworkConnection();
        _this.onInitStatus("Downloading PDF");

        n.get(m_pdfUrl, function(response, statusCode, statusText)
        {
            if (statusCode != 200)
            {
                setTimeout(function() { failCb("Can't download PDF, got status " + statusCode); }, 0);
                return;
            }

            console.log("statusCode: " + statusCode);
            console.log("statusText: " + statusText);

            _this.onInitStatus("Interpreting downloaded file as PDF");

            PDFJS.getDocument(response).then(function(pdf)
            {
                console.log("Got PDF, number of pages: " + pdf.numPages);
                if (m_numPages >= 0)
                {
                    if (pdf.numPages == m_numPages)
                    {
                       setTimeout(function() 
                       { 
                            onHavePDF(pdf);
                            setTimeout(function() { successCb(); }, 0);
                       }, 0);
                    }
                    else
                    {
                        setTimeout(function() { failCb("Number of pages read in PDF is no longer valid, PDF has changed?"); }, 0);
                    }
                }
                else
                {
                    m_numPages = pdf.numPages;
                    onHavePDF(pdf);
                    setTimeout(function() { successCb(); }, 0);
                }
            },
            function(reason) // something went wrong
            {
                setTimeout(function() { failCb("Couldn't load PDF: " + reason); }, 0);
            });
        }, true, true); // 'true' for binary data (array buffer), other is for cache
	}

	this._onBulbTimer = function()
	{
		if (m_bulbTimer != null)
		{
			clearTimeout(m_bulbTimer); // probably not necessary
			m_bulbTimer = null;
		}
		
		m_bulbPosX = -1;
		m_bulbPosY = -1;
		m_bulbPage = -1;

		this.refresh();
	}

    this.onInitStatus = function(msg)
    {
    }

	// Load PNG first, and if supported use SVG

	m_bulbImage = new Image();
	m_bulbImage.originalWidth = -1;
	m_bulbImage.originalHeight = -1;

	m_bulbImage.onload = function() 
	{ 
		m_bulbImage.originalWidth = m_bulbImage.width; 
		m_bulbImage.originalHeight = m_bulbImage.height; 
	
		var bulbImageSvg = new Image();
		
		bulbImageSvg.onload = function()
		{
			m_bulbImage = bulbImageSvg;
			m_bulbImage.originalWidth = m_bulbImage.width; 
			m_bulbImage.originalHeight = m_bulbImage.height; 
		}
		bulbImageSvg.src = "img/bulb.svg";
	}
	m_bulbImage.src = "img/bulb.png";
}



