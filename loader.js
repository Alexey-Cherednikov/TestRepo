// loader.js — загрузка и распаковка .wasm.gz и .data.gz

async function fetchGz(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Ошибка загрузки ${url}: ${resp.status}`);

  const compressed = await resp.arrayBuffer();

  const ds = new DecompressionStream("gzip");
  const stream = new Response(compressed).body.pipeThrough(ds);
  return await new Response(stream).arrayBuffer();
}

async function startGame() {
  const status = document.getElementById("status") || document.body;
  status.innerHTML = "Загрузка и распаковка файлов... (10–40 сек)";

  try {
    // 1. Распаковываем .wasm.gz
    const wasmBuffer = await fetchGz("Stingracer-HTML5-Shipping.wasm.gz");
    console.log("WASM распакован");

    // 2. Распаковываем .data.gz (если есть)
    let dataBuffer = null;
    try {
      dataBuffer = await fetchGz("Stingracer-HTML5-Shipping.data.gz");
      console.log("Data распакован");
    } catch (e) {
      console.log("Файл .data.gz не найден, продолжаем без него");
    }

    // 3. Загружаем основной UE4 скрипт
    const ueScript = document.createElement("script");
    ueScript.src = "Stingracer-HTML5-Shipping.UE4.js";
    ueScript.async = false;
    document.head.appendChild(ueScript);

    // Ждём загрузки скрипта
    await new Promise(resolve => ueScript.onload = resolve);
    console.log("UE4 скрипт загружен");

    // 4. Подменяем WASM (Module['wasmDownloadAction'])
    Module['wasmDownloadAction'] = Promise.resolve({ wasmBytes: new Uint8Array(wasmBuffer) });

    // 5. Подменяем .data (Module['preloadedPackages'])
    if (dataBuffer) {
      Module['preloadedPackages'] = {};
      Module['preloadedPackages'][Module.locateFile('Stingracer-HTML5-Shipping.data')] = new Uint8Array(dataBuffer);
    }

    // 6. Ждём, пока UE4 сам запустит всё (Downloading(), postRun и т.д.)
    await new Promise(resolve => {
      const check = () => {
        if (Module['wasmInstantiateActionResolve'] && Module['preloadedPackages']) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
    console.log("UE4 Module готов");

    // 7. Запускаем игру (если нужно вручную — UE4 сам запускает postRun)
    // Если не стартует — добавь Module.callMain([]); или Module._main();
    // Но в твоём коде UE4 запускается автоматически через Downloading()

    status.innerHTML = "Игра запущена!";
  } catch (e) {
    console.error("Ошибка:", e);
    status.innerHTML = `<strong>Ошибка:</strong><br>${e.message}<br>Обновите страницу.`;
  }
}

// Автозапуск
startGame();