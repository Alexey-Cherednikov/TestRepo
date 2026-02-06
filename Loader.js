// loader.js — распаковка .wasm.gz и .data.gz одной функцией

async function loadGz(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Ошибка загрузки ${url}`);

  const compressed = await resp.arrayBuffer();

  const ds = new DecompressionStream("gzip");
  const stream = new Response(compressed).body.pipeThrough(ds);
  return await new Response(stream).arrayBuffer();
}

// Основная функция — вызывается одной строкой
async function startGame() {
  document.body.innerHTML = "<h1>Загрузка...</h1><p>Распаковка файлов (10–40 сек)</p>";

  try {
    const wasmBuffer = await loadGz("Stingracer-HTML5-Shipping.UE4.wasm.gz");
    const dataBuffer = await loadGz("Stingracer-HTML5-Shipping.UE4.data.gz");

    // Передаём распакованные файлы в UE4 loader (как будто это обычные файлы)
    window.Module = {
      preRun: [],
      postRun: [],
      print: console.log,
      printErr: console.error,
      canvas: document.getElementById("canvas") || document.body.appendChild(document.createElement("canvas")),
      setStatus: (text) => { document.body.innerHTML += `<p>${text}</p>`; },
      monitorRunDependencies: () => {}
    };

    // Создаём виртуальные файлы в Emscripten FS
    FS.createPath("/", "data", true, true);
    FS.createDataFile("/", "Stingracer-HTML5-Shipping.UE4.wasm", new Uint8Array(wasmBuffer), true, false);
    FS.createDataFile("/", "Stingracer-HTML5-Shipping.UE4.data", new Uint8Array(dataBuffer), true, false);

    // Запускаем оригинальный загрузчик UE4
    await loadScript("Stingracer-HTML5-Shipping.UE4.js");

    document.body.innerHTML = "<h1>Готово!</h1>";
  } catch (e) {
    console.error(e);
    document.body.innerHTML = `<h1>Ошибка</h1><p>${e.message}</p>`;
  }
}

// Вспомогательная функция для загрузки скрипта
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Автозапуск
startGame();