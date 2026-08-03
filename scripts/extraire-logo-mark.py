"""Extrait uniquement les 4 barres de assets/vista-logo.png (qui sont sur un
fond carre blanc a coins arrondis noirs, sans alpha) pour produire un logo a
fond transparent utilisable sur n'importe quel fond (assets/images/vista-logo-mark.png).

Seuil de chroma (max(r,g,b)-min(r,g,b)) plutot qu'un seuil de luminosite :
le fond blanc ET le lisere anti-aliase du cadre arrondi noir ont tous les deux
un chroma proche de 0, alors que les 4 barres colorees (y compris la barre
gris pale) ont un chroma nettement superieur.
"""

from PIL import Image

SRC = "assets/vista-logo.png"
DEST = "assets/images/vista-logo-mark.png"
CHROMA_THRESHOLD = 10
PADDING = 24
TARGET_HEIGHT = 256

im = Image.open(SRC).convert("RGBA")
px = im.load()
w, h = im.size

for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if max(r, g, b) - min(r, g, b) <= CHROMA_THRESHOLD:
            px[x, y] = (r, g, b, 0)

bbox = im.getbbox()
if bbox is None:
    raise SystemExit("Aucun contenu detecte - verifier CHROMA_THRESHOLD")

x0, y0, x1, y1 = bbox
x0 = max(0, x0 - PADDING)
y0 = max(0, y0 - PADDING)
x1 = min(w, x1 + PADDING)
y1 = min(h, y1 + PADDING)
recadre = im.crop((x0, y0, x1, y1))

ratio = TARGET_HEIGHT / recadre.height
redimensionne = recadre.resize(
    (round(recadre.width * ratio), TARGET_HEIGHT), Image.LANCZOS
)
redimensionne.save(DEST)
print(f"bbox={bbox} taille_finale={redimensionne.size} -> {DEST}")
