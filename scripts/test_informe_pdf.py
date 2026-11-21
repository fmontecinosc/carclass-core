"""Pruebas del informe PDF del cliente (plantilla app/informe-tasacion.js renderizada con Chromium).

Para cada payload: 2 páginas A4, texto seleccionable, cada comparable con su enlace clicable a la URL guardada,
sin campos internos de NOM en el texto ni en los metadatos, y sin contenido desbordado fuera de la página.
Uso: python3 scripts/test_informe_pdf.py tests/fixtures/*.json
"""
import json, pathlib, subprocess, sys, tempfile
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from informe_pdf import render
from pypdf import PdfReader

PROHIBIDO = ["precio_compra", "precio_toma", "margen", "utilidad", "comision", "comisión", "interna", "negociaci",
             "pretendido", "estadisticas", "peso", "lead scoring"]

def check(path):
    payload = json.load(open(path, encoding="utf-8"))
    out = tempfile.mktemp(suffix=".pdf")
    render(payload, out)
    r = PdfReader(out)
    fallas = []
    if len(r.pages) != 2: fallas.append(f"{len(r.pages)} páginas (se esperan 2)")
    for p in r.pages:
        w, h = float(p.mediabox.width), float(p.mediabox.height)
        if abs(w - 595.3) > 2 or abs(h - 841.9) > 2: fallas.append(f"tamaño {w}x{h} no es A4")
    texto = "\n".join(p.extract_text() or "" for p in r.pages)
    meta = json.dumps({k: str(v) for k, v in (r.metadata or {}).items()})
    for palabra in PROHIBIDO:
        if palabra in texto.lower() or palabra in meta.lower(): fallas.append(f"aparece '{palabra}'")
    if payload["folio"] not in texto: fallas.append("no aparece el folio")
    links = [a.get_object()["/A"]["/URI"] for p in r.pages for a in (p.get("/Annots") or []) if a.get_object().get("/A", {}).get("/URI")]
    esperadas = [c["url"] for c in payload["comparables"]]
    if sorted(links) != sorted(esperadas): fallas.append(f"enlaces {len(links)} ≠ comparables {len(esperadas)} o URL distinta")
    for c in payload["comparables"]:
        precio = "$" + f"{c['precio']:,}".replace(",", ".")
        if precio not in texto: fallas.append(f"no aparece el precio {precio}")
    pub = "$" + f"{payload['valores']['precio_publicacion']:,}".replace(",", ".")
    if texto.count(pub) < 2: fallas.append("el precio de publicación no aparece en ambas páginas")
    # desborde: el último bloque de cada página debe quedar sobre el pie
    html = subprocess.run(["node", "-e", "const I=require(process.argv[1]);process.stdout.write(I.documento(JSON.parse(require('fs').readFileSync(0,'utf8')),{base:''}))",
                           str(pathlib.Path(__file__).parent.parent / "app" / "informe-tasacion.js")], input=json.dumps(payload), capture_output=True, text=True, check=True).stdout
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path="/usr/bin/google-chrome"); pg = b.new_page()
        tmp = pathlib.Path(__file__).parent.parent / 'app' / '_test_informe.html'; tmp.write_text(html, encoding='utf-8'); pg.goto(tmp.as_uri()); pg.evaluate('document.fonts.ready'); tmp.unlink()
        over = pg.evaluate("""() => [...document.querySelectorAll('.nomr-pg')].map(p => { const body = p.querySelector('.nomr-body'), foot = p.querySelector('.nomr-foot');
            const last = [...body.children].pop(), pb = p.getBoundingClientRect().bottom;
            return foot.getBoundingClientRect().bottom > pb + 1 || last.getBoundingClientRect().bottom > foot.getBoundingClientRect().top + 1; })""")
        b.close()
    if any(over): fallas.append(f"contenido desbordado en página(s) {[i + 1 for i, o in enumerate(over) if o]}")
    pathlib.Path(out).unlink(missing_ok=True)
    return fallas

if __name__ == "__main__":
    total = 0
    for f in sys.argv[1:]:
        fallas = check(f)
        total += len(fallas)
        print(("OK   " if not fallas else "FALLA") + f"  {pathlib.Path(f).name}" + ("" if not fallas else "\n       - " + "\n       - ".join(fallas)))
    sys.exit(1 if total else 0)
