#!/usr/bin/env python3
"""Copie documentation/rapport-final.md vers README.md (racine du dépôt).

Le rapport utilise des liens relatifs au dossier documentation/ ; le README est
à la racine. Les liens et les images sont donc réécrits pour rester valides :
  - captures/x.png       -> documentation/captures/x.png
  - architecture.md      -> documentation/architecture.md
  - ../deploiement/...   -> deploiement/...
  - liens http(s) et ancres (#...) inchangés

Usage, depuis la racine du dépôt :  python3 documentation/sync-readme.py
"""
import re
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
RAPPORT = RACINE / "documentation" / "rapport-final.md"
README = RACINE / "README.md"

ENTETE = (
    "<!-- Copie de documentation/rapport-final.md, générée par "
    "documentation/sync-readme.py : modifier le rapport, puis relancer le script. -->\n\n"
)


def reecrire(m: re.Match) -> str:
    texte, cible = m.group(1), m.group(2)
    if cible.startswith(("http://", "https://", "#", "mailto:")):
        return m.group(0)
    if cible.startswith("../"):
        return f"[{texte}]({cible[3:]})"
    return f"[{texte}](documentation/{cible})"


def main() -> None:
    contenu = RAPPORT.read_text(encoding="utf-8")
    contenu = re.sub(r"\[([^\]]*)\]\(([^)\s]+)\)", reecrire, contenu)
    README.write_text(ENTETE + contenu, encoding="utf-8")

    # Contrôle : chaque lien local du README doit pointer vers un fichier existant
    manquants = [
        cible
        for cible in re.findall(r"\]\(([^)#\s]+)(?:#[^)]*)?\)", contenu)
        if not cible.startswith(("http://", "https://", "mailto:"))
        and not (RACINE / cible).exists()
    ]
    if manquants:
        raise SystemExit("Liens cassés dans le README : " + ", ".join(sorted(set(manquants))))
    print(f"README.md mis à jour depuis {RAPPORT.relative_to(RACINE)} (liens vérifiés)")


if __name__ == "__main__":
    main()
