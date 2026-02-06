// ======== функция отключения звука и остановки игры на паузу ====================================================
(function() {
    const OriginalAudioContext = window.AudioContext;
    window.AudioContext = function(...args) {
        //console.log("Перехват AudioContext");
        let audioCtx = new OriginalAudioContext(...args);

        function pauseGame() {
            if (typeof Module !== "undefined" && Module.pauseMainLoop) {
                Module.pauseMainLoop();
                audioCtx.suspend().catch(err => console.log("Ошибка при suspend():", err));
            }
        }

        function resumeGame() {
            if (typeof Module !== "undefined" && Module.resumeMainLoop) {
                Module.resumeMainLoop();
                audioCtx.resume().catch(err => console.log("Ошибка при resume():", err));
            }
        }

        document.addEventListener("visibilitychange", function() {
            if (document.hidden) {
                pauseGame();
            } else {
                resumeGame();
            }
        });

        // Делаем pauseGame и resumeGame глобальными, если их нужно вызывать ещё где-то
        window.pauseGame = pauseGame;
        window.resumeGame = resumeGame;

        return audioCtx;
    };
})();



// ================================================================================
// ================================================================================
window.AudioContext = ( window.AudioContext || window.webkitAudioContext || null );
if ( AudioContext ) {
	var ue4_hacks = {}; // making this obvious...
	ue4_hacks.ctx = new AudioContext();
	ue4_hacks.panner = ue4_hacks.ctx.createPanner();
	ue4_hacks.panner.__proto__.setVelocity = ( ue4_hacks.panner.__proto__.setVelocity || function(){} );
}

// ================================================================================
// ================================================================================
// project configuration

const requiredWebGLVersion = 1;
const targetOffscreenCanvas = false;
const explicitlyUseWebGL1 = (location.search.indexOf('webgl1') != -1);
const serveCompressedAssets = false;
console.log("Emscripten version: 1.38.31");
console.log("Emscripten configuration: ");




// ================================================================================
// *** HTML5 emscripten ***

var Module = {
	// state management
	infoPrinted: false,
	lastcurrentDownloadedSize: 0,
	totalDependencies: 0,
	assetDownloadProgress: {}, // Track how many bytes of each needed asset has been downloaded so far.

};

// ================================================================================
// *** HTML5 UE4 ***

Module.arguments = ['../../../AtTheGate/AtTheGate.uproject','-stdout',];

// UE4 Editor or UE4 Frontend with assets "cook on the fly"?
if (location.host != "" && (location.search.indexOf('cookonthefly') != -1)) {
	Module.arguments.push("'-filehostIp=" + location.protocol + "//" + location.host + "'");
}


var UE4 = {
	on_fatal: function() {
		try {
			UE4.on_fatal = Module.cwrap('on_fatal', null, ['string', 'string']);
		} catch(e) {
			UE4.on_fatal = function() {};
		}
	},
};

// ----------------------------------------
// UE4 error and logging

function addLog(info, color) {
	$("#logwindow").append("<h4><small>" + info + " </small></h4>");
}
Module.print = addLog;

Module.printErr = function(text) {
	console.error(text);
};

window.onerror = function(e) {
	e = e.toString();
	if (e.toLowerCase().indexOf('memory') != -1) {
		e += '<br>';
		if (!heuristic64BitBrowser) e += ' Try running in a 64-bit browser to resolve.';
	}
	showErrorDialog(e);
}


// ----------------------------------------
// ----------------------------------------
// detect wasm-threads
 function detectWasmThreads() {
	return WebAssembly.validate(new Uint8Array([
		0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60,
		0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x05, 0x04, 0x01, 0x03, 0x01, 0x01,
		0x0a, 0x0b, 0x01, 0x09, 0x00, 0x41, 0x01, 0xfe, 0x10, 0x02, 0x00, 0x1a,
		0x0b
	]));
}

Module['UE4_MultiThreaded'] = false && detectWasmThreads();


// ================================================================================
// ================================================================================
// emscripten memory system

// Tests if type === 'browser' or type === 'os' is 64-bit or not.
function heuristicIs64Bit(type) {
	function contains(str, substrList) { for(var i in substrList) if (str.indexOf(substrList[i]) != -1) return true; return false; }
	var ua = (navigator.userAgent + ' ' + navigator.oscpu + ' ' + navigator.platform).toLowerCase();
	if (contains(ua, ['wow64'])) return type === 'os'; // 32bit browser on 64bit OS
	if (contains(ua, ['x86_64', 'amd64', 'ia64', 'win64', 'x64', 'arm64', 'irix64', 'mips64', 'ppc64', 'sparc64'])) return true;
	if (contains(ua, ['i386', 'i486', 'i586', 'i686', 'x86', 'arm7', 'android', 'mobile', 'win32'])) return false;
	if (contains(ua, ['intel mac os'])) return true;
	return false;
}
var heuristic64BitBrowser = heuristicIs64Bit('browser');


// ================================================================================
// WebGL

Module['preinitializedWebGLContext'] = null;

Module['canvas'] = document.getElementById('canvas');

