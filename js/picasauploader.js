PicasaUploader = function()
{
	var m_isUploading = false;
	var m_isUploadCancelled = false;
	var m_numPages = -1;
	var m_imageUrls = null;

	this.onStatus = function(msg, pct)
	{
		console.log(msg + "pct = " + pct);
	}

	this.onError = function(msg)
	{
		console.log("Error: " + msg);
	}

	this.onErrorDetails = function(msg)
	{
		console.log("Error details: " + msg);
	}

	this.onCancelled = function()
	{
		console.log("Cancelled");
	}

	this.onFinished = function(urlArray)
	{
		console.log(urlArray);
	}

	this.getImageInfoPromise = null;
		//console.log("TODO:  should return { title: titlestring, summary: summarystring, data: dataFromImage }");

	this.signalCancel = function()
	{
		m_isUploadCancelled = true;
	}

	this.isUploading = function()
	{
		return m_isUploading;
	}

	this.createAlbum = function(titleStr, numPages)
	{
		if (m_isUploading)
			throw "PicasaUploader.upload: already an upload in progress";

		m_isUploading = true;
		m_isUploadCancelled = false;
		m_numPages = numPages;
		m_imageUrls = new Array();

		var n = new NetworkConnection();
		var _this = this;

		this.onStatus("Creating album", 1);

		NetworkConnection.post("/createalbum.py", { title: titleStr }, function(responseText) { _this._onCreateAlbumResponse(responseText); });
	}

	this._onCreateAlbumResponse = function(responseText)
	{
		var albumIdStr = "albumid:"
		var idx = responseText.indexOf("\n" + albumIdStr);

		//console.log(responseText);

		responseText = responseText.substring(idx+1);
		if (responseText.startsWith(albumIdStr))
		{
			this.onStatus("album created", Math.round(1.0/(1.0+m_numPages)*100));
			
			var albumId = responseText.substring(albumIdStr.length);

			this._uploadPageToPicasa(1, albumId);
		}
		else
		{
			m_isUploading = false;

			this.onError("Couldn't handle response");
			this.onErrorDetails(responseText);
		}
	}

	this._uploadPageToPicasa = function(pageNumber, albumId)
	{
		this.onStatus("obtaining image data for page " + pageNumber);

		var _this = this;
		
		this.getImageInfoPromise(pageNumber).then(function(imgDataInfo)
		{
			var imgData = imgDataInfo.data;
			var prefix = "data:image/jpeg;base64,";
						
			imgData = imgData.substring(prefix.length);

			_this.onStatus("uploading page " + pageNumber);

			NetworkConnection.post("/addimage.py", { title: imgDataInfo.title, summary: imgDataInfo.summary, albumid: albumId, data: imgData } , function(responseText, statusCode, statusText)
			{
				// cancelling at this point should prevent albums with no images
				if (m_isUploadCancelled)
				{
					m_isUploading = false;
					_this.onCancelled();
					return;
				}

				//console.log(responseText);

				var photoIdStr = "img:";
				var idx = responseText.indexOf("\n" + photoIdStr);

				responseText = responseText.substring(idx+1);

				if (responseText.startsWith(photoIdStr))
				{
					var photoId = responseText.substring(photoIdStr.length);

					m_imageUrls[pageNumber-1] = photoId;

					_this.onStatus("uploaded page " + pageNumber, Math.round((1.0+pageNumber)/(1.0+m_numPages)*100));

					if (pageNumber < m_numPages)
					{
						_this._uploadPageToPicasa(pageNumber+1, albumId);
					}
					else
					{
						m_isUploading = false;
						_this.onStatus("done", 100);
						_this.onFinished(m_imageUrls);
					}
				}
				else
				{
					m_isUploading = false;
					_this.onError("Couldn't handle response");

					if (statusCode == 200)
					{
						if (responseText.length == 0)
							_this.onErrorDetails("Error: empty response text");
						else
							_this.onErrorDetails(responseText);
					}
					else
					{
						_this.onErrorDetails("Unexpected: " + statusText + " (" + statusCode +")");
					}
				}
			});
		});
	}
}


