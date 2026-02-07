import http.server
import socketserver
import webbrowser
import os

# Настройки
PORT = 8000  # Порт для сервера
INDEX_FILE = "index.html"  # Имя HTML-файла
def run_server():
    os.chdir("D:/Unreal_stuff/Projects/TestRepo")  # Перейти в папку проекта
    handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Сервер запущен: http://localhost:{PORT}/{INDEX_FILE}")
        webbrowser.open(f"http://localhost:{PORT}/{INDEX_FILE}")
        httpd.serve_forever()
if __name__ == "__main__":
    run_server()