function getGpuInfo() {
	var gl = Module['preinitializedWebGLContext'];
	if (!gl) return '(no GL: ' + Module['webGLErrorReason'] + ')';

	var glInfo = '';
	var debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
	if (debugInfo) glInfo += gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) + ' ' + gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) + '/';
	glInfo += gl.getParameter(gl.VENDOR) + ' ' + gl.getParameter(gl.RENDERER);
	glInfo += ' ' + gl.getParameter(gl.VERSION);
	glInfo += ', ' + gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
	if (Module['softwareWebGL']) glInfo += ' (software)';
	return glInfo;
}

function detectWebGL() {
	var canvas = targetOffscreenCanvas ? document.createElement("canvas") : (Module['canvas'] || document.createElement("canvas"));
	// If you run into problems with WebGL 2, or for quick testing purposes, you can disable UE4
	// from using WebGL 2 and revert back to WebGL 1 by setting the following flag to true.
	var disableWebGL2 = false;
	if (explicitlyUseWebGL1) {
		disableWebGL2 = true;
		console.log('Disabled WebGL 2 as requested by ?webgl1 GET param.');
	}
	var names = ["webgl", "experimental-webgl"];
	if (disableWebGL2) {
		WebGL2RenderingContext = undefined;
	} else {
		names = ["webgl2"].concat(names);
	}
	function testError(e) { Module['webGLErrorReason'] = e.statusMessage; };
	canvas.addEventListener("webglcontextcreationerror", testError, false);
	try {
		for(var failIfMajorPerformanceCaveat = 1; failIfMajorPerformanceCaveat >= 0; --failIfMajorPerformanceCaveat) {
			for(var i in names) {
				try {
					var context = canvas.getContext(names[i], {antialias:false,alpha:false,depth:true,stencil:true,failIfMajorPerformanceCaveat:!!failIfMajorPerformanceCaveat});
					Module['preinitializedWebGLContext'] = context;
					Module['softwareWebGL'] = !failIfMajorPerformanceCaveat;
					if (context && typeof context.getParameter == "function") {
						if (typeof WebGL2RenderingContext !== 'undefined' && context instanceof WebGL2RenderingContext && names[i] == 'webgl2') {
							return 2;
						} else {
							// We were able to precreate only a WebGL 1 context, remove support for WebGL 2 from the rest of the page execution.
							WebGL2RenderingContext = undefined;
							return 1;
						}
					}
				} catch(e) { Module['webGLErrorReason'] = e.toString(); }
			}
		}
	} finally {
		canvas.removeEventListener("webglcontextcreationerror", testError, false);
		if ( targetOffscreenCanvas ) {
			delete 'canvas';
		}
	}
	return 0;
}

// ------------------------------------------------------
// canvas - scaling
// ------------------------------------------------------
var canvasWindowedScaleMode = 1 /*STRETCH*/;
var canvasWindowedUseHighDpi = true;
var canvasAspectRatioWidth = 1366;
var canvasAspectRatioHeight = 768;

function resizeCanvas(aboutToEnterFullscreen) {
    var minimumCanvasHeightCssPixels = 280;
    var minimumCanvasHeightFractionOfBrowserWindowHeight = 1;

    var mainArea = document.getElementById('mainarea');
    if (!mainArea) {
        console.error('mainArea не найден!');
        return;
    }

    var canvasRect = mainArea.getBoundingClientRect();
    var cssWidth = canvasRect.right - canvasRect.left;
    var cssHeight = Math.max(minimumCanvasHeightCssPixels, window.innerHeight * minimumCanvasHeightFractionOfBrowserWindowHeight);

    if (canvasWindowedScaleMode == 3 /*NONE*/) {
        var newRenderTargetWidth = canvasAspectRatioWidth;
        var newRenderTargetHeight = canvasAspectRatioHeight;
    } else {
        var newRenderTargetWidth = canvasWindowedUseHighDpi ? (cssWidth * window.devicePixelRatio) : cssWidth;
        var newRenderTargetHeight = canvasWindowedUseHighDpi ? (cssHeight * window.devicePixelRatio) : cssHeight;

        if (canvasWindowedScaleMode == 2 /*ASPECT*/) {
            if (cssWidth * canvasAspectRatioHeight > canvasAspectRatioWidth * cssHeight) {
                newRenderTargetWidth = newRenderTargetHeight * canvasAspectRatioWidth / canvasAspectRatioHeight;
            } else {
                newRenderTargetHeight = newRenderTargetWidth * canvasAspectRatioHeight / canvasAspectRatioWidth;
            }
        }

        newRenderTargetWidth = Math.round(newRenderTargetWidth);
        newRenderTargetHeight = Math.round(newRenderTargetHeight);
    }

    cssWidth = canvasWindowedUseHighDpi ? (newRenderTargetWidth / window.devicePixelRatio) : newRenderTargetWidth;
    cssHeight = canvasWindowedUseHighDpi ? (newRenderTargetHeight / window.devicePixelRatio) : newRenderTargetHeight;

    _emscripten_set_canvas_element_size(Module['canvas'].id, newRenderTargetWidth, newRenderTargetHeight);
    Module['canvas'].style.width = cssWidth + 'px';
    Module['canvas'].style.height = cssHeight + 'px';

    if (UE_JSlib?.UE_CanvasSizeChanged) UE_JSlib.UE_CanvasSizeChanged();
}
Module['UE4_resizeCanvas'] = resizeCanvas;

