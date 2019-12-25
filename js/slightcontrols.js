SlightControls = function(cnvs)
{
	var m_cnvs = cnvs;
	var m_shiftPressed = false;
	var m_keyboardActive = false;
	var m_zoomFactor = 1;
	var m_zoomFactorFactor = 1.2;

	this.getZoomFactor = function()
	{
		return m_zoomFactor;
	}

	this.onMouseClick = function(x, y)
	{
	}

	this.onMouseMove = function(evt)
	{
	}

	this.isKeyboardNavigationAllowed = function()
	{
		// TODO: make it depend on master setting
		return true;
	}

	this.onKeyboardNavigationStatus = function(enabled)
	{
	}

	this.onZoomFactor = function(factor)
	{
	}

	this.onKeyEnd = function()
	{
	}

	this.onKeyHome = function()
	{
	}

	this.onKeyNext = function()
	{
	}

	this.onKeyPrevious = function()
	{
	}

	this.onSyncToggle = function()
	{
	}

    this.onQuietToggle = function()
    {
    }

    this.onNavigationIgnored = function()
    {
    }

    this.onFullscreenRequested = function()
    {
    }

	this._onMouseDown = function(evt)
	{
		// TODO: check if this is successful?
		var w = parseInt(m_cnvs.style.width.substring(0, m_cnvs.style.width.length-2));
		var h = parseInt(m_cnvs.style.height.substring(0, m_cnvs.style.height.length-2));

		if (w <= 0)
			w = 1;
		if (h <= 0)
			h = 1;

		var offX = evt.pageX;
		var offY = evt.pageY;

		var el = m_cnvs;
		var count = 0;
		while (el && count < 32)
		{
			offX -= el.offsetLeft;
			offY -= el.offsetTop;
			el = el.offsetParent;
			count++;
		}

		var x = offX/w;
		var y = offY/h;

		this.onMouseClick(x, y);
	}

	this._onMouseWheel = function(e)
	{
		if (!m_shiftPressed)
			return;

		var val = 0;

		if (e.wheelDelta > 0)
		{
			val = 1;
		}
		else if (e.wheelDelta < 0)
		{
			val = -1;
		}

		if (val != 0)
			this._onZoom(val);

		e.preventDefault();
	}

	this._onMouseWheelFF = function(e)
	{
		if (!m_shiftPressed)
			return;

		var val = 0;

		if (e.detail < 0)
		{
			val = 1;
		}
		else if (e.detail > 0)
		{
			val = -1;
		}

		if (val != 0)
			this._onZoom(val);

		e.preventDefault();
	}

	this._onZoom = function(direction)
	{
		if (direction > 0)
		{
			if (m_zoomFactor < 20.0)
				m_zoomFactor *= m_zoomFactorFactor;
		}
		else if (direction < 0)
		{
			if (m_zoomFactor > 0.05)
				m_zoomFactor /= m_zoomFactorFactor;
		}

		if (Math.abs(m_zoomFactor-1.0) < 0.001)
			m_zoomFactor = 1.0;

		this.onZoomFactor(m_zoomFactor);
	}

	var isFF = (/Firefox/i.test(navigator.userAgent));
	var _this = this;

	m_cnvs.addEventListener("mousedown", function(x) { _this._onMouseDown(x); }, false);

	window.addEventListener("mousemove", function(x) { _this.onMouseMove(x); }, false);
	if (!isFF)
		window.addEventListener("mousewheel", function(x) { _this._onMouseWheel(x); }, false);
	else
		window.addEventListener("DOMMouseScroll", function(x) { _this._onMouseWheelFF(x); }, false);

	document.onkeyup = function(evt) 
	{
		if (evt.keyCode == 16)
			m_shiftPressed = false;
	}

    document.onkeypress = function(evt)
    {
        var keyChar = String.fromCharCode(evt.charCode);
        if (keyChar == "q")
        {
            _this.onQuietToggle();
            return;
        }
        if (keyChar == "F")
        {
            console.log("F pressed");
            _this.onFullscreenRequested();
        }
    }

	document.onkeydown = function(evt) 
	{
		//console.log(evt);

		if (evt.keyCode == 75) // 'k'
		{
			if (_this.isKeyboardNavigationAllowed())
			{
				if (m_keyboardActive)
					m_keyboardActive = false;
				else
					m_keyboardActive = true;

				_this.onKeyboardNavigationStatus(m_keyboardActive);
			}
			return;
		}
		
		if (evt.keyCode == 83) // s
		{
			_this.onSyncToggle();
			return;
		}

		if (evt.keyCode == 68 /* d */ && m_shiftPressed)
		{
			if (!isSlightLoggingEnabled())
			{
				setSlightLogging(true);
				slightLog("LOGGING ENABLED");
			}
			else
			{
				slightLog("LOGGING DISABLED");
				setSlightLogging(false);
			}
		}
		
		if (evt.keyCode == 107 /* + */ || evt.keyCode == 73 /* i */ )
		{
			_this._onZoom(1);
			return;
		}

		if (evt.keyCode == 109 /* - */ || evt.keyCode == 79 /* o */ )
		{
			_this._onZoom(-1);
			return;
		}

		if (evt.keyCode == 16)
		{
			m_shiftPressed = true;
			return;
		}

		if (m_keyboardActive && _this.isKeyboardNavigationAllowed())
		{
			switch (evt.keyCode) 
			{
			case 35: // End
				_this.onKeyEnd();
				evt.preventDefault();
				return;
			case 36: // Home
				_this.onKeyHome();
				evt.preventDefault();
				return;
			case 33: // PgUp
			case 37: // Left
				_this.onKeyPrevious();
				evt.preventDefault();
				return;
			case 34: // PgDn
			case 39: // Right
				_this.onKeyNext();
				evt.preventDefault();
				return;
			}
		}
        else
        {
            var inList = function(c, l)
            {
                for (var i = 0 ; i < l.length ; i++)
                {
                    if (l[i] == c)
                        return true;
                }
                return false;
            }

            if (inList(evt.keyCode, [ 35, 36, 33, 37, 34, 39 ]))
            {
                setTimeout(function() { _this.onNavigationIgnored(); }, 0);
            }
        }
	}

	Hammer(cnvs, { swipe_velocity: 0.05 }).on("swipeleft", function() { _this.onKeyNext(); });
	Hammer(cnvs, { swipe_velocity: 0.05 }).on("swiperight", function() { _this.onKeyPrevious(); });
}

