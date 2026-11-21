"""Genera el PDF del informe de tasación NOM para el cliente a partir del payload de lista blanca.

Uso:  python3 scripts/informe_pdf.py payload.json salida.pdf [--borrador]
El payload es exactamente lo que devuelve public.tasacion_publica(token) o nom.payload_cliente(id).
Renderiza con Chromium (Playwright) la misma plantilla que usa la app (app/informe-tasacion.js).
"""
import json, pathlib, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

APP = pathlib.Path(__file__).resolve().parent.parent / "app"

def render(payload: dict, out: str, borrador: bool = False, chrome: str = "/usr/bin/google-chrome"):
    js = (APP / "informe-tasacion.js").as_posix()
    node = ("const I=require(%s);const d=JSON.parse(require('fs').readFileSync(0,'utf8'));"
            "process.stdout.write(I.documento(d,{logo:'img/nom-logo.png',base:'',borrador:%s}))") % (json.dumps(js), "true" if borrador else "false")
    html = subprocess.run(["node", "-e", node], input=json.dumps(payload), capture_output=True, text=True, check=True).stdout
    with tempfile.NamedTemporaryFile("w", suffix=".html", dir=APP, delete=False, encoding="utf-8") as f:
        f.write(html); tmp = pathlib.Path(f.name)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=chrome)
            pg = b.new_page()
            pg.goto(tmp.as_uri()); pg.wait_for_load_state("networkidle"); pg.evaluate("document.fonts.ready")
            pg.pdf(path=out, format="A4", print_background=True, prefer_css_page_size=True, margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})
            b.close()
    finally:
        tmp.unlink(missing_ok=True)

if __name__ == "__main__":
    render(json.load(open(sys.argv[1], encoding="utf-8")), sys.argv[2], "--borrador" in sys.argv)
    print("PDF:", sys.argv[2])