//--ожидание окружения-------
function waitForEnvironment(callback) {
    function checkReady() {
        if (document.readyState === 'complete' && typeof Module !== 'undefined' && Module['canvas']) {
			Module['onRuntimeInitialized'] = function(){
			callback();
			}
        } else {
            setTimeout(checkReady, 100);
        }
    }
    checkReady();
}

function initializeResizeObserver() {
    const mainArea = document.getElementById('mainarea');
    if (!mainArea) {
        console.error('mainArea не найден для ResizeObserver');
        return;
    }

    const resizeObserver = new ResizeObserver(() => {
        console.log('Size mainArea change');
        resizeCanvas();
    });

    resizeObserver.observe(mainArea);
}

waitForEnvironment(() => {
    initializeResizeObserver();
    window.addEventListener('resize', () => {
        console.log('Window size change');
        resizeCanvas();
    });
    resizeCanvas(); // Начальный вызов
});


// ----------------------------------------

Module['UE4_keyEvent'] = function(eventType, key, virtualKeyCode, domPhysicalKeyCode, keyEventStruct) { return 0; }
Module['UE4_mouseEvent'] = function(eventType, x, y, button, buttons, mouseEventStruct) { return 0; }
Module['UE4_wheelEvent'] = function(eventType, x, y, button, buttons, deltaX, deltaY, wheelEventStruct) { return 0; }


// ----------------------------------------
// ----------------------------------------
// canvas - fullscreen
Module['UE4_fullscreenScaleMode'] = 1;//canvasWindowedScaleMode; // BUG: if using FIXED, fullscreen gets some strange padding on margin...
Module['UE4_fullscreenCanvasResizeMode'] = canvasWindowedUseHighDpi ? 2/*HIDPI*/ : 1/*Standard DPI*/;
Module['UE4_fullscreenFilteringMode'] = 0;



// ================================================================================
// ================================================================================

function formatBytes(bytes) {
	if (bytes >= 1024*1024*1024) return (bytes / (1024*1024*1024)).toFixed(1) + ' GB';
	if (bytes >= 1024*1024) return (bytes / (1024*1024)).toFixed(0) + ' MB';
	if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
	return bytes + ' B';
}


function fetchOrDownloadAndStore( url, responseType) {
    return new Promise(function(resolve, reject) {
        return download(url, responseType)
        .then(function(data) {
            return resolve(data);
        })
        .catch(function(error) {
            return reject(error);
        });
    });
}


// Module.locateFile() routes asset downloads to either gzip compressed or uncompressed assets.
Module.locateFile = function(name) {
	var serveGzipped = serveCompressedAssets;
	// When serving from file:// URLs, don't read .gz compressed files, because these files can't be transparently uncompressed.
	var isFileProtocol = name.indexOf('file://') != -1 || location.protocol.indexOf('file') != -1;
	if (isFileProtocol) {
		if (!Module['shownFileProtocolWarning']) {
			console.log('Attempting to load the page via the "file://" protocol. This only works in Firefox, and even there only when not using compression, so attempting to load uncompressed assets. Please host the page on a web server and visit it via a "http://" URL.');
			Module['shownFileProtocolWarning'] = true;
		}
		serveGzipped = false;
	}

	// uncompressing very large gzip files may slow down startup times.
//	if (!dataFileIsGzipCompressed && name.split('.').slice(-1)[0] == 'data') serveGzipped = false;

	return serveGzipped ? (name + 'gz') : name;
};

// see site/source/docs/api_reference/module.rst for details
Module.getPreloadedPackage = function(remotePackageName, remotePackageSize) {
	return Module['preloadedPackages'] ? Module['preloadedPackages'][remotePackageName] : null;
}


// ================================================================================
// COMPILER

// ----------------------------------------
// wasm

Module['instantiateWasm'] = function(info, receiveInstance) {
	Module['wasmDownloadAction'].then(function(downloadResults) {
		taskProgress(TASK_COMPILING);
		var wasmInstantiate = WebAssembly.instantiate(downloadResults.wasmModule || new Uint8Array(downloadResults.wasmBytes), info);
		return wasmInstantiate.then(function(output) {
			var instance = output.instance || output;
			var module = output.module;
			taskFinished(TASK_COMPILING);
			Module['wasmInstantiateActionResolve'](instance);
			receiveInstance(instance, module);

		});
	}).catch(function(error) {
		$ ('#mainarea').empty();
		$ ('#mainarea').append('<div class="alert alert-danger centered-axis-xy" style ="min-height: 10pt" role="alert">WebAssembly instantiation failed: <br> ' + error + '</div></div>');
	});
	return {};
}


// ----------------------------------------
// shaders

