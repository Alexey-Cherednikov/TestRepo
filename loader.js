// loader.js

async function fetchGz(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Ошибка загрузки ${url}: ${resp.status}`);

  const compressed = await resp.arrayBuffer();

  const ds = new DecompressionStream("gzip");
  const stream = new Response(compressed).body.pipeThrough(ds);
  return await new Response(stream).arrayBuffer();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.head.appendChild(script);
  });
}

async function startGame() {
  const status = document.getElementById("status") || document.body;
  status.innerHTML = "Загрузка и распаковка файлов... (10–40 сек)";

  try {
    const wasmBuffer = await fetchGz("Stingracer-HTML5-Shipping.wasm.gz");
    console.log("WASM распакован");

    let dataBuffer = null;
    try {
      dataBuffer = await fetchGz("Stingracer-HTML5-Shipping.data.gz");
      console.log("Data распакован");
    } catch (e) {
      console.log("Нет .data.gz, продолжаем");
    }

    await loadScript("Stingracer-HTML5-Shipping.UE4.js");
    console.log("UE4 скрипт загружен");

    // Ждём, пока UE4 создаст Module
    await new Promise(resolve => {
      const check = () => {
        if (window.Module) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
    console.log("Module создан");

    // Подменяем wasm и data
    Module['wasmDownloadAction'] = Promise.resolve({ wasmBytes: new Uint8Array(wasmBuffer) });

    if (dataBuffer) {
      Module['preloadedPackages'] = {};
      Module['preloadedPackages'][Module.locateFile('Stingracer-HTML5-Shipping.UE4.data')] = new Uint8Array(dataBuffer);
    }

    // Запускаем игру
    Module.callMain(Module.arguments || []);
    console.log("callMain выполнен");

    status.innerHTML = "Игра запущена!";
  } catch (e) {
    console.error("Ошибка:", e);
    status.innerHTML = `<strong>Ошибка:</strong><br>${e.message}`;
  }
}

// Автозапуск
startGame();