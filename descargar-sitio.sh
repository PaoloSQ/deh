#!/bin/bash

SITE="https://www.dehonline.es/"
OUTPUT_DIR="descarga"

echo "Descargando $SITE en la carpeta $OUTPUT_DIR..."

rm -rf "$OUTPUT_DIR"

wget \
    --mirror \
    --page-requisites \
    --html-extension \
    --convert-links \
    --restrict-file-names=windows \
    --no-parent \
    --domains dehonline.es,static.wixstatic.com,cdn-www.wix.com \
    --no-clobber \
    --random-wait \
    --limit-rate=200k \
    -e robots=off \
    -U mozilla \
    -p \
    -r \
    -k \
    -K \
    -E \
    --span-hosts \
    --domains dehonline.es \
    -np \
    -l 10 \
    -P "$OUTPUT_DIR" \
    "$SITE"

echo "Descarga completada. Los archivos están en la carpeta $OUTPUT_DIR"