function compileShadersFromJson(jsonData) {
	var shaderPrograms = [];
	if (jsonData instanceof ArrayBuffer) jsonData = new TextDecoder('utf-8').decode(new DataView(jsonData));
	var programsDict = JSON.parse(jsonData);
	for(var i in programsDict) {
		shaderPrograms.push(programsDict[i]);
	}

	var gl = Module['preinitializedWebGLContext'];

	Module['precompiledShaders'] = [];
	Module['precompiledPrograms'] = [];

	Module['glIDCounter'] = 1;
	Module['precompiledUniforms'] = [null];

	var promise = new Promise(function(resolve, reject) {
		var nextProgramToBuild = 0;
		function buildProgram() {
			if (nextProgramToBuild >= shaderPrograms.length) {
				taskFinished(TASK_SHADERS);
				return resolve();
			}
			var p = shaderPrograms[nextProgramToBuild++];
			taskProgress(TASK_SHADERS, {current: nextProgramToBuild, total: shaderPrograms.length });
			var program = gl.createProgram();

			function lineNumberize(str) {
				str = str.split('\n');
				for(var i = 0; i < str.length; ++i) str[i] = (i<9?' ':'') + (i<99?' ':'') + (i+1) + ': ' + str[i];
				return str.join('\n');
			}

			var vs = gl.createShader(gl.VERTEX_SHADER);
			gl.shaderSource(vs, p.vs);
			gl.compileShader(vs);
			var success = gl.getShaderParameter(vs, gl.COMPILE_STATUS);
			var compileLog = gl.getShaderInfoLog(vs);
			if (compileLog) compileLog = compileLog.trim();
			if (compileLog) console.error('Compiling vertex shader: ' + lineNumberize(p.vs));
			if (!success) console.error('Vertex shader compilation failed!');
			if (compileLog) console.error('Compilation log: ' + compileLog);
			if (!success) return reject('Vertex shader compilation failed: ' + compileLog);
			gl.attachShader(program, vs);

			Module['precompiledShaders'].push({
				vs: p.vs,
				shader: vs,
				program: program
			});

			var fs = gl.createShader(gl.FRAGMENT_SHADER);
			gl.shaderSource(fs, p.fs);
			gl.compileShader(fs);
			var success = gl.getShaderParameter(fs, gl.COMPILE_STATUS);
			var compileLog = gl.getShaderInfoLog(fs);
			if (compileLog) compileLog = compileLog.trim();
			if (compileLog) console.error('Compiling fragment shader: ' + lineNumberize(p.fs));
			if (!success) console.error('Fragment shader compilation failed!');
			if (compileLog) console.error('Compilation log: ' + compileLog);
			if (!success) return reject('Fragment shader compilation failed: ' + compileLog);
			gl.attachShader(program, fs);

			Module['precompiledShaders'].push({
				fs: p.fs,
				shader: fs,
				program: program
			});

			for(var name in p.attribs) {
				gl.bindAttribLocation(program, p.attribs[name], name);
			}
			gl.linkProgram(program);
			var success = gl.getProgramParameter(program, gl.LINK_STATUS);
			var linkLog = gl.getProgramInfoLog(program);
			if (linkLog) linkLog = linkLog.trim();
			if (linkLog) console.error('Linking shader program, vs: \n' + lineNumberize(p.vs) + ', \n fs:\n' + lineNumberize(p.fs));
			if (!success) console.error('Shader program linking failed!');
			if (linkLog) console.error('Link log: ' + linkLog);
			if (!success) return reject('Shader linking failed: ' + linkLog);

			var ptable = {
				uniforms: {},
				maxUniformLength: 0,
				maxAttributeLength: -1,
				maxUniformBlockNameLength: -1
			};
			var GLctx = gl;
			var utable = ptable.uniforms;
				var numUniforms = GLctx.getProgramParameter(program, GLctx.ACTIVE_UNIFORMS);
				for (var i = 0; i < numUniforms; ++i) {
				var u = GLctx.getActiveUniform(program, i);
					var name = u.name;
					ptable.maxUniformLength = Math.max(ptable.maxUniformLength, name.length + 1);
					if (name.indexOf("]", name.length - 1) !== -1) {
					var ls = name.lastIndexOf("[");
					name = name.slice(0, ls);
					}
					var loc = GLctx.getUniformLocation(program, name);
					var id = Module['glIDCounter']++;
					utable[name] = [ u.size, id ];
					Module['precompiledUniforms'].push(loc);
					if (Module['precompiledUniforms'].length != Module['glIDCounter']) throw 'uniforms array not in sync! ' + Module['precompiledUniforms'].length + ', ' + Module['glIDCounter'];
					for (var j = 1; j < u.size; ++j) {
					var n = name + "[" + j + "]";
					loc = GLctx.getUniformLocation(program, n);
					id = Module['glIDCounter']++;
					Module['precompiledUniforms'].push(loc);
						if (Module['precompiledUniforms'].length != Module['glIDCounter']) throw 'uniforms array not in sync! ' + Module['precompiledUniforms'].length + ', ' + Module['glIDCounter'];
					}
				}

			var e = gl.getError();
			if (e) {
				console.error('Precompiling shaders got GL error: ' + e);
				return reject('Precompiling shaders got GL error: ' + e);
			}
			Module['precompiledPrograms'].push({
				program: program,
				programInfos: ptable,
				vs: p.vs,
				fs: p.fs
			});
				setTimeout(buildProgram, 0);
			}
		setTimeout(buildProgram, 0);
	})

	return promise;
}




// ================================================================================
// download project files and progress handlers

