var PDFRenderer = function(pdfData)
{
    var m_destroyed = false;
    var m_drawCanvas = document.createElement("canvas");
    var m_drawContext = m_drawCanvas.getContext("2d");
    var m_copyCanvas = document.createElement("canvas");
    var m_copyContext = m_copyCanvas.getContext("2d");
    var m_rendering = false;

    this.m_pdf = null;
    this.m_maxResolution = 2048; // using a power of two easily allows mipmaps

    this.onLoaded = function()
    {
        console.log("loaded");
    }

    this.onError = function(errtype, errmsg)
    {
        console.log("error: " + errmsg);
    }

    this.onPageRendered = function(number, image)
    {
        console.log("page " + number + " rendered");
    }

    this.destroy = function()
    {
        m_destroyed = true;

        m_drawCanvas = null;
        m_drawContext = null;
    
        this.m_pdf = null;

        // TODO?

    }

    this.getNumberOfPages = function()
    {
        if (this.m_pdf == null)
            throw "No PDF has been loaded yet";

        return this.m_pdf.numPages;
    }

    this.renderPage = function(pagenum, renderedCallBack, errorCallback)
    {
        if (this.m_pdf == null)
            throw "No PDF has been loaded yet";

        if (m_rendering)
            throw "Already rendering a page";

        if (pagenum < 1 || pagenum > this.m_pdf.numPages)
            throw "Invalid page number";

        m_rendering = true;
        var this_ = this;

        // Using setTimeout to schedule this in the event queue
        setTimeout(function()
        {
            this_.m_pdf.getPage(pagenum).then(function(page)
            {
                if (m_destroyed)
                    return;

                var viewport = page.getViewport(1);
                var maxResolution = this_.m_maxResolution;

                var destW = maxResolution;
                var destH = maxResolution;

                var scaleX = destW/viewport.width;
                var scaleY = destH/viewport.height;
                var scale = scaleX;

                if (scale > scaleY)
                    scale = scaleY;

                viewport = page.getViewport(scale);

                m_drawCanvas.height = maxResolution;
                m_drawCanvas.width = maxResolution;

                var renderContext = 
                {
                    canvasContext: m_drawContext,
                    viewport: viewport
                };

                page.render(renderContext).then(function()
                {
                    m_rendering = false;
                    if (!m_destroyed)
                    {
                        m_copyCanvas.width = m_drawCanvas.width;
                        m_copyCanvas.height = m_drawCanvas.height;
                        m_copyContext.fillStyle = "#ffffff";
                        m_copyContext.fillRect(0, 0, m_drawCanvas.width, m_drawCanvas.height);
                        m_copyContext.drawImage(m_drawCanvas, 0, 0);

                        var img = new Image();

                        img.onload = function()
                        {
                            if (renderedCallBack)
                                renderedCallBack(img);
                            else
                                this_.onPageRendered(pagenum, img);
                        }
                        img.src = m_copyCanvas.toDataURL("image/jpeg");
                    }
                },
                function(reason)
                {
                    m_rendering = false;
                    if (!m_destroyed)
                    {
                        if (errorCallback)
                            errorCallback("Unable to render page: " + reason);
                        else
                            this_.onError("render", "Unable to render page: " + reason);
                    }
                });
            },
            function(reason)
            {
                m_rendering = false;
                if (!m_destroyed)
                {
                    if (errorCallback)
                        errorCallback("Unable to get page: " + reason);
                    else
                        this_.onError("render", "Unable to get page: " + reason);         
                }
            });
        }, 0);
    }

    var this_ = this;
    // A timeout is zero to place these calls at the back of the event queue, to make
    // sure we've got some time to set the member functions used in the callbacks
    setTimeout(function()
    {
        PDFJS.getDocument(pdfData).then(function(pdf)
        {
            this_.m_pdf = pdf;
            if (!m_destroyed)
                this_.onLoaded();
        }, function(reason)
        {
            if (!m_destroyed)
                this_.onError("load", "Error getting document data: " + reason);
        });
    },0);
}

