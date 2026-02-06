// loader.js — загрузка и распаковка .wasm.gz и .data.gz

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
    script.async = false;  // важно: синхронная загрузка
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Не удалось загрузить скрипт ${src}`));
    document.head.appendChild(script);
  });
}

async function startGame() {
  const status = document.getElementById("status") || document.body;
  status.innerHTML = "Загрузка и распаковка файлов... (10–40 сек)";

  try {
    // 1. Распаковываем файлы
    const wasmBuffer = await fetchGz("Stingracer-HTML5-Shipping.wasm.gz");
    console.log("WASM распакован");

    let dataBuffer = null;
    try {
      dataBuffer = await fetchGz("Stingracer-HTML5-Shipping.data.gz");
      console.log("Data распакован");
    } catch (e) {
      console.log("Файл .data.gz не найден, продолжаем без него");
    }

    // 2. Загружаем основной UE4 скрипт (он создаст Module и FS)
    await loadScript("Stingracer-HTML5-Shipping.UE4.js");
    console.log("UE4 скрипт загружен");

    // 3. Ждём, пока Module и FS будут готовы (UE4 сам их создаёт)
    await new Promise(resolve => {
      const check = () => {
        if (window.Module && window.Module.FS && window.Module.FS.createDataFile) {
          resolve();
        } else {
          setTimeout(check, 100);  // проверяем каждые 100 мс
        }
      };
      check();
    });
    console.log("Module.FS готов");

    // 4. Создаём виртуальные файлы
    Module.FS.createPath("/", "data", true, true);
    Module.FS.createDataFile("/", "Stingracer-HTML5-Shipping.wasm", new Uint8Array(wasmBuffer), true, false);

    if (dataBuffer) {
      Module.FS.createDataFile("/", "Stingracer-HTML5-Shipping.data", new Uint8Array(dataBuffer), true, false);
    }

    // 5. Запускаем игру (вызываем то, что обычно делает UE4)
    Module.callMain(Module.arguments || []);  // или Module._main() — зависит от экспорта
    // Если у UE4 другой способ запуска — замени на него (часто Module.ccall("main", "v", [], []);)

    status.innerHTML = "Игра запущена!";
  } catch (e) {
    console.error("Ошибка:", e);
    status.innerHTML = `<strong>Ошибка:</strong><br>${e.message}<br>Попробуйте обновить страницу.`;
  }
}

// Автозапуск
startGame();