var TASK_DOWNLOADING = 0;
var TASK_COMPILING = 1;
var TASK_SHADERS = 2;
var TASK_MAIN = 3;
var loadTasks = [ 'Downloading', 'Compiling WebAssembly', 'Building shaders', 'Launching engine'];

function taskProgress(taskId, progress) {
	var c = document.getElementById('compilingmessage');
	if (c) c.style.display = 'block';
	else return;
	var l = document.getElementById('load_' + taskId);
	if (!l) {
		var tasks = document.getElementById('loadTasks');
		if (!tasks) return;
		l = document.createElement('div');
		l.innerHTML = '<span id="icon_' + taskId + '" class="glyphicon glyphicon-refresh glyphicon-spin"></span>  <span id="load_' + taskId + '"></span>';
		tasks.appendChild(l);
		l = document.getElementById('load_' + taskId);
	}
	if (!l.startTime) l.startTime = performance.now();
	var text = loadTasks[taskId];
	if (progress && progress.total) {
		text += ': ' + (progress.currentShow || progress.current) + '/' + (progress.totalShow || progress.total) + ' (' + (progress.current * 100 / progress.total).toFixed(0) + '%)';
	} else {
		text += '...';
	}
	l.innerHTML = text;
}

function taskFinished(taskId, error) {
	var l = document.getElementById('load_' + taskId);
	var icon = document.getElementById('icon_' + taskId);
	if (l && icon) {
		var totalTime = performance.now() - l.startTime;
		if (!error) {
			l.innerHTML = loadTasks[taskId] + ' (' + (totalTime/1000).toFixed(2) + 's)';
			icon.className = 'glyphicon glyphicon-ok';
		}
		else {
			l.innerHTML = loadTasks[taskId] + ': FAILED! ' + error;
			icon.className = 'glyphicon glyphicon-remove';

			showErrorDialog(loadTasks[taskId] + ' failed: <br> ' + error);
		}
	}
}

function reportDownloadProgress(url, downloadedBytes, totalBytes, finished) {
	Module['assetDownloadProgress'][url] = {
		current: downloadedBytes,
		total: totalBytes,
		finished: finished
	};
	var aggregated = {
		current: 0,
		total: 0,
		finished: true
	};
	for(var i in Module['assetDownloadProgress']) {
		aggregated.current += Module['assetDownloadProgress'][i].current;
		aggregated.total += Module['assetDownloadProgress'][i].total;
		aggregated.finished = aggregated.finished && Module['assetDownloadProgress'][i].finished;
	}

	aggregated.currentShow = formatBytes(aggregated.current);
	aggregated.totalShow = formatBytes(aggregated.total);

	if (aggregated.finished) taskFinished(TASK_DOWNLOADING);
	else taskProgress(TASK_DOWNLOADING, aggregated);
}

function download(url, responseType) {
	return new Promise(function(resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.responseType = responseType || 'blob';
		reportDownloadProgress(url, 0, 1);
		xhr.onload = function() {
			if (xhr.status == 0 || (xhr.status >= 200 && xhr.status < 300)) {
				var len = xhr.response.size || xhr.response.byteLength;
				reportDownloadProgress(url, len, len, true);
				resolve(xhr.response);
			} else {
				taskFinished(TASK_DOWNLOADING, 'HTTP error ' + (xhr.status || 404) + ' ' + xhr.statusText + ' on file ' + url);
				reject({
					status: xhr.status,
					statusText: xhr.statusText
				});
			}
		};
		xhr.onprogress = function(p) {
			if (p.lengthComputable) reportDownloadProgress(url, p.loaded, p.total);
		};
		xhr.onerror = function(e) {
			var isFileProtocol = url.indexOf('file://') == 0 || location.protocol.indexOf('file') != -1;
			if (isFileProtocol) taskFinished(TASK_DOWNLOADING, 'HTTP error ' + (xhr.status || 404) + ' ' + xhr.statusText + ' on file ' + url +'<br>Try using a web server to avoid loading via a "file://" URL.'); // Convert the most common source of errors to a more friendly message format.
			else taskFinished(TASK_DOWNLOADING, 'HTTP error ' + (xhr.status || 404) + ' ' + xhr.statusText + ' on file ' + url);
			reject({
				status: xhr.status || 404,
				statusText: xhr.statusText
			});
		};
		xhr.onreadystatechange = function() {
			if (xhr.readyState >= xhr.HEADERS_RECEIVED) {
				if (url.endsWith('gz') && (xhr.status == 0 || xhr.status == 200)) {
					if (xhr.getResponseHeader('Content-Encoding') != 'gzip') {
						// A fallback is to set serveCompressedAssets = false to serve uncompressed assets instead, but that is not really recommended for production use, since gzip compression shrinks
						// download sizes so dramatically that omitting it for production is not a good idea.
						taskFinished(TASK_DOWNLOADING, 'Downloaded a compressed file ' + url + ' without the necessary HTTP response header "Content-Encoding: gzip" specified!<br>Please configure gzip compression on this asset on the web server to serve gzipped assets!');
						xhr.onload = xhr.onprogress = xhr.onerror = xhr.onreadystatechange = null; // Abandon tracking events from this XHR further.
						xhr.abort();
						return reject({
							status: 406,
							statusText: 'Not Acceptable'
						});
					}

					// After enabling Content-Encoding: gzip, make sure that the appropriate MIME type is being used for the asset, i.e. the MIME
					// type should be that of the uncompressed asset, and not the MIME type of the compression method that was used.
					if (xhr.getResponseHeader('Content-Type').toLowerCase().indexOf('zip') != -1) {
						function expectedMimeType(url) {
							if (url.indexOf('.wasm') != -1) return 'application/wasm';
							if (url.indexOf('.js') != -1) return 'application/javascript';
							return 'application/octet-stream';
						}
						taskFinished(TASK_DOWNLOADING, 'Downloaded a compressed file ' + url + ' with incorrect HTTP response header "Content-Type: ' + xhr.getResponseHeader('Content-Type') + '"!<br>Please set the MIME type of the asset to "' + expectedMimeType(url) + '".');
						xhr.onload = xhr.onprogress = xhr.onerror = xhr.onreadystatechange = null; // Abandon tracking events from this XHR further.
						xhr.abort();
						return reject({
							status: 406,
							statusText: 'Not Acceptable'
						});
					}
				}
			}
		}
		xhr.send(null);
	});
}




// ================================================================================
// ================================================================================
// UE4 DEFAULT UX TEMPLATE

function showErrorDialog(errorText) {
	var existingErrorDialog = document.getElementById('errorDialog');
	if (existingErrorDialog) {
		existingErrorDialog.innerHTML += '<br>' + errorText;
	} else {
console.log("Something went wrong");
	}
}


// Given a blob, asynchronously reads the byte contents of that blob to an arraybuffer and returns it as a Promise.
function readBlobToArrayBuffer(blob) {
	return new Promise(function(resolve, reject) {
		var fileReader = new FileReader();
		fileReader.onload = function() { resolve(this.result); }
		fileReader.onerror = function(e) { reject(e); }
		fileReader.readAsArrayBuffer(blob);
	});
}

function addScriptToDom(scriptCode) {
	return new Promise(function(resolve, reject) {
		var script = document.createElement('script');
		var blob = (scriptCode instanceof Blob) ? scriptCode : new Blob([scriptCode], { type: 'text/javascript' });
		var objectUrl = URL.createObjectURL(blob);
		script.src = objectUrl;
		script.onload = function() {
			script.onload = script.onerror = null; // Remove these onload and onerror handlers, because these capture the inputs to the Promise and the input function, which would leak a lot of memory!
			URL.revokeObjectURL(objectUrl); // Free up the blob. Note that for debugging purposes, this can be useful to comment out to be able to read the sources in debugger.
			resolve();
		}
		script.onerror = function(e) {
			script.onload = script.onerror = null; // Remove these onload and onerror handlers, because these capture the inputs to the Promise and the input function, which would leak a lot of memory!
			URL.revokeObjectURL(objectUrl);
			console.error('script failed to add to dom: ' + e);
			console.error(scriptCode);
			console.error(e);
			reject(e.message || "(out of memory?)");
		}
		document.body.appendChild(script);
	});
}


// ----------------------------------------
// ----------------------------------------
// Startup task which is run after UE4 engine has launched.

function postRunEmscripten() {
	taskFinished(TASK_MAIN);

	Browser.updateCanvasDimensions = function() {};
	Browser.setCanvasSize = function() {};


	// Configure the size of the canvas and display it.
	resizeCanvas();
	Module['canvas'].style.display = 'block';

	// Whenever the browser window size changes, relayout the canvas size on the page.
	window.addEventListener('resize', resizeCanvas, false);
	window.addEventListener('orientationchange', resizeCanvas, false);

	// The following is needed if game is within an iframe - main window already has focus...
	window.focus();
}
Module.postRun = [postRunEmscripten];


// ----------------------------------------
// ----------------------------------------
// MAIN

document.addEventListener("DOMContentLoaded", function( ) {

	// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
	// Deduce which version to load up.
	var supportsWasm = (typeof WebAssembly === 'object' && typeof WebAssembly.Memory === 'function');
	if (!supportsWasm) {
		showErrorDialog('Your browser does not support WebAssembly. Please try updating to latest 64-bit browser that supports WebAssembly.<br>Current user agent: ' + navigator.userAgent);
		return;
	}

	// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
	// memory heap
//	if (!Module['buffer']) {
//		showErrorDialog('Failed to allocate ' + MB(MIN_MEMORY) + ' of linear memory for the WebAssembly heap!');
//		return;
//	}

	// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
	// check for webgl and cache it for later (UE_BrowserWebGLVersion() reads this)
	Module['WEBGL_VERSION'] = detectWebGL();
	console.log(getGpuInfo());
	if (!Module['WEBGL_VERSION'] || Module['WEBGL_VERSION'] < requiredWebGLVersion) {
		showErrorDialog('Your browser does not support WebGL ' + requiredWebGLVersion + '<br>Error reason: ' + (Module['webGLErrorReason'] || 'Unknown') + '. Try updating your browser and/or graphics card drivers.<br>Current renderer: ' + getGpuInfo());
		return;
	}

	function shouldBrowserSupportWebGL2() {
		var match = window.navigator.userAgent.match(/Firefox\/([0-9]+)\./);
		if (match) return parseInt(match[1]) >= 51;
	}

	if (Module['WEBGL_VERSION'] < 2 && !explicitlyUseWebGL1) {
		if (shouldBrowserSupportWebGL2()) {
			console.log('Your GPU does not support WebGL 2. This affects graphics performance and quality. Please try updating your graphics driver and/or browser to latest version.<br>Error reason: ' + (Module['webGLErrorReason'] || 'Unknown') + '<br>Current renderer: ' + getGpuInfo());
		} else {
			console.log('The current browser does not support WebGL 2. This affects graphics performance and quality.<br>Please try updating your browser (and/or video drivers).  NOTE: old hardware might have been blacklisted by this browser -- you may need to use a different browser.<br>Error reason: ' + (Module['webGLErrorReason'] || 'Unknown') + '<br>Current renderer: ' + getGpuInfo());
		}
	}

	if (typeof OffscreenCanvas === 'undefined' && targetOffscreenCanvas) {
		console.log('This is an experimental UE4 build that uses OffscreenCanvas, but your browser does not seem to support it. Try out Firefox Nightly or Chrome Canary, and in Firefox, set pref gfx.offscreencanvas.enabled;true in about:config, and on Chrome Canary, Enable "Experimental canvas features" in chrome://flags. Continuing without OffscreenCanvas, but performance can be severely affected, and rendering might not look correct.');
	}

	// The following WebGL 1.0 extensions are available in core WebGL 2.0 specification, so they are no longer shown in the extensions list.
	var webGLExtensionsInCoreWebGL2 = ['ANGLE_instanced_arrays','EXT_blend_minmax','EXT_color_buffer_half_float','EXT_frag_depth','EXT_sRGB','EXT_shader_texture_lod','OES_element_index_uint','OES_standard_derivatives','OES_texture_float','OES_texture_half_float','OES_texture_half_float_linear','OES_vertex_array_object','WEBGL_color_buffer_float','WEBGL_depth_texture','WEBGL_draw_buffers'];

	var supportedWebGLExtensions = Module['preinitializedWebGLContext'].getSupportedExtensions();
	if (Module['WEBGL_VERSION'] >= 2) supportedWebGLExtensions = supportedWebGLExtensions.concat(webGLExtensionsInCoreWebGL2);

	// The following WebGL extensions are required by UE4/this project, and it cannot run without.
	var requiredWebGLExtensions = []; // TODO: List WebGL extensions here that the demo needs and can't run without.
	for(var i in requiredWebGLExtensions) {
		if (supportedWebGLExtensions.indexOf(requiredWebGLExtensions[i]) == -1) {
			showErrorDialog('Your browser does not support WebGL extension ' + requiredWebGLExtensions[i] + ', which is required to run this page!');
		}
	}

	// The following WebGL extensions would be preferred to exist for best features/performance, but are not strictly needed and UE4 can fall back if not available.
	var preferredToHaveWebGLExtensions = [// The following are core in WebGL 2:
	                                      'ANGLE_instanced_arrays', // UE4 uses instanced rendering where possible, but can fallback to noninstanced.
	                                      'EXT_color_buffer_half_float',
	                                      'EXT_sRGB',
	                                      'EXT_shader_texture_lod', // textureLod() is needed for correct reflections, without this reflection shaders are missing and render out black.
	                                      'OES_standard_derivatives',
	                                      'OES_texture_half_float',
	                                      'OES_texture_half_float_linear',
	                                      'OES_vertex_array_object',
	                                      'WEBGL_color_buffer_float',
	                                      'WEBGL_depth_texture',
	                                      'WEBGL_draw_buffers',

	                                      // These are still extensions in WebGL 2:
	                                      'OES_texture_float',
	                                      'WEBGL_compressed_texture_s3tc',
	                                      'EXT_texture_filter_anisotropic'
	];
	var unsupportedWebGLExtensions = [];
	for(var i in preferredToHaveWebGLExtensions) {
		if (supportedWebGLExtensions.indexOf(preferredToHaveWebGLExtensions[i]) == -1) {
			unsupportedWebGLExtensions.push(preferredToHaveWebGLExtensions[i]);
		}
	}
	if (unsupportedWebGLExtensions.length > 1) {
		console.log('Your browser or graphics card does not support the following WebGL extensions: ' + unsupportedWebGLExtensions.join(', ') + '. This can impact UE4 graphics performance and quality.');
	} else if (unsupportedWebGLExtensions.length == 1) {
		console.log('Your browser or graphics card does not support the WebGL extension ' + unsupportedWebGLExtensions[0] + '. This can impact UE4 graphics performance and quality.');
	}

	if (targetOffscreenCanvas) {
		Module['preinitializedWebGLContext'] = null; // TODO: Currently can't preinitialize a context when OffscreenCanvas is used.
	}

	// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
	// browser 64bit vs 32bit check
	if (!heuristicIs64Bit('browser')) {
		if (heuristicIs64Bit('os')) {
			console.log('It looks like you are running a 32-bit browser on a 64-bit operating system. This can dramatically affect performance and risk running out of memory on large applications. Try updating to a 64-bit browser for an optimized experience.');
		} else {
			console.log('It looks like your computer hardware is 32-bit. This can dramatically affect performance.');
		}
	}

	// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
	// files to download/cache
	function Downloading() {

		// ----------------------------------------
		// ----------------------------------------
		// WASM
		var mainCompiledCode = download(Module.locateFile('AtTheGate-HTML5-Shipping.wasm'), 'arraybuffer').then(function(wasmBytes) {
    	return { wasmBytes: wasmBytes };
		});
		Module['wasmDownloadAction'] = mainCompiledCode;
		var compiledCodeInstantiateAction = new Promise(function(resolve, reject) {
    	Module['wasmInstantiateActionResolve'] = resolve;
    	Module['wasmInstantiateActionReject'] = reject;
		});
		// ----------------------------------------
		// MAIN JS
		var mainJsDownload = fetchOrDownloadAndStore(Module.locateFile('AtTheGate-HTML5-Shipping.js'), 'blob').then(function(data) {
				Module['mainScriptUrlOrBlob'] = data;
				return addScriptToDom(data).then(function() {
					addRunDependency('wait-for-compiled-code');
				});
			});

		// ----------------------------------------
		// MORE JS
		var dataJsDownload = fetchOrDownloadAndStore( Module.locateFile('AtTheGate-HTML5-Shipping.data.js'));
		var utilityJsDownload = fetchOrDownloadAndStore( Module.locateFile('Utility.js')).then(addScriptToDom);
		var dataDownload =

		// Instead as a fallback, download as ArrayBuffer. (TODO: Figure out the bugs with the above, and switch to using that one instead)
			fetchOrDownloadAndStore( Module.locateFile('AtTheGate-HTML5-Shipping.data'), 'arraybuffer').then(function(dataArrayBuffer) {
				Module['preloadedPackages'] = {};
				Module['preloadedPackages'][Module.locateFile('AtTheGate-HTML5-Shipping.data')] = dataArrayBuffer;
				return dataJsDownload.then(addScriptToDom);
			});

		// ----------------------------------------
		// SHADERS
		const precompileShaders = false; // Currently not enabled.
		if (precompileShaders) {
			var compileShaders = fetchOrDownloadAndStore( Module.locateFile('shaders.json'), 'arraybuffer')
			.then(function(json) {
				return compileShadersFromJson(json)
				.catch(function(error) {
					taskFinished(TASK_SHADERS, error + '<br>Current renderer: ' + getGpuInfo());
					throw 'Shader compilation failed';
				});
			});
		} else {
			var compileShaders = true; // Not precompiling shaders, no-op Promise action.
		}

		// ----------------------------------------
		// WAIT FOR DOWNLOADS AND COMPILES
		Promise.all([mainCompiledCode, mainJsDownload, dataJsDownload, utilityJsDownload, dataDownload, compiledCodeInstantiateAction, compileShaders]).then(function() {
			if (!precompileShaders) {
				Module['precompiledShaders'] = Module['precompiledPrograms'] = Module['preinitializedWebGLContext'] = Module['glIDCounter'] = Module['precompiledUniforms'] = null;
			}
			taskProgress(TASK_MAIN);
			removeRunDependency('wait-for-compiled-code'); // Now we are ready to call main()
		
		//=========Hide loading screen====
		const loadingScreen = document.getElementById('loading-screen')			
		loadingScreen.style.opacity = "0";
		setTimeout(() => loadingScreen.style.display = "none", 1000); 
		});
	};

	// GO !	// ----------------------------------------

	Downloading();
});

// === Russian keys binding + focus canvas ===
function waitForEnvironment(callback) {
    function checkReady() {
        if (document.readyState === 'complete' && typeof Module !== 'undefined' && Module['canvas']) {
            callback();
        } else {
            setTimeout(checkReady, 100);
        }
    }
    checkReady();
}

waitForEnvironment(() => {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;

    // Set Focus
    canvas.setAttribute('tabindex', '0');
    canvas.addEventListener('mousedown', () => canvas.focus(), { once: true }); // First Click

    const activeKeys = new Set();

    const keyMap = {
        'KeyW': { ru: ['ц', 'Ц'], en: 'W' },
        'KeyA': { ru: ['ф', 'Ф'], en: 'A' },
        'KeyS': { ru: ['ы', 'Ы'], en: 'S' },
        'KeyD': { ru: ['в', 'В'], en: 'D' }
    };

    const handleKey = (type, event) => {
        const map = keyMap[event.code];
        if (!map || !map.ru.includes(event.key)) return;

        if (type === 'keydown') {
            if (activeKeys.has(event.code)) return;
            activeKeys.add(event.code);
        } else {
            activeKeys.delete(event.code);
        }

        const synthetic = new KeyboardEvent(type, {
            key: map.en,
            code: event.code,
            bubbles: true,
            cancelable: true
        });
        canvas.dispatchEvent(synthetic);
        event.preventDefault();
        event.stopPropagation();
    };

    canvas.addEventListener('keydown', e => handleKey('keydown', e), true);
    canvas.addEventListener('keyup', e => handleKey('keyup', e), true);

    // Блокировка UE4 обработки русских букв
    Module['UE4_keyEvent'] = (type, key) =>
        ['ц','Ц','ф','Ф','ы','Ы','в','В'].includes(key) ? 5 : 0;
});